/**
 * A virtual clock for frame-exact capture, injected before any page script runs (Playwright addInitScript).
 *
 * setTimeout / setInterval / requestAnimationFrame / performance.now / Date.now are replaced by a clock that only
 * moves when the capture script calls `window.__vclock.step(ms)`. Timers fire in due order at their exact virtual
 * time, with the microtask queue (and React's MessageChannel work) drained after each callback, so chained
 * `await sleep(...)` choreography keeps its real timing however long a screenshot takes. CSS animations are paused
 * and seeked to the virtual time; framer-motion is kept on its JS driver (Element.prototype.animate is removed) so
 * it reads the same clock. Every howler `play()` the app makes is logged with its virtual time, sound name, rate and
 * volume, so the film can place its own sound effects on the app's events.
 */
(() => {
  const W = window
  if (W.__vclock) return
  const realSetTimeout = W.setTimeout.bind(W)
  const realPerfNow = performance.now.bind(performance)
  const realDateNow = Date.now.bind(Date)
  const perf0 = realPerfNow()
  const epoch0 = realDateNow()
  let vnow = 0
  let seq = 0
  let rafSeq = 0
  const timers = new Map()
  let rafs = new Map()
  const events = []
  const byId = new Map()

  W.setTimeout = function (fn, ms, ...args) {
    const id = ++seq
    timers.set(id, { due: vnow + Math.max(0, Number(ms) || 0), fn, args })
    return id
  }
  W.setInterval = function (fn, ms, ...args) {
    const id = ++seq
    const iv = Math.max(4, Number(ms) || 0)
    timers.set(id, { due: vnow + iv, fn, args, interval: iv })
    return id
  }
  W.clearTimeout = (id) => void timers.delete(id)
  W.clearInterval = (id) => void timers.delete(id)
  W.requestAnimationFrame = (cb) => {
    const id = ++rafSeq
    rafs.set(id, cb)
    return id
  }
  W.cancelAnimationFrame = (id) => void rafs.delete(id)
  performance.now = () => perf0 + vnow
  Date.now = () => epoch0 + Math.floor(vnow)
  // framer-motion uses WAAPI when Element.prototype owns `animate`; without it, it animates on rAF (our clock)
  try { delete Element.prototype.animate } catch { /* ignore */ }

  const chan = new MessageChannel()
  const waiting = []
  chan.port1.onmessage = () => waiting.shift()?.()
  const drain = () => new Promise((r) => { waiting.push(r); chan.port2.postMessage(0) })
  const idle = () => new Promise((r) => realSetTimeout(r, 0))

  // howler: log every play with its virtual time; the six synthesised sounds differ by length
  const SOUNDS = { tick: 0.07, snap: 0.16, whoosh: 0.4, thud: 0.5, chime: 1.5, stamp: 0.22 }
  const nameOf = (src) => {
    const s = Array.isArray(src) ? src[0] : src
    if (typeof s !== 'string') return 'unknown'
    const b64 = s.slice(s.indexOf(',') + 1)
    const bytes = (b64.length * 3) / 4 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0)
    const secs = (bytes - 44) / 2 / 44100
    let best = 'unknown'
    let d = Infinity
    for (const [k, v] of Object.entries(SOUNDS)) if (Math.abs(v - secs) < d) { d = Math.abs(v - secs); best = k }
    return best
  }
  const patchHowl = () => {
    const H = W.Howl
    if (!H || H.prototype.__vclock) return
    H.prototype.__vclock = true
    const play = H.prototype.play
    const rate = H.prototype.rate
    const volume = H.prototype.volume
    H.prototype.play = function (...a) {
      const id = play.apply(this, a)
      if (a.length === 0 || typeof a[0] === 'string') {
        const ev = { t: vnow, name: nameOf(this._src), rate: 1, volume: this._volume ?? 1 }
        events.push(ev)
        if (typeof id === 'number') byId.set(id, ev)
      }
      return id
    }
    H.prototype.rate = function (...a) {
      if (a.length === 2 && byId.has(a[1]) && typeof a[0] === 'number') byId.get(a[1]).rate = a[0]
      return rate.apply(this, a)
    }
    H.prototype.volume = function (...a) {
      if (a.length === 2 && byId.has(a[1]) && typeof a[0] === 'number') byId.get(a[1]).volume = a[0]
      return volume.apply(this, a)
    }
  }

  // CSS animations and transitions: pause on sight, then seek to the virtual time
  const seen = new WeakMap()
  const seekAnimations = () => {
    let list = []
    try { list = document.getAnimations() } catch { return }
    for (const a of list) {
      let rec = seen.get(a)
      if (!rec) {
        rec = { born: vnow, from: Number(a.currentTime) || 0 }
        seen.set(a, rec)
        try { a.pause() } catch { /* ignore */ }
      }
      const t = rec.from + (vnow - rec.born) * (a.playbackRate || 1)
      const end = a.effect?.getComputedTiming?.().endTime
      try {
        if (Number.isFinite(end) && t >= end) a.finish()
        else a.currentTime = t
      } catch { /* ignore */ }
    }
  }

  let markT = null
  W.__vclock = {
    now: () => vnow,
    events,
    mark: () => { markT = vnow; return vnow },
    markAt: () => markT,
    patchHowl,
    async step(ms) {
      patchHowl()
      const target = vnow + ms
      for (let guard = 0; guard < 5000; guard++) {
        let nextId = -1
        let next = null
        for (const [id, t] of timers) if (t.due <= target && (!next || t.due < next.due || (t.due === next.due && id < nextId))) { next = t; nextId = id }
        if (!next) break
        vnow = Math.max(vnow, next.due)
        if (next.interval) next.due += next.interval
        else timers.delete(nextId)
        try { typeof next.fn === 'function' ? next.fn(...next.args) : (0, eval)(String(next.fn)) } catch (e) { console.error(e) }
        await drain()
      }
      vnow = target
      const cbs = rafs
      rafs = new Map()
      const ts = perf0 + vnow
      for (const cb of cbs.values()) { try { cb(ts) } catch (e) { console.error(e) } }
      await drain()
      seekAnimations()
      await drain()
      await idle()
      await drain()
      return vnow
    },
  }
})()

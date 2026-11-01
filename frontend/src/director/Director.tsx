import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { SheetView, type SheetHandle } from '../components/SheetView'
import { SourceLegend } from '../components/SourceLegend'
import { Tally } from '../components/Tally'
import { useConfirm, useDirectorScenes, useRun } from '../lib/api'
import { isRasterSheet, sheetById } from '../lib/model'
import { play, warmUpSound } from '../lib/sound'
import type { Run, Scene, SceneId } from '../lib/types'
import { Lockup } from '../components/Brand'
import { baseline } from './baseline'
import { DirectorContext, PANEL_MARGIN, PANEL_TOP, homeRect, setDir, useDir, type DirectorApi, type Slots } from './core'
import { sceneAvailable } from './data'
import { Bill } from './scenes/Bill'
import { Callback } from './scenes/Callback'
import { Colour } from './scenes/Colour'
import { Drop } from './scenes/Drop'
import { Eye } from './scenes/Eye'
import { Gauge } from './scenes/Gauge'
import { Hedge } from './scenes/Hedge'
import { Wake } from './scenes/Wake'

const SCENES: Record<SceneId, ComponentType> = { drop: Drop, wake: Wake, eye: Eye, hedge: Hedge, colour: Colour, gauge: Gauge, bill: Bill, callback: Callback }

export default function Director() {
  const run = useRun()
  const scenes = useDirectorScenes()
  if (!run.data || !scenes.data) return null
  return <Shell run={run.data} raw={scenes.data} />
}

const params = () => new URLSearchParams(window.location.search)
const hashScene = () => window.location.hash.match(/scene=([a-z]+)/)?.[1]

function Shell({ run, raw }: { run: Run; raw: Scene[] }) {
  const scenes = useMemo(() => raw.filter((s) => s.id in SCENES && sceneAvailable(run, s)), [raw, run])
  const auto = params().get('auto') === '1'
  const hold = params().get('hold') === '1'
  const confirm = useConfirm()

  const [state, setState] = useState(() => {
    const want = hashScene()
    const i = want ? scenes.findIndex((s) => s.id === want) : auto ? 0 : -1
    if (i >= 0) useDir.setState(baseline(run, scenes, i))
    return { idx: i, take: 0 }
  })
  const { idx, take } = state
  const scene = idx >= 0 ? scenes[idx] : undefined

  const goTo = useCallback((i: number) => {
    if (i < 0 || i >= scenes.length) return
    useDir.setState(baseline(run, scenes, i))
    setState((s) => ({ idx: i, take: s.take + 1 }))
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#scene=${scenes[i].id}`)
  }, [run, scenes])

  const gateRef = useRef<(() => void) | null>(null)
  const sheetRef = useRef<SheetHandle>(null)
  const [slots, setSlots] = useState<Slots>({ sheet: null, screen: null, html: null, panel: null, stage: null })
  const slot = useCallback(<K extends keyof Slots>(k: K) => (el: Slots[K]) => setSlots((s) => (s[k] === el ? s : { ...s, [k]: el })), [])
  const slotSet = useMemo(() => ({ sheet: slot('sheet'), screen: slot('screen'), html: slot('html'), panel: slot('panel'), stage: slot('stage') }), [slot])

  // keys: space = next scene, shift+space / ← = previous, R = retake, Enter = the highlighted action
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      warmUpSound()
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'PageDown') {
        e.preventDefault()
        if (e.shiftKey) goTo(Math.max(0, idx - 1))
        else goTo(idx + 1)
      } else if (e.code === 'ArrowLeft' || e.code === 'PageUp') {
        goTo(Math.max(0, idx - 1))
      } else if (e.code === 'KeyR' && idx >= 0) {
        goTo(idx)
      } else if (e.code === 'Enter') {
        gateRef.current?.()
      }
    }
    const onDown = () => warmUpSound()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [goTo, idx])

  useEffect(() => {
    const onHash = () => {
      const i = scenes.findIndex((s) => s.id === hashScene())
      if (i >= 0 && i !== idx) goTo(i)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [goTo, idx, scenes])

  const api: DirectorApi | null = useMemo(() => (scene ? {
    run, scene, scenes, auto,
    sheet: () => sheetRef.current,
    slots,
    gate: (signal, autoMs = 1600) => new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = () => {
        if (timer) clearTimeout(timer)
        gateRef.current = null
        resolve()
      }
      gateRef.current = finish
      if (auto) timer = setTimeout(finish, autoMs)
      signal.addEventListener('abort', () => {
        if (timer) clearTimeout(timer)
        gateRef.current = null
        reject(new DOMException('aborted', 'AbortError'))
      })
    }),
    release: () => gateRef.current?.(),
    confirm: (itemId: string) => {
      const it = run.items.find((i) => i.item_id === itemId)
      if (it && !it.confirmed) confirm.mutate(it)
    },
    done: () => {
      if (auto && !hold) setTimeout(() => goTo(idx + 1), 2200)
    },
  } : null), [scene, run, scenes, auto, slots, confirm, hold, goTo, idx])

  const dir = useDir()
  const sheet = dir.sheetId ? sheetById(run, dir.sheetId) : undefined
  const Comp = scene ? SCENES[scene.id] : null
  const panelW = dir.panelW

  return (
    <div className="absolute inset-0 select-none overflow-hidden bg-chrome">
      {/* the sheet */}
      <motion.div className="absolute inset-0" initial={false} animate={{ opacity: dir.showSheet && sheet ? 1 : 0, y: dir.showSheet ? 0 : 24 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
        {sheet && (
          <SheetView ref={sheetRef} sheet={sheet} width={1920} height={1080} homeRect={homeRect(panelW)} raster={isRasterSheet(run, sheet)}
            looks={dir.looks[sheet.sheet_id]} tagSize={dir.tagSize} underlayMode={dir.underlay} pour={dir.pour} onView={(v) => setDir({ view: v })}
            overlay={() => <g ref={slotSet.screen} />} html={() => <div ref={slotSet.html} className="absolute inset-0" />}>
            {() => <g ref={slotSet.sheet} />}
          </SheetView>
        )}
      </motion.div>

      {/* top band: name and tag left, the colour code right */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[84px] border-b border-white/[0.04] bg-chrome/95 backdrop-blur-sm" />
      <div className="pointer-events-none absolute left-10 right-10 top-[26px] flex items-center justify-between">
        <motion.div className="flex items-center gap-4" initial={false} animate={{ opacity: idx >= 0 ? 1 : 0 }}>
          <Lockup size={36} />
          <span className="ml-3 text-[28px] font-light text-mute">synthetic drawing · answer key in repo</span>
        </motion.div>
        <motion.div initial={false} animate={{ opacity: dir.showSheet ? 1 : 0 }} transition={{ duration: 0.4 }}>
          <SourceLegend size={28} />
        </motion.div>
      </div>

      {/* the right panel */}
      <motion.div className="absolute overflow-hidden rounded-[22px] border border-line bg-[#171a1f] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
        style={{ top: PANEL_TOP, right: PANEL_MARGIN, bottom: 40, width: panelW || 600 }}
        initial={false} animate={{ x: panelW ? 0 : (panelW || 600) + 80, opacity: panelW ? 1 : 0 }} transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}>
        <div ref={slotSet.panel} className="h-full" />
      </motion.div>

      {/* the corner tally */}
      <motion.div className="pointer-events-none absolute bottom-10 left-10" initial={false}
        animate={{ opacity: dir.tallyMode !== 'hidden' && dir.showSheet && dir.tally.length ? 1 : 0, y: dir.tallyMode !== 'hidden' && dir.showSheet ? 0 : 20 }} transition={{ duration: 0.35 }}>
        <Tally rows={dir.tallyMode === 'compact' ? dir.tally.slice(0, 1) : dir.tally} size={32} />
      </motion.div>

      {/* a full-stage layer for scenes that own the frame */}
      {/* the api reads refs lazily (in scene effects), never during render */}
      {/* eslint-disable-next-line react/refs */}
      <div ref={slotSet.stage} className="pointer-events-none absolute inset-0" />

      {/* eslint-disable-next-line react/refs */}
      {api && Comp && (
        <DirectorContext.Provider value={api}>
          <Comp key={`${scene!.id}-${take}`} />
        </DirectorContext.Provider>
      )}

      {idx < 0 && <Ready onStart={() => { warmUpSound(); play('tick'); goTo(0) }} count={scenes.length} name={run.package.name} />}
    </div>
  )
}

function Ready({ onStart, count, name }: { onStart: () => void; count: number; name: string }) {
  return (
    <button onClick={onStart} className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center">
      <Lockup size={84} />
      <div className="text-[28px] text-mute">{name}</div>
      <div className="mt-6 rounded-full border border-line px-6 py-2.5 text-[28px] text-soft">space to start · {count} scenes</div>
    </button>
  )
}

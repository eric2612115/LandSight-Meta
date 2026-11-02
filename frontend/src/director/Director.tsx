/** Director mode (`?director=1`): the film played on the real screens. Space = next scene, shift+space / ← =
 * previous, R = retake, Enter = the pulsed control. `&auto=1` plays through, `&hold=1` stays on one scene,
 * `#scene=eye` jumps to a scene, `&mute=1` silences, `&captions=0` hides the burned-in line. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAskAction, useFlagActions } from '../app/actions'
import { caption, clearShow } from '../app/show'
import { useNav, wide } from '../app/state'
import { useDirectorScenes, useResolvedSource } from '../lib/api'
import { sleep as wait } from '../lib/format'
import { play, warmUpSound } from '../lib/sound'
import type { Run, Scene, SceneId } from '../lib/types'
import { SCENES, SCENE_ORDER, SCENE_TITLE, sceneAvailable, type Ctx } from './scenes'

const params = () => new URLSearchParams(window.location.search)
const hashScene = () => window.location.hash.match(/scene=([a-z]+)/)?.[1]

/** The API's scene pointers in the film's order, with the new ask scene before the callback. */
export function sceneList(run: Run, raw: Scene[]): Scene[] {
  return SCENE_ORDER.map((id) => raw.find((s) => s.id === id) ?? ({ id, title: SCENE_TITLE[id], duration_s: 12 } as Scene))
    .filter((s) => sceneAvailable(run, s.id as SceneId, s))
}

export default function Director({ run }: { run: Run }) {
  const raw = useDirectorScenes()
  if (!raw.data) return null
  return <Play run={run} raw={raw.data} />
}

function Play({ run, raw }: { run: Run; raw: Scene[] }) {
  const scenes = useMemo(() => sceneList(run, raw), [run, raw])
  const auto = params().get('auto') === '1'
  const hold = params().get('hold') === '1'
  const live = useResolvedSource() === 'live'
  const acts = useFlagActions(run)
  const apply = useAskAction(run)
  const actsRef = useRef({ acts, apply })
  useEffect(() => {
    actsRef.current = { acts, apply }
  })
  const [state, setState] = useState(() => {
    const want = hashScene()
    const i = want ? scenes.findIndex((s) => s.id === want) : auto ? 0 : -1
    return { idx: i, take: 0 }
  })
  const gateRef = useRef<(() => void) | null>(null)

  const goTo = (i: number) => {
    if (i < 0 || i >= scenes.length) return
    setState((s) => ({ idx: i, take: s.take + 1 }))
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#scene=${scenes[i].id}`)
  }
  const goRef = useRef(goTo)
  useEffect(() => {
    goRef.current = goTo
  })

  // run the scene once per (index, take)
  useEffect(() => {
    const { idx } = state
    if (idx < 0) {
      clearShow()
      wide(0)
      useNav.getState().go('open')
      caption(`Space to start · ${scenes.length} scenes · Enter presses the lit control`)
      return
    }
    const scene = scenes[idx]
    const ctl = new AbortController()
    const sleep = (ms: number) => wait(ms, ctl.signal)
    const ctx: Ctx = {
      run, scene, live, sleep, signal: ctl.signal,
      gate: (autoMs = 1600) => new Promise<void>((resolve, reject) => {
        let t: ReturnType<typeof setTimeout> | undefined
        const done = () => {
          if (t) clearTimeout(t)
          gateRef.current = null
          resolve()
        }
        gateRef.current = done
        if (auto) t = setTimeout(done, autoMs)
        ctl.signal.addEventListener('abort', () => {
          if (t) clearTimeout(t)
          gateRef.current = null
          reject(new DOMException('aborted', 'AbortError'))
        })
      }),
      confirm: (c) => actsRef.current.acts.confirm(c, { quiet: true }),
      apply: (a) => actsRef.current.apply(a as Parameters<typeof apply>[0]),
    }
    SCENES[scene.id as SceneId](ctx).then(
      () => {
        if (!ctl.signal.aborted && auto && !hold) setTimeout(() => !ctl.signal.aborted && goRef.current(idx + 1), 1800)
      },
      (e: unknown) => {
        if ((e as { name?: string })?.name !== 'AbortError') console.error(e)
      },
    )
    return () => ctl.abort()
    // a scene's choreography runs once per take
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      warmUpSound()
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'PageDown') {
        e.preventDefault()
        e.stopPropagation()
        if (state.idx < 0) play('tick')
        goRef.current(e.shiftKey ? Math.max(0, state.idx - 1) : state.idx + 1)
      } else if (e.code === 'ArrowLeft' || e.code === 'PageUp') {
        e.preventDefault()
        goRef.current(Math.max(0, state.idx - 1))
      } else if (e.code === 'KeyR' && state.idx >= 0) {
        goRef.current(state.idx)
      } else if (e.code === 'Enter' && gateRef.current) {
        e.preventDefault()
        e.stopPropagation()
        gateRef.current()
      }
    }
    const onDown = () => {
      warmUpSound()
      gateRef.current?.()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown)
    const onHash = () => {
      const i = scenes.findIndex((s) => s.id === hashScene())
      if (i >= 0 && i !== state.idx) goRef.current(i)
    }
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('hashchange', onHash)
    }
  }, [state.idx, scenes])

  return null
}

/** Light / dark. Three preferences cycle light → dark → system; the choice is kept in localStorage (`landsight.theme`),
 * `?theme=dark|light` in the address overrides it (the film's capture pins a theme), and `<html data-theme>` carries
 * the explicit choice — absent for "system", where index.css's `prefers-color-scheme` rule decides. index.html sets the
 * attribute before first paint with the same rule, so there is no flash. */
import { create } from 'zustand'

export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'landsight.theme'
const ORDER: ThemePref[] = ['light', 'dark', 'system']

export const isThemePref = (v: unknown): v is ThemePref => v === 'light' || v === 'dark' || v === 'system'

/** `?theme=dark|light` wins; else what this browser saved; else the system. */
export function readThemePref(search: string, stored: string | null | undefined): ThemePref {
  const q = new URLSearchParams(search).get('theme')
  if (q === 'dark' || q === 'light') return q
  return isThemePref(stored) ? stored : 'system'
}

export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme => (pref === 'system' ? (systemDark ? 'dark' : 'light') : pref)

export const nextThemePref = (pref: ThemePref): ThemePref => ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length]

/** `<html data-theme>`: set for an explicit choice, removed for the system. */
export function applyTheme(pref: ThemePref, root: Element | null = typeof document === 'undefined' ? null : document.documentElement) {
  if (!root) return
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

const media = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined)
const systemDark = () => media()?.matches ?? false

const stored = (): string | null => {
  try {
    return window.localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
}

type ThemeState = {
  pref: ThemePref
  /** what is on screen now */
  resolved: Theme
  setPref: (p: ThemePref) => void
  cycle: () => void
}

export const useTheme = create<ThemeState>((set, get) => {
  const pref = typeof window === 'undefined' ? 'system' : readThemePref(window.location.search, stored())
  return {
    pref,
    resolved: resolveTheme(pref, systemDark()),
    setPref: (p) => {
      try {
        window.localStorage.setItem(THEME_KEY, p)
      } catch {
        /* storage may be unavailable */
      }
      try {
        // the saved choice is the record from here on: an address that pinned a theme stops doing so
        const u = new URL(window.location.href)
        if (u.searchParams.has('theme')) {
          u.searchParams.delete('theme')
          window.history.replaceState(window.history.state, '', u)
        }
      } catch {
        /* no URL */
      }
      applyTheme(p)
      set({ pref: p, resolved: resolveTheme(p, systemDark()) })
    },
    cycle: () => get().setPref(nextThemePref(get().pref)),
  }
})

/** Apply the preference once the app starts and follow the system while the preference is "system". */
export function startTheme() {
  applyTheme(useTheme.getState().pref)
  media()?.addEventListener('change', (e) => useTheme.setState((s) => ({ resolved: resolveTheme(s.pref, e.matches) })))
}

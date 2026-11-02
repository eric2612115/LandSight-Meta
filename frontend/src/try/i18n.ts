/** Traditional Chinese on screen for /try (the EN / 中 toggle; the helper written for the desk's switch, used here
 * first). Eric's demo to an owner who reads no English. Two dictionaries, written by the
 * translator (src/i18n/README.md, scripts/i18n-extract.py): `zh-TW.ui.json` maps each exact English UI string (with
 * `{0}` placeholders where a value is printed into it) to its Chinese, and `zh-TW.data.json` maps English *templates*
 * of the backend's strings — check titles and reasons, fixes, file verdicts and reasons, item labels, sheet titles,
 * rule titles, ask answers — with numbers, ids, file names and quoted spans replaced by ordered `{n}` placeholders,
 * to Chinese templates. `t(s)` is the exact lookup; `td(s)` matches a string against the templates (the matcher is
 * built from each template once, the extractor's regex_of), carries the captured values into the Chinese template,
 * and gives the English back when nothing matches. Citation quotes, file names, ids and model names never go through
 * either. The language is kept in localStorage `landsight.lang`; `?lang=zh-TW|en` overrides; `en` is the default. */
import { create } from 'zustand'

export type Lang = 'en' | 'zh-TW'
export const LANG_KEY = 'landsight.lang'

export type Dict = Record<string, string>

/* ------------------------------------------------------------------ the dictionaries */

// a glob, not a plain import: the build stays green while a dictionary is still being written
const files = import.meta.glob<Dict>('../i18n/zh-TW.{ui,data}.json', { eager: true, import: 'default' })
let UI: Dict = files['../i18n/zh-TW.ui.json'] ?? {}
let DATA: Dict = files['../i18n/zh-TW.data.json'] ?? {}

/** Tests (and a future second language) set the dictionaries in hand. */
export function setDictionaries(d: { ui?: Dict; data?: Dict }) {
  if (d.ui) UI = d.ui
  if (d.data) DATA = d.data
  compiled = null
  cache.clear()
}
export const dictionaries = () => ({ ui: UI, data: DATA })

/* ------------------------------------------------------------------ the language */

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'zh-TW'

/** `?lang=zh-TW|en` wins (`zh`, `zh-tw`, `zh-Hant` count as zh-TW); else what this browser saved; else English. */
export function readLang(search: string, stored: string | null | undefined): Lang {
  const q = new URLSearchParams(search).get('lang')
  if (q) {
    const v = q.toLowerCase()
    if (v === 'en') return 'en'
    if (v === 'zh-tw' || v === 'zh' || v === 'zh-hant' || v === 'zh-hant-tw') return 'zh-TW'
  }
  return isLang(stored) ? stored : 'en'
}

export function applyLang(lang: Lang, root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement) {
  if (root) root.lang = lang
}

const stored = (): string | null => {
  try {
    return window.localStorage.getItem(LANG_KEY)
  } catch {
    return null
  }
}

type LangState = { lang: Lang; setLang: (l: Lang) => void; toggle: () => void }

export const useLang = create<LangState>((set, get) => ({
  lang: typeof window === 'undefined' ? 'en' : readLang(window.location.search, stored()),
  setLang: (lang) => {
    try {
      window.localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* storage may be unavailable */
    }
    try {
      // the saved choice is the record from here on: an address that pinned a language stops doing so
      const u = new URL(window.location.href)
      if (u.searchParams.has('lang')) {
        u.searchParams.delete('lang')
        window.history.replaceState(window.history.state, '', u)
      }
    } catch {
      /* no URL */
    }
    applyLang(lang)
    cache.clear()
    set({ lang })
  },
  toggle: () => get().setLang(get().lang === 'en' ? 'zh-TW' : 'en'),
}))

export const startLang = () => applyLang(useLang.getState().lang)

export const isZh = () => useLang.getState().lang === 'zh-TW'

/* ------------------------------------------------------------------ t: the UI strings */

const PLACEHOLDER = /\{(\d+)\}/g

/** The extractor's `fill`: `{n}` → values[n] (a missing value leaves the placeholder's text empty). */
export const fill = (template: string, values: readonly (string | number)[]) =>
  template.replace(PLACEHOLDER, (_, n: string) => String(values[Number(n)] ?? ''))

/** A UI string: its Chinese when the screen is in Chinese and the dictionary has it, else itself; `{0}`, `{1}` …
 * take the values given. */
export function t(s: string, ...values: (string | number)[]): string {
  const out = isZh() ? UI[s] ?? s : s
  return values.length ? fill(out, values) : out
}

/* ------------------------------------------------------------------ td: the data strings */

/** What one placeholder may hold when a template is matched back against an English string: the extractor's exact
 * tokens first (a number, an id, a file name, a date …), any text last (i18n-extract.py `_VALUE`, in JS syntax). */
const VALUE = [
  String.raw`\S+\.(?:dxf|pdf|xlsx|xls|zip|bak|pptx|png)\b`,
  String.raw`\b[0-9a-f]{12}\b`,
  String.raw`\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2})?)?`,
  String.raw`\bE\d{2}(?:\.\d+)?\b`,
  String.raw`\bP\d{3}(?:-P\d{3})?\b`,
  String.raw`\b[A-Z]{1,7}-\d+(?:\.\d+)?(?:-rev[A-Z]|-p\d+|-\d+)?\b`,
  String.raw`\bAR-[A-Z0-9]+\b|\bANSI\d+\b`,
  String.raw`(?<=\()[A-Z][A-Z0-9-]*(?=, confidence)|(?<=\()[A-Z]{2,3}(?=[,)])`,
  String.raw`(?<=\bRev )[A-Z](?![A-Za-z])`,
  String.raw`\b1:\d+\b`,
  String.raw`\b[A-Z]{1,2}\d+:[A-Z]{1,2}\d+\b`,
  String.raw`\b[HW]\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\b`,
  String.raw`\b[A-Z][A-Z0-9]+(?: [A-Z][A-Z0-9.]*)+\b`,
  String.raw`(?<![A-Za-z0-9_])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e-?\d+)?`,
  String.raw`.+?`,
].join('|')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type Template = { key: string; zh: string; re: RegExp; n: number; literals: string[] }

/** The extractor's `regex_of`: the matcher that re-extracts a template's placeholders from an English string. */
export function compileTemplate(key: string, zh: string): Template {
  const literals: string[] = []
  let re = '^'
  let pos = 0
  let n = 0
  for (const m of key.matchAll(PLACEHOLDER)) {
    literals.push(key.slice(pos, m.index))
    re += `${escapeRe(key.slice(pos, m.index))}(${VALUE})`
    pos = m.index + m[0].length
    n++
  }
  literals.push(key.slice(pos))
  re += `${escapeRe(key.slice(pos))}$`
  return { key, zh, re: new RegExp(re, 's'), n, literals: literals.filter(Boolean) }
}

/** The captured values of a template in an English string, or null. */
export function matchTemplate(tpl: Template, s: string): string[] | null {
  if (!tpl.literals.every((l) => s.includes(l))) return null
  const m = tpl.re.exec(s)
  return m ? m.slice(1, 1 + tpl.n) : null
}

let compiled: Template[] | null = null
const cache = new Map<string, string>()

/** Every template with placeholders, the most literal first (ties: the longer key), so the most specific wins. */
function templates(): Template[] {
  if (!compiled) {
    compiled = Object.entries(DATA).filter(([k]) => /\{\d+\}/.test(k)).map(([k, v]) => compileTemplate(k, v))
    const lit = (x: Template) => x.literals.reduce((a, l) => a + l.length, 0)
    compiled.sort((a, b) => lit(b) - lit(a) || b.key.length - a.key.length)
  }
  return compiled
}

/** A backend string in Chinese: the exact template, else the first template that matches with its values carried
 * over (a captured value that is itself a backend string, e.g. a document's summary, is translated too), else the
 * English as it came. In English the string comes back untouched. */
export function translateData(s: string, depth = 0): string {
  const exact = DATA[s]
  if (exact !== undefined) return exact
  for (const tpl of templates()) {
    const values = matchTemplate(tpl, s)
    if (values) return fill(tpl.zh, depth < 1 ? values.map((v) => (v.length > 12 ? translateData(v, depth + 1) : v)) : values)
  }
  return s
}

export function td(s: string): string
export function td(s: string | undefined | null): string | undefined
export function td(s: string | undefined | null): string | undefined {
  if (!s || !isZh()) return s ?? undefined
  let out = cache.get(s)
  if (out === undefined) {
    out = translateData(s)
    cache.set(s, out)
  }
  return out
}

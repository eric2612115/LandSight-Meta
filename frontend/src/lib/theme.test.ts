import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyTheme, nextThemePref, readThemePref, resolveTheme, THEME_KEY, useTheme } from './theme'

const here = import.meta.dirname

describe('theme resolution', () => {
  it('?theme=dark|light overrides what the browser saved; otherwise the saved choice; otherwise the system', () => {
    expect(readThemePref('?theme=dark', 'light')).toBe('dark')
    expect(readThemePref('?source=live&theme=light', 'dark')).toBe('light')
    expect(readThemePref('?theme=system', 'dark')).toBe('dark')
    expect(readThemePref('?theme=blue', 'light')).toBe('light')
    expect(readThemePref('', 'dark')).toBe('dark')
    expect(readThemePref('', 'system')).toBe('system')
    expect(readThemePref('', null)).toBe('system')
    expect(readThemePref('', 'purple')).toBe('system')
  })

  it('system follows prefers-color-scheme; an explicit choice does not', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('the toggle cycles light → dark → system → light', () => {
    expect(nextThemePref('light')).toBe('dark')
    expect(nextThemePref('dark')).toBe('system')
    expect(nextThemePref('system')).toBe('light')
  })

  it('<html data-theme> carries an explicit choice and is absent for the system', () => {
    const root = document.createElement('div')
    applyTheme('dark', root)
    expect(root.getAttribute('data-theme')).toBe('dark')
    applyTheme('light', root)
    expect(root.getAttribute('data-theme')).toBe('light')
    applyTheme('system', root)
    expect(root.hasAttribute('data-theme')).toBe(false)
  })

  it('the store persists the choice in localStorage and applies it to the document', () => {
    useTheme.getState().setPref('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(useTheme.getState().resolved).toBe('dark')
    useTheme.getState().cycle()
    expect(useTheme.getState().pref).toBe('system')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    useTheme.getState().cycle()
    expect(useTheme.getState().pref).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})

/** The dark set in index.css: every colour token of the @theme block has a dark value, and the explicit block
 * (`:root[data-theme="dark"]`) and the system block (the media rule) carry the same declarations. */
describe('the dark token set in index.css', () => {
  const css = readFileSync(join(here, '..', 'index.css'), 'utf8')
  const block = (start: string) => {
    const i = css.indexOf(start)
    if (i < 0) throw new Error(`${start} not found`)
    const open = css.indexOf('{', i)
    let depth = 0
    for (let j = open; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j)
    }
    throw new Error(`${start} not closed`)
  }
  const decls = (body: string) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  const light = decls(block('@theme'))
  const explicit = decls(block(':root[data-theme="dark"]'))
  const system = decls(block(':root:not([data-theme="light"])'))

  it('every colour token has a dark value, in both blocks', () => {
    const colours = Object.keys(light).filter((k) => k.startsWith('--color-'))
    expect(colours.length).toBeGreaterThan(10)
    for (const k of colours) {
      expect(explicit[k], `${k} in :root[data-theme="dark"]`).toBeDefined()
      expect(system[k], `${k} in the prefers-color-scheme rule`).toBeDefined()
    }
  })

  it('the explicit block and the system block are the same set', () => {
    expect(system).toEqual(explicit)
  })

  it('the paper stays paper-white on the dark desk; the chrome does not', () => {
    expect(explicit['--color-paper']).toBe(light['--color-paper'])
    expect(explicit['--color-pane']).not.toBe(light['--color-pane'])
    expect(explicit['--color-ink']).not.toBe(light['--color-ink'])
  })

  it('index.html applies the same rule before first paint', () => {
    const html = readFileSync(join(here, '..', '..', 'index.html'), 'utf8')
    expect(html).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(html).toContain("setAttribute('data-theme'")
    expect(html.indexOf('data-theme')).toBeLessThan(html.indexOf('<body'))
  })
})

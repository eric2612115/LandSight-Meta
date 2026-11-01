// Stands in for Vite's /@vite/client during a capture: styles still load, but no HMR socket, so an edit to the
// frontend while a scene is being recorded cannot hot-swap modules or reload the page mid-take.
const styles = new Map()
export function updateStyle(id, css) {
  let el = styles.get(id)
  if (!el) {
    el = document.createElement('style')
    el.setAttribute('type', 'text/css')
    el.setAttribute('data-vite-dev-id', id)
    document.head.appendChild(el)
    styles.set(id, el)
  }
  el.textContent = css
}
export function removeStyle(id) {
  styles.get(id)?.remove()
  styles.delete(id)
}
export function injectQuery(url) {
  return url
}
export function createHotContext() {
  const noop = () => {}
  return { data: {}, accept: noop, acceptExports: noop, dispose: noop, prune: noop, invalidate: noop, decline: noop, on: noop, off: noop, send: noop }
}
export class ErrorOverlay extends HTMLElement {}

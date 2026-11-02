/** A tween on the scene's own clock: `sleep` rejects when the scene is aborted, so a retake stops it mid-way. */
export async function tween(ms: number, onUpdate: (t: number) => void, sleep: (ms: number) => Promise<void>, ease: (t: number) => number = (t) => 1 - Math.pow(1 - t, 3)) {
  const t0 = performance.now()
  for (;;) {
    const p = Math.min(1, (performance.now() - t0) / ms)
    onUpdate(ease(p))
    if (p >= 1) return
    await sleep(16)
  }
}

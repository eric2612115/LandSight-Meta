import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/** Unit tests (npm test): jsdom, no dev server, no proxy. */
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
})

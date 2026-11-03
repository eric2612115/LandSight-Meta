# Landsight frontend

Vite + React 19 + TypeScript, Tailwind v4, framer-motion, d3-zoom, zustand, howler, TanStack Query.
Node 24 (via nvm). Design: direction B, the review desk (docs/DECISIONS.md
D-59; design/explore/b-review-desk), with A's pins and paper callout on the sheet and C's inspector and Statement.

```bash
npm ci
npm run dev        # http://localhost:5195 (the next free port if taken), /api proxied to :8795
VITE_API_PORT=8796 npm run dev   # when the API runs on another port (landsight serve --port 8796)
npm run build      # tsc + vite build
npm run lint       # oxlint
npm test           # vitest: money, confirm on a live-shaped Item, the error boundary, scenarios, the Statement, ask
node scripts/shoot.mjs screenshots/v2 name=<url>@<ms> ...   # 1920 × 1080 screenshots via local Chrome
node scripts/shoot-pw.mjs --out F.png --url <url> [--click SEL --await SEL --shots MS:F.png,…] [--drop N] [--reduced]
                                                            # the same with Playwright (demo/film's), clicking, dropping, waiting
```

Routes (one 1920 × 1080 stage, scaled to the window; `?scale=1` pins it):

- `/` — Projects: projects → packages (folders) → runs with the scoreboard by scenario; New project, Add package
  (a path, or a sample), Review (POST /api/packages/{id}/review), Open (the run on `/review?run=<id>`).
- `/open` — open a package (drop zone, the sample, a folder path): every file with its verdict and reason, the run facts.
  A package opened fresh (the sample, a path, a dropped folder, Review on Projects) lands here in the verdict cascade
  (src/app/cascade.ts): the rows appear one by one in the Run's order with the director's sound cues, a file that is not
  read lands grey, the file that governs lands in cobalt, then the facts and the Review button; a click skips to the
  end, `prefers-reduced-motion` skips it. A stored run from the Runs table opens straight on the review.
- `/review` — flags grouped by scenario (quote, regulation, design, format) on the left; the sheet with numbered pins,
  the paper callout, the dock (detail, the Art. 302 gauge, or the quote inspector) and the filmstrip on the right.
  Keys: ↑↓ move, ⏎ confirm, ⌫ dismiss. Deep links: `?run=<id>&flag=E09&sheet=L-1-revB&compare=1&colour=1&filter=all`.
- `/statement` — the reconciliation, every flag with found / expected / Δ / state, the scoreboard, exports (CSV, a
  printable statement, the query letter from confirmed flags and notes).
- `/prices` — the firm's price list, edited in place (GET /api/price-list, PUT /api/price-list/{code}); shared by projects.
- Ask the package — a dock on every screen (⌘K, or `?ask=<question>`): the answer, its citations (each opens the file,
  sheet or check and lights it), the proposed actions as buttons (POST /api/ask/actions).

Data: the live API when `/api/health` answers, else `<repo>/frontend-mock/` (the sample's recorded run), else the
built-in mock; `?source=live|repo|mock` pins one. Without the API, the project list is the record in docs/STACK.md, ask
answers the six recorded questions (src/lib/askMock.ts, from tests/fixtures/ask) and price edits stay in the tab.
Scenarios come from `Check.scenario` / `Run.scenarios`; for a Run without them, src/lib/scenario.ts derives them.

Money: prices are TWD in the Run; `run.currency` carries one dated rate; every figure goes through `src/lib/money.ts`.
The status bar's USD / TWD toggle sets `?currency=`; director mode defaults to USD, the product to TWD.

Theme: light, dark or system (the sun / moon / both toggle in the top bar, cycling), kept in localStorage
`landsight.theme`; `?theme=dark|light` pins one (the film's capture). The dark set lives in src/index.css: the chrome goes
dark, the sheet stays paper-white on a dark desk; index.html applies the choice before first paint.

Director (`/review?director=1`): the film played on these screens — drop, wake, eye, hedge, colour, gauge, bill, ask,
callback. Space = next scene, shift+space / ← = previous, R = retake, Enter = the lit control. `&auto=1` plays
through, `&hold=1` stays on one scene, `#scene=eye` jumps, `&mute=1` silences, `&captions=0` hides the burned-in line.

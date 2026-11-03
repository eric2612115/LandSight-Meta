# How Landsight wins — design and script against the rules (2026-11-02)

The rules (docs/research + the official rules capture): stage one is pass/fail on "fits a theme, reasonably used
the Meta Model API or open weights"; stage two scores Impact 30 / Use of Meta AI Tooling 25 / Technical Depth 20 /
Demo 25 from the video, the code and the live product; stage three has the top five per track watched live. Bonus
prizes: Most Viral on X ($20k, engagement to Nov 8), Best Build on Open Weight Models ($10k), Community Vote
($10k), Best Agentic Use-Case ($5k), Best Creative Build ($5k, Muse Image / Muse Wonder).

## Where the points are, and what each costs

| Criterion | What earns it here | What we still lack | Cost to fix |
|---|---|---|---|
| Impact 30 | one named user (the firm's owner), a real folder, money and a permit at stake, a scoreboard with misses | the business case in dollars; the "ask the package" use that saves the hours | low–medium |
| Meta tooling 25 | Spark on crops with measured facts + JSON + points; Spark writes SAM's prompts; the controlled test; 46 recorded calls | an agentic layer: Spark reading the package's own PDFs to answer the owner's questions with citations (also the agentic bonus); a Glimmer open-weight backend (bonus) | medium |
| Depth 20 | geometry-first routing, three-source reconciliation, the pit downgrade, 141 tests, fixtures | SQLite persistence, the four scenarios as first-class, a tower package | medium |
| Demo 25 | director scenes exist | the screen looks AI-drawn; no camera language; v1's script was written before the scenes | high (design + film v2) |

Reading: Demo and Impact are where the most points move for the least certainty, and they are the two that
depend on the film. Tooling is already strong and gets stronger with the agentic layer. Depth is fine.

## The first eight seconds (what short-video editors know)

Retention is decided before the product appears. Rules we follow, borrowed from the people who optimise watch
time on TikTok and Xiaohongshu:

1. **Pattern interrupt in frame one.** Not a logo, not a title. Something wrong, moving, or a number that
   should not be there. Ours: a spreadsheet row typing "12", a hand counting "8".
2. **Open loop by second three.** A question the viewer needs closed: "where did the other four go?" The film
   must not answer it until the callback.
3. **Stakes in dollars by second six.** "$525 nobody planted" is a joke; "$11,000 over your own price list and a
   permit you won't get" is a stake. Show the big number early, explain it late.
4. **A new thing every five to seven seconds.** Not a new feature — a new *reveal*: the folder bursts, the sheet
   wakes, the AI's eye, the tape measure, the colour pour, the gauge dropping, the hidden tab sliding out, the
   elevation lines. Each is a cut, a sound and a number landing.
5. **Text for sound-off.** Every reveal has its one line burned in; the voice is optional.
6. **Promise the payoff.** At 0:08: "Thirty errors are hidden in this folder. We'll find them." At 2:40: the
   scoreboard pays it.
7. **No throat-clearing.** The pain is one line, the method is one line, the stack is fifteen seconds near the
   end, for the judges who want it.

## The one thing the screen must do that it does not yet

Eric's point: the owner's real pain with a package is the PDFs the developer sends "for you to read yourself" —
specs, review issues, standards, the green-building checklist. The product must let the owner **ask the package**:
"what soil depth does the spec require on the slab?", "does Art. 302 apply to a 1,500 m² site?", "which bill
revision is current and what changed?", "is PV-1 permeable?" — and get an answer with the file, the page and the
sentence it came from, plus a button to turn the answer into a confirmed element, a confirmed price or a
regulation note. Muse Spark reads the package's own text and pages (recorded, cited); the regulation lookup
searches rules.json and the article glosses. This is the agentic layer the bonus prize names, and it is the
scene that turns "a checker" into "the assistant the owner wanted".

## Design direction, against the film

- **A — Drawing room (paper-first, pins on the sheet):** the most cinematic; the camera has somewhere to go
  (dolly into a pin, pull back to the board). Risk: a ledger that is too thin for a professional screen.
- **B — Review desk (two-pane, package tree + drawing):** the most credible as daily software; the film can
  still zoom into the drawing pane. Risk: busy at 1080p unless the typography is excellent.
- **C — Ledger (flags table first, drawing as inspector):** the strongest for "every number traces back", the
  weakest for the opening wow; works as the *second half* of a scene.

Recommendation: **B as the product, with A's camera language inside the drawing pane and C's ledger as the
flags board** — one screen a firm would pay for, one pane the camera loves, one table the judges trust. Decide
after seeing the mockups (C2).

## Script v5 shape (written only after the scenes run and the screen is designed)

0:00 the row types 12 · the hand counts 8 · "$11,000 and a permit" · 0:08 "thirty errors are hidden in this
folder" · 0:12 the drop (format catches: the folder answers back) · 0:35 the sheet wakes, the eye (design
catches) · 1:05 the hedge and the colour pour (measurement) · 1:30 the gauge twice (regulation catches) · 1:55
the bill traced (quote catches) · 2:15 "ask the package" (the owner's question answered from a PDF with a
citation, then confirmed) · 2:35 the scoreboard and the callback · 2:45 the stack in one picture · 2:55 close.

## Bonus prizes worth the hours

- **Most Viral ($20k):** the X post is a 20-second cut of the drop + the gauge + the scoreboard, text-on-screen,
  posted with the "12 ≠ 8" hook; Eric runs the thread. Cheap.
- **Best Agentic Use-Case ($5k):** the ask-the-package layer with confirm actions. Medium; also raises Tooling.
- **Open weights ($10k):** Muse Glimmer 30B via Together as a selectable reader backend for labels/schedules,
  recorded once. Medium-low; only if the hours exist after the above.
- **Creative build ($5k):** Muse Image for the film's cold-open paper? Low value; skip unless free.

## Honest odds

No one can put a number on five hundred unseen submissions. What we control: a film whose first eight seconds
hold a tired judge, a product that holds up when they click, Meta calls that are real and shown, and a story
with money and a permit in it. v1 has the second and third; v2 is for the first and the fourth.

# Submission form — drafts for every field (2026-11-02)

The Cerebral Valley form has 24 fields. The first nine are read by judges; the rest is Meta's developer survey
(not scored — answer it honestly). Nothing below has been submitted. Every number in the description is read
from the final run before pasting; the ones here are from the Nov 2 runs.

## Team Name
`Landsight`

## Track — Eric's call
- **Indie Developer Track** (recommended): one person, built Nov 1–4, judged on "creativity, technical ambition,
  and whether it works". Landsight does not sit under Vexi's BVI company, and the local company does not exist
  yet, so there is no startup to enter it under.
- Startups Track only if the project is entered under a company that owns it.

## Problem statement
**Build for Your World** — "Solve a problem you know firsthand, free up time and mental space, and make something
possible that wasn't before." (The description below quotes the theme's own words back.)

## Most Viral Track — X post link
Post the film on X on Nov 3 or 4 and paste the link. Draft:

> A developer's landscape package: 30 files. Backups, an Excel 97 quote, a zip, a slide deck, four versions of the
> bill. The bill says 12 camphor trees. The drawing has 8.
>
> Landsight drops the whole folder in, counts what's drawn, reads what's written (Muse Spark), checks the colour
> plan (SAM 3.1), checks the building code, and traces every number back to a mark on the drawing.
>
> 30 errors planted. Here's the scoreboard — misses included. 3-minute film ↓
>
> Built in four days for the Meta Global AI Developer Hackathon. Repo in thread.

Thread reply 1: the repo link + "synthetic drawings, answer key in the repo". Reply 2: the gauge twist (tree-pit
detail downgrades every large tree; one species change fixes it). Reply 3: the honest bit — plain Muse Spark counted
this site correctly; the product's job is the routing, the measuring and the trace.

## Project Description (main field)

**Landsight reads a developer's landscape package the way an estimator does — and shows every number's provenance.**

A landscape design firm receives a developer's package: CAD drawings, PDFs, a scan, three revisions of an Excel bill,
backups, a zip, a slide deck. The owner reviews it by hand to decide whether to take the job and what is wrong with
it. It takes weeks per project, and the mistakes are expensive: a bill that lists twelve trees where the drawing has
eight; a hedge billed in metres and planted in hundreds; a tree-pit detail that quietly turns every large tree into a
small one under the building code.

Drop the whole folder into Landsight. Every file gets a verdict and a reason (backup ignored, Excel 97 unsupported,
zip unpacked, raster PDF read by Muse Spark). Geometry closes every outline it can and measures it exactly. The
symbols it cannot close — a tree drawn as twelve loose lines — go to **Muse Spark** with the measured facts, and Spark
answers in JSON with grounding points and a reason; the app still asks a person before counting. **Muse Spark** reads
labels, "typ.", spacing notes, the plant schedule, the title block and the tree-pit detail. On coloured plans,
Spark reads the legend swatches and writes **SAM 3.1**'s colour prompts; SAM returns the beds and the paving within
1% of CAD. The developer's bill is aligned to the drawing by Spark, checked against the firm's own price list, and
the planting is checked against the national Building Technical Regulations §302 with the article numbers on screen —
including the podium rule that downgrades large trees in small pits. Every flag points at a mark on a drawing.

The sample package holds thirty files with thirty planted errors and an answer key; the scoreboard prints what was
found, what needs review and what was missed. Synthetic drawings, so the repo is clean to publish.

Why now: Muse Spark reads a drawing crop and answers in a schema in two seconds, SAM 3.1 segments a coloured plan by
a colour word, and the Meta Model API makes both a few lines of Python — the parts that used to need a trained
vision model per symbol type are gone. Why me: twelve years in traditional finance and seven in quant trading taught
me not to trust a number I can't trace; the rest is a habit of shipping — this was built in four days with an agent
toolkit I run daily.

## Project Description (short version, if the field is capped)

Landsight reads a developer's landscape package — CAD, PDFs, scans, three revisions of the Excel bill, backups, junk —
the way an estimator does. Geometry measures what is exact; Muse Spark reads loose-line symbols, labels, schedules and
details and answers in JSON with grounding points; Spark writes SAM 3.1's prompts for coloured plans; the bill is
aligned to the drawing and the firm's price list; the planting is checked against the local building code with article
numbers. Thirty planted errors in a thirty-file sample package, a scoreboard with the misses, and every flag traced
to a mark on the drawing. Built in four days by a quant who doesn't trust a number he can't trace.

## Public GitHub Repository
`https://github.com/eric2612115/landsight` (make public before submitting; AGPL-3.0; README has the judge's playbook)

## 3-Minute Demo Video
YouTube link of `demo/film/landsight-v1.mp4` (unlisted is fine; the form asks for a link).

## Describe your use of Meta products to build the submitted project

- **Muse Spark 1.3** (Meta Model API, chat completions with `response_format: json_schema`, vision): classifies
  every sheet (plan / elevation / detail / schedule / cover / background); groups loose line segments into one
  object with a reason and 0–1000 grounding points; reads labels, "typ.", "@0.3 m o.c.", the plant schedule, the
  title block (site area, coverage, revision, date) and the tree-pit detail (pit size, soil depth, on slab); reads
  legend swatches and writes SAM's colour prompts; aligns the developer's bill rows to drawing items with a
  confidence; classifies raster PDFs, pasted images (material photos) and text PDFs (the green-building checklist).
- **SAM 3.1** (Meta Model API, responses protocol, `include_confidence`, one-bit masks via `meta_sam_parser`):
  area take-off on coloured plans; the controlled test (same prompt on line work → 0 masks, on colour → masks) is
  in the film.
- Every real call is recorded as a fixture (prompt, answer, seconds) so judges can replay the exact run offline
  and switch to live calls with `?live=1`.
- [If built: **Muse Glimmer 30B** (open weights, via a partner endpoint) as an alternative reader for the label
  and schedule steps — the "Best Build on Meta Open Weight Models" bonus.]

## Why are Meta's models important to your solution?

Two capabilities made the product possible in four days. Muse Spark's structured vision: it looks at a crop of
twelve loose lines with the measured facts in the prompt and returns `is_one_object`, `kind`, `confidence`, `why` and
grounding points in a schema — that replaces a trained symbol detector per plant type, and it reads the labels,
schedules and details on the same call path. SAM 3.1's promptable segmentation on coloured plans gives square metres
without tracing when there is no CAD file. The honest finding is in the repo too: SAM returns nothing on pure line
work, and plain Muse Spark already counts this site correctly — so Landsight's value is the routing (geometry first,
Spark only where geometry fails, SAM only on colour), the exact measurement, the cross-checks against the bill and
the code, and the trace from every number back to the drawing. Low price per call and automatic caching mean the
whole thirty-file review costs cents.

## Provide feedback from your experience using partner technologies
[Fill only if a partner endpoint was used: "Baseten — Muse Spark Open for the alignment step: …" Otherwise:] "Not
used; the Meta Model API alone covered the project."

## Survey (not scored — Eric's honest answers; suggestions)
- Likely to build with Meta Model API: Very likely / Somewhat likely.
- Opinion: Somewhat favorable (the API is OpenAI-shaped and cheap; SAM's output grammar needs a parser; no
  documented image-size limits; SAM silent on line drawings).
- Permission checkbox: tick (it is the same licence as the waiver).
- Recommend Meta Model API: 4. Recommend Muse Code: not used → leave blank or 3.
- Biggest obstacle: "A model capability we needed was missing" (SAM on line work) or "Finding clear documentation
  or code examples" (SAM prompt grammar, image limits).
- Compared with other models: "About the same" for Spark vision; SAM has no equivalent elsewhere.
- What matters most: Quality of the answers and code; then Easy integration.
- Hardest to switch: Our product is tuned to our current model's behavior and prompts.
- Would stop production use: Not sure Meta will keep supporting the API long term / Rate limits.

## For the film and the description to agree
Keep these the same everywhere: thirty files, thirty planted errors, eight camphors, 182 hedge plants, 266 → 297
(fail), tree-pit detail → 215, +7 trees, one species change passes; prices from the firm's own list (sample).

# Status and roadmap

[← README](../README.md)

Written on 2026-11-04. The status is what this repository does today, with the evidence; the roadmap is what comes
next.

## Where it stands

| Part | Status | Evidence |
| --- | --- | --- |
| Reading a whole package as it arrives: 30 files of DXF, PDF, scans, Excel bills, a zip, backups | Works | `samples/greenfield`, `landsight review … --fixtures` |
| Counting and measuring what is drawn: geometry first, Muse Spark 1.3 on what geometry can't settle | Works | [META.md](META.md) |
| Coloured plans measured by SAM 3.1, with the prompts written by Muse Spark from the legend | Works | `landsight/meta/sam_plan.py` |
| The bill against the drawings and the firm's price list; building-code checks with article numbers | Works | `landsight/bill/`, `landsight/rules/` |
| The change request clouded and priced on the drawing, and the reply to the developer | Works | [/try](https://landsight-frontend.vercel.app/try) |
| Ask the package: answers with the file, page and sentence they came from | Works | `landsight/ask/` |
| Planted errors on the synthetic sample: 28 found, 2 flagged for a person, 0 missed; held-out package 10/1/0 | Measured | [README](../README.md#at-a-glance) |
| Private mode: every Muse Spark call on Muse Spark Open, same scoreboard on the sample | Works (CLI and API) | [NEW-MODES.md](NEW-MODES.md) |
| Firm memory: Muse Wonder learns a firm's habits from its decisions | Works (CLI and API) | [NEW-MODES.md](NEW-MODES.md) |
| The product online, no install | Works on the recorded run | [landsight-frontend.vercel.app/try](https://landsight-frontend.vercel.app/try) |
| Real packages from working firms | Not yet: synthetic packages only | |
| DWG without conversion, the two opt-in modes on the screen, trades other than landscape | Not yet | |

## What comes next

1. **Pilots.** Real packages from landscape design firms in Taiwan, under NDA, on a private deployment, checked
   against what their estimators found by hand.
2. **Private deployment.** Muse Spark Open on the firm's own cloud or a dedicated deployment, so the drawings never
   leave it. This is the part that decides whether firms send real drawings at all.
3. **The product.** Native DWG; the private mode and firm memory on the screen; more of the building code.
4. **The next trades.** Architecture and MEP firms review the same developer packages for their own part.

## What a prize would pay for

- Setting up the company, and the legal side of handling confidential drawings: NDAs and data protection.
- Twelve months of pilots, including dedicated Muse Spark Open inference for the pilot firms.
- The product work above, starting with DWG and the two modes on the screen.

## What we'd like to talk about with Meta

Private deployment of Muse Spark Open for firms whose drawings cannot leave their walls, and Muse Wonder as the
memory of how each firm works.

## Get in touch

To bring Landsight to your country, to talk about funding, or to try it on your own packages, email
**eric2612115@gmail.com**.

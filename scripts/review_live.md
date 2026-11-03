# Re-recording the package review's Muse Spark answers

`landsight review` replays tests/fixtures/review/ by default (offline). A live pass calls Muse Spark once per prompt
and writes every answer there (one JSON per call: call, content key, image hash, model, time, usage, prompt, result;
never the API key). Run from the repository root.

```sh
# 1. a fresh sample package (seed 0: the fixture keys are content hashes, so any seed-0 package replays)
uv run python -m landsight package .cache/review-pkg

# 2. drop the old answers only if you mean to re-ask every prompt (a live pass replays what is already recorded
#    for the same content and prompt, and asks only what is missing)
rm -f tests/fixtures/review/*.json

# 3. one live pass: about 36 calls, six at a time (the key is read from ../Meta/.env and never printed)
set -a; . ../Meta/.env; set +a
SSL_CERT_FILE=/etc/ssl/cert.pem uv run python -m landsight review .cache/review-pkg --live --json .cache/run-live.json

# 4. offline replay and the tests
uv run python -m landsight review .cache/review-pkg --fixtures --json .cache/run.json
uv run pytest tests/test_review.py
```

What a pass asks (prompts in landsight/review/spark.py, take-off prompts in landsight/meta/spark.py):

| call | per | what for |
|---|---|---|
| review_classify_sheet | DXF sheet, vector PDF page, raster PDF page | kind, discipline, enlarged/match line, title block, drawing index |
| review_summarise | text PDF | spec / quote / document, key facts, required documents (E30) |
| review_look_image | pasted image | material photo or drawing, finish code (E28) |
| review_align | once | bill rows to drawing items with a confidence (E18) |
| read_schedule, group_and_read, read_detail | take-off | plant schedule (E02), the open outline T-08 (E01), the tree pit (E12) |

Editing a prompt changes its key (the key carries a hash of the prompt and schema), so the next live pass asks that
prompt again and nothing else.

# Research: metaApi (2026-11-01)

All facts below were read on 2026-11-01.

**1. SAM 3.1 on Meta Model API**
- **Model id and endpoint:** model id `sam-3.1`, called with `POST https://api.meta.ai/v1/responses`. Clips go up through `POST /v1/files` with `purpose=user_data`, then the request points at them with `file_id` ([docs index](https://dev.meta.ai/docs/), [segmenting](https://dev.meta.ai/docs/sam/segmenting)).
- **Request shape:** one user message holding an `input_text` part and an `input_image` part (or `input_video`). `image_url` takes a public URL or a base64 data URL ([segmenting](https://dev.meta.ai/docs/sam/segmenting)). Video must be MP4 or MOV in H.264, H.265 or MPEG-4. VP9 and WebM are rejected. The docs give no resolution or file-size limit for images.
- **Prompt types:**
  - Text concept: a short noun phrase for one concrete object. One concept per request, so several kinds of object means several requests ([media-segmentation](https://dev.meta.ai/docs/media-segmentation)).
  - Box and point prompts use a token grammar, for example `<0f>1<|box;x1=444;y1=626;x2=675;y2=849;w=1800;h=1200|>`. Points look like `<|point;x=..;y=..;w=..;h=..|>`; a leading `-` makes a point negative.
  - A prompt is either a noun phrase or box/point tokens, never both. At most 16 objects per prompt ([segmenting](https://dev.meta.ai/docs/sam/segmenting)).
  - Exemplar image crops are not documented.
- **Multiple instances:** an image request returns every match for the noun phrase, so one call for "tree" gives every tree it finds. Zero matches gives an empty `output_text`, not an error ([sam overview](https://dev.meta.ai/docs/sam/overview), [segmenting](https://dev.meta.ai/docs/sam/segmenting)).
- **Output:** text lines inside `output_text`, one line per frame (`<0f>` for an image) ([reading-segmentation](https://dev.meta.ai/docs/sam/reading-segmentation)).
  - Each record has an object id, a box `x1,y1,x2,y2` in source pixels (plus `w,h`), and a mask `data=H,W,<enc>payload`.
  - The mask payload is base85, not RLE, polygon or PNG. Encoding marker `~` is lossless (default); `!` is `one_bit`, set with `metadata.mask_encoding`.
  - A confidence `c` from 0 to 1 is added only with `metadata.include_confidence: "true"` (the string, not a boolean).
  - Parsers: `meta_sam_parser` (Python) and `@meta-sam/parser` (TypeScript) ([sdks](https://dev.meta.ai/docs/sdks)).
- **Video limits:** up to 15,000 frames (about 10 min) per request, up to 16 tracked objects per frame, and object ids stay stable across frames ([segmenting](https://dev.meta.ai/docs/sam/segmenting)).
- **Price:** images $2.50 per 1,000 calls; video $0.20 per 1,000 frames with a 50-frame minimum. Rate limit is 3,000 RPM per team ([pricing](https://dev.meta.ai/docs/pricing-rate-limits)).
- **Line drawings / CAD:** no Meta doc or example covers them. The SAM 3 model card says niche domains benefit from fine-tuning and that complex or referring queries are not supported ([search summary of the SAM 3 materials](https://docs.ultralytics.com/models/sam-3)). The SAM 3.1 release note covers Object Multiplex (about 7x faster at 128 objects) and the `facebook/sam3.1` checkpoints, and does not mention the API ([RELEASE_SAM3p1](https://github.com/facebookresearch/sam3/blob/main/RELEASE_SAM3p1.md)).

**2. Muse Spark 1.2 / 1.3 vision**
- **Model ids:** `muse-spark-1.3` (recommended), `muse-spark-1.2`, `muse-spark-1.1`, plus discounted variants `muse-spark-1.3-contributor` and `muse-spark-1.2-contributor`. Input can be text, image, video, audio or PDF; context is 1,048,576 tokens ([models](https://dev.meta.ai/docs/models)).
- **Image limits** ([image-understanding](https://dev.meta.ai/docs/features/image-understanding), [cookbook 07_vision_input.ipynb](https://github.com/meta-models/meta-model-cookbook/blob/main/01_api_fundamentals/07_vision_input.ipynb)):
  - About 50 images per request, 50 MB per inline image, 1 GiB through the Files API.
  - Formats: jpeg, png, gif, webp, ico.
  - No maximum pixel size is stated, and the model may resize images.
  - A roughly 1280px image costs about 1,300–1,500 tokens. Count exactly with `POST /v1/responses/input_tokens`.
  - Images are allowed only in `user` messages; anywhere else returns HTTP 400.
- **PDF input:** send an `input_file` block with a `file_id` or a `file_url`. Each PDF contributes at most its first 50 page images to the 50-image budget.
- **Grounding:** coordinates are normalized to 0–1000. The docs recommend point, box or `{points,count}` output shapes for counting, and say to clamp values that land slightly out of range.
- **Use cases:** extracting data from charts, diagrams and documents is listed as a use case.
- **Structured output** ([structured-output](https://dev.meta.ai/docs/structured-output)):
  - Chat Completions uses `response_format: {type:"json_schema", json_schema:{name, schema}}`. The Responses API uses `text.format`.
  - Output is always held to the schema. `strict: true` only adds a server-side check of the schema itself.
  - Recursive schemas are rejected. Nesting is capped at 10 levels.
- **Prompt caching:** automatic. `prompt_cache_key` is optional, and on the Responses API `prompt_cache_retention: "24h"` asks for longer retention ([prompt-caching](https://dev.meta.ai/docs/prompt-caching)).
- **Price per 1M tokens** ([pricing](https://dev.meta.ai/docs/pricing-rate-limits)):
  - Standard: $0.15 cached input, $1.25 input, $4.25 output.
  - Contributor: $0.002 cached input, $0.10 input, $0.20 output.
  - Rate limits: 3,000 RPM and 4M TPM (Standard); 150 RPM and 3M TPM (Contributor).

**3. Open weights**
- **Muse Spark Open:** Hugging Face repo `meta-models/Muse-Spark-Open-816B-A42B`. 816B-parameter mixture-of-experts with 42B active, takes text, image, audio and video, released under the Muse Model License ([muse-spark-open](https://dev.meta.ai/docs/muse-spark-open)). Hosted endpoints ([oss cookbook muse-spark/hosted](https://github.com/meta-models/meta-oss-cookbook/tree/main/muse-spark/hosted)):

| Provider | Base URL | Model id |
|---|---|---|
| Baseten | `https://inference.baseten.co/v1` | `meta-models/muse-spark-open` |
| Fireworks | `https://api.fireworks.ai/inference/v1` | `accounts/fireworks/models/muse-spark-open` |
| Together | `https://api.together.xyz/v1` | `meta-models/muse-spark-open` |
| Groq | `https://api.groq.com/openai/v1` | `meta-models/muse-spark-open` (needs org approval) |
| Nebius | `https://api.tokenfactory.us-north1.nebius.com/v1` | `meta-models/muse-spark-open` |

  Modal is named as a platform, but the cookbook gives no model id for it.
- **Muse Glimmer:** 30B dense model, Apache 2.0, and it does have vision. It uses a frozen ~1.8B ViT-G/14 encoder, allows up to 4,096 visual tokens per image, and has a 131K context. OmniDocBench v1.5 score is 75.8 ([HF card](https://huggingface.co/meta-models/Muse-Glimmer-30B), [muse-glimmer](https://dev.meta.ai/docs/muse-glimmer)).
  - Together: `meta-models/Muse-Glimmer-30B` at $0.35 input / $1.50 output per 1M tokens ([together-ai.md](https://github.com/meta-models/meta-oss-cookbook/blob/main/muse-glimmer/hosted/together-ai.md)).
  - Fireworks: `accounts/fireworks/models/muse-glimmer-30b`. The page is inconsistent: serverless is marked unsupported and also described as being deprecated from 2026-09-25, while on-demand deployment remains available ([fireworks](https://fireworks.ai/models/fireworks/muse-glimmer-30b)).
  - Self-host with `vllm serve meta-models/Muse-Glimmer-30B`. A 4-bit build fits in 24 GB of VRAM.

**4. Closest cookbook examples** ([meta-model-cookbook](https://github.com/meta-models/meta-model-cookbook))
- `07_sam/01_api_basics/python/01_segment_image.py`: SAM 3.1 image segmentation with the parser, writing masks out as SVG ([link](https://github.com/meta-models/meta-model-cookbook/tree/main/07_sam/01_api_basics)).
- `03_use_cases/01_chart-explainer/README.md`: chart-to-JSON extraction. It notes that a schema fixes the output's shape but not the accuracy of its values ([link](https://github.com/meta-models/meta-model-cookbook/tree/main/03_use_cases/01_chart-explainer)).
- `03_use_cases/10_perception_grounding/perception_grounding.py`: Muse Spark places points on detected items in one call, with no SAM step ([link](https://github.com/meta-models/meta-model-cookbook/tree/main/03_use_cases/10_perception_grounding)).
- `01_api_fundamentals/04_structured_output.ipynb` and `07_vision_input.ipynb`.
- `meta-oss-cookbook/muse-glimmer/recipes/structured-output` ([oss cookbook](https://github.com/meta-models/meta-oss-cookbook)).
- No cookbook recipe chains segmentation into an LLM, and none reads documents or drawings.

**5. SDK and auth** ([sdks](https://dev.meta.ai/docs/sdks), [docs index](https://dev.meta.ai/docs/))
- There is no Meta SDK of its own.
- OpenAI SDK: `OpenAI(base_url="https://api.meta.ai/v1", api_key=os.environ["MODEL_API_KEY"])`.
- Anthropic SDK: base URL `https://api.meta.ai`, key passed as `auth_token`, sent as a bearer token.
- Header for both: `Authorization: Bearer $MODEL_API_KEY`. The key format is `LLM|{id}|{secret}`.
- Supported protocols: Responses, Chat Completions and Messages.

## Sources

- [Meta Model API docs index](https://dev.meta.ai/docs/) — Base URL, auth, model id list incl. sam-3.1, protocols (read 2026-11-01; ai.developer.meta.com/docs redirects here)
- [Media segmentation guide](https://dev.meta.ai/docs/media-segmentation) — SAM 3.1 Responses request shape, noun-phrase prompting
- [SAM overview](https://dev.meta.ai/docs/sam/overview) — Input/output summary, multiple matches, video tracking, parser lib
- [SAM segmenting](https://dev.meta.ai/docs/sam/segmenting) — Box/point grammar, confidence metadata, mask_encoding, video limits, file upload
- [SAM reading segmentation output](https://dev.meta.ai/docs/sam/reading-segmentation) — Output line grammar, box coords, base85 mask encoding, confidence
- [Pricing and rate limits](https://dev.meta.ai/docs/pricing-rate-limits) — Prices and RPM/TPM for Muse Spark, SAM 3.1, others
- [Models](https://dev.meta.ai/docs/models) — Model ids, modalities incl. PDF, open-weight model specs
- [Image understanding](https://dev.meta.ai/docs/features/image-understanding) — Image limits, PDF input, 0-1000 grounding coordinates, token costs
- [Structured output](https://dev.meta.ai/docs/structured-output) — json_schema request shape, strict mode, schema limits
- [Prompt caching](https://dev.meta.ai/docs/prompt-caching) — Automatic caching, prompt_cache_key, 24h retention hint
- [SDKs and libraries](https://dev.meta.ai/docs/sdks) — OpenAI/Anthropic base URLs and auth, SAM parser package names
- [Muse Spark Open docs](https://dev.meta.ai/docs/muse-spark-open) — HF repo id, providers, license, hardware
- [Muse Glimmer docs](https://dev.meta.ai/docs/muse-glimmer) — 30B dense, vision, Apache 2.0, launch partners
- [meta-model-cookbook](https://github.com/meta-models/meta-model-cookbook) — Recipe directory tree and paths
- [Cookbook 07_vision_input.ipynb](https://github.com/meta-models/meta-model-cookbook/blob/main/01_api_fundamentals/07_vision_input.ipynb) — ~50 images/request, 50 MB inline, 1 GiB Files API, formats
- [Cookbook 07_sam/01_api_basics](https://github.com/meta-models/meta-model-cookbook/tree/main/07_sam/01_api_basics) — SAM 3.1 image/video example files
- [Cookbook 01_chart-explainer](https://github.com/meta-models/meta-model-cookbook/tree/main/03_use_cases/01_chart-explainer) — Chart-to-JSON extraction pattern and caveats
- [Cookbook 10_perception_grounding](https://github.com/meta-models/meta-model-cookbook/tree/main/03_use_cases/10_perception_grounding) — Single-call Muse Spark grounding example
- [meta-oss-cookbook](https://github.com/meta-models/meta-oss-cookbook) — Open-weight recipe paths
- [oss cookbook muse-spark/hosted](https://github.com/meta-models/meta-oss-cookbook/tree/main/muse-spark/hosted) — Muse Spark Open provider ids and base URLs (Baseten, Fireworks, Together, Groq, Nebius)
- [oss cookbook muse-glimmer together-ai.md](https://github.com/meta-models/meta-oss-cookbook/blob/main/muse-glimmer/hosted/together-ai.md) — Glimmer Together model id, base URL, pricing
- [Muse-Glimmer-30B HF card](https://huggingface.co/meta-models/Muse-Glimmer-30B) — Vision encoder, context, license, serving, doc benchmarks
- [Fireworks Muse Glimmer 30B](https://fireworks.ai/models/fireworks/muse-glimmer-30b) — Fireworks model path, vision supported, serverless status
- [SAM 3.1 release notes](https://github.com/facebookresearch/sam3/blob/main/RELEASE_SAM3p1.md) — Object Multiplex, speedups, HF checkpoint facebook/sam3.1
- [Ultralytics SAM 3 page](https://docs.ultralytics.com/models/sam-3) — Third-party summary of SAM 3 limits (niche domains need fine-tuning; no complex/referring queries)

## Unknowns

- The hackathon guide that names partner endpoints and the 'Best Build on Meta Open Weight Models' prize was not found online. The hackathon's own materials mention a Baseten credits form, but the guide itself was not located.
- Modal: no model id or endpoint found for either Muse Spark Open or Muse Glimmer. Baseten: no Muse Glimmer endpoint found.
- SAM 3.1 API: no documented maximum image resolution or file size, and no documented exemplar (image crop) prompt.
- No Meta doc, example or benchmark shows SAM 3/3.1 working on line drawings, CAD or planting plans. Whether a 'tree' prompt finds loose-line tree symbols is unverified and needs our own test.
- Muse Spark: no stated maximum pixel size, and the resize rule is undocumented ('may resize'). Whether images count toward prompt caching is not stated.
- Whether Muse Spark Open accepts image input on each hosted provider (Baseten and others) is not confirmed per provider. The cookbook gives only text examples.
- Fireworks Glimmer serverless status contradicts itself (marked 'Not Supported' and also 'being deprecated from 2026-09-25'). Treat it as on-demand only.
- The exact Responses API `text.format` field layout for structured output is not fully shown in the docs.

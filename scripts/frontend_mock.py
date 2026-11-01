"""Write real API responses from the offline (recorded) run to frontend-mock/, so the frontend can be built and
filmed against them before it talks to the backend.

  uv run python scripts/frontend_mock.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from landsight.app import create_app  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "frontend-mock"


def main() -> int:
    OUT.mkdir(exist_ok=True)
    c = TestClient(create_app())
    files = {"run.json": c.post("/api/package/open").json(), "rules.json": c.get("/api/rules").json(),
             "director.json": c.get("/api/director").json(), "health.json": c.get("/api/health").json()}
    files["confirm_I-01.json"] = c.post("/api/items/I-01/confirm").json()
    files["run_confirmed.json"] = c.get("/api/run").json()
    for name, data in files.items():
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        print(f"frontend-mock/{name}: {len(json.dumps(data)) // 1024} KB")
    run = files["run.json"]  # every image the run points at, at its URL path under frontend-mock/
    urls = [s[k] for s in run["sheets"] for k in ("svg_url", "png_url", "filled_png_url") if s.get(k)]
    urls += [i["spark"]["crop_url"] for i in run["items"] if i.get("spark")]
    for url in urls:
        r = c.get(url)
        target = OUT / url.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(r.content)
        print(f"frontend-mock{url}: {len(r.content) // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Write the real API responses for the sample package to frontend-mock/, so the frontend's "repo" source is the real
package end to end (the same Run the backend serves, from recorded Muse Spark and SAM 3.1 calls), with every image the
Run points at stored at its URL path (sheets as SVG and PNG, the coloured renders, the crop Muse Spark saw).

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
    run = files["run.json"]
    flagged = next((i["item_id"] for i in run["items"] if not i["agreed"]), None)
    if flagged:
        files[f"confirm_{flagged}.json"] = c.post(f"/api/items/{flagged}/confirm").json()
        files["run_confirmed.json"] = c.get("/api/run").json()
    for old in OUT.glob("confirm_*.json"):
        if old.name not in files:
            old.unlink()
    for name, data in files.items():
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        print(f"frontend-mock/{name}: {len(json.dumps(data)) // 1024} KB")
    urls = [s[k] for s in run["sheets"] for k in ("svg_url", "png_url", "filled_png_url") if s.get(k)]
    urls += [i["spark"]["crop_url"] for i in run["items"] if i.get("spark")]
    wanted = {OUT / u.lstrip("/") for u in urls}
    for stale in (OUT / "api").rglob("*") if (OUT / "api").is_dir() else []:
        if stale.is_file() and stale not in wanted:
            stale.unlink()
    total = 0
    for url in urls:
        r = c.get(url)
        if r.status_code != 200:
            raise SystemExit(f"{url}: HTTP {r.status_code}")
        target = OUT / url.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(r.content)
        total += len(r.content)
    print(f"frontend-mock/api: {len(urls)} images, {total // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""FastAPI on :8795, the backend half of docs/API.md. The frontend (Vite + React, :5195) lives in frontend/.

  GET  /api/health                     {ok, spark: fixtures | live, version}
  POST /api/package/open               body {"path": folder} or empty: the sample package (samples/greenfield) through
                                       landsight.review, recorded Meta calls; ?live=1 live Muse Spark and SAM 3.1;
                                       ?site=m4 the older m4 synthetic site (landsight/app/run.py)
  GET  /api/run                        the last Run
  POST /api/items/{item_id}/confirm    a person confirms a flagged item -> Item
  GET  /api/sheets/{sheet_id}.svg      the sheet as it prints (also .png, and .filled.png: the coloured render SAM saw)
  GET  /api/crops/{item_id}.png        the exact image Muse Spark was sent for the item
  GET  /api/rules                      the regulation checks
  GET  /api/director                   the film's scenes, as pointers into the run
"""

from __future__ import annotations

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from landsight.app.package import PackageState
from landsight.app.run import VERSION, RunState

PORT = 8795
FRONTEND_ORIGINS = ["http://localhost:5195", "http://127.0.0.1:5195"]
MEDIA = {"svg": "image/svg+xml", "png": "image/png", "filled.png": "image/png"}


def create_app(features: dict[str, bool] | None = None) -> FastAPI:
    """The API. `features` switches the conditional builds on or off (landsight.app.run.FEATURES; default: all on,
    except those named in LANDSIGHT_FEATURES_OFF)."""
    app = FastAPI(title="Landsight", version=VERSION, docs_url=None, redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=FRONTEND_ORIGINS, allow_methods=["*"], allow_headers=["*"])
    m4, package = RunState(features), PackageState()
    current: dict = {"state": None}
    app.state.landsight = current

    def need_run():
        st = current["state"]
        if st is None or (st is m4 and m4.takeoff is None) or (st is package and not package.opened):
            raise HTTPException(404, "no package opened: POST /api/package/open first")
        return st

    @app.get("/")
    def root():
        return {"name": "Landsight API", "contract": "docs/API.md", "health": "/api/health"}

    @app.get("/api/health")
    def health():
        st = current["state"]
        return {"ok": True, "spark": "live" if st is not None and st.live else "fixtures", "version": VERSION}

    @app.post("/api/package/open")
    def open_package(body: dict | None = Body(default=None), live: int = 0, site: str = ""):
        path = (body or {}).get("path")
        st = m4 if site == "m4" else package
        if site not in ("", "m4", "package"):
            raise HTTPException(400, f"unknown site {site!r}: leave it out for the package, or site=m4")
        try:
            out = st.open(path, live=bool(live))
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        current["state"] = st
        return JSONResponse(out)

    @app.get("/api/run")
    def run():
        return JSONResponse(need_run().run())

    @app.post("/api/items/{item_id}/confirm")
    def confirm(item_id: str):
        st = need_run()
        try:
            return JSONResponse(st.confirm(item_id))
        except KeyError as e:
            raise HTTPException(404, f"no item {item_id}") from e

    @app.get("/api/sheets/{name}")
    def sheet(name: str):
        st = need_run()
        for kind in ("filled.png", "svg", "png"):
            if name.endswith("." + kind):
                data = st.render(name[: -len(kind) - 1], kind)
                if data is None:
                    break
                return Response(data, media_type=MEDIA[kind])
        raise HTTPException(404, f"no sheet {name}")

    @app.get("/api/crops/{name}")
    def crop(name: str):
        st = need_run()
        data = st.crop(name.removesuffix(".png")) if name.endswith(".png") else None
        if data is None:
            raise HTTPException(404, f"no crop {name}")
        return Response(data, media_type="image/png")

    @app.get("/api/rules")
    def rules():
        return JSONResponse(need_run().rules())

    @app.get("/api/director")
    def director():
        return JSONResponse(need_run().director())

    return app


def serve(host: str = "127.0.0.1", port: int = PORT) -> None:
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port, log_level="info")

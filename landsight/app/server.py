"""FastAPI on :8795, the backend half of docs/API.md. The frontend (Vite + React, :5195) lives in frontend/.

  GET  /api/health                     {ok, spark: fixtures | live, version}
  POST /api/package/open               body {"path": folder} or empty (the sample package; the m4 site until it exists)
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

from landsight.app.run import VERSION, RunState

PORT = 8795
FRONTEND_ORIGINS = ["http://localhost:5195", "http://127.0.0.1:5195"]
MEDIA = {"svg": "image/svg+xml", "png": "image/png", "filled.png": "image/png"}


def create_app(features: dict[str, bool] | None = None) -> FastAPI:
    """The API. `features` switches the conditional builds on or off (landsight.app.run.FEATURES; default: all on,
    except those named in LANDSIGHT_FEATURES_OFF)."""
    app = FastAPI(title="Landsight", version=VERSION, docs_url=None, redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=FRONTEND_ORIGINS, allow_methods=["*"], allow_headers=["*"])
    state = RunState(features)
    app.state.landsight = state

    def need_run():
        if state.takeoff is None:
            raise HTTPException(404, "no package opened: POST /api/package/open first")

    @app.get("/")
    def root():
        return {"name": "Landsight API", "contract": "docs/API.md", "health": "/api/health"}

    @app.get("/api/health")
    def health():
        return {"ok": True, "spark": "live" if state.live else "fixtures", "version": VERSION}

    @app.post("/api/package/open")
    def open_package(body: dict | None = Body(default=None), live: int = 0):
        try:
            return JSONResponse(state.open((body or {}).get("path"), live=bool(live)))
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    @app.get("/api/run")
    def run():
        need_run()
        return JSONResponse(state.run())

    @app.post("/api/items/{item_id}/confirm")
    def confirm(item_id: str):
        need_run()
        try:
            return JSONResponse(state.confirm(item_id))
        except KeyError as e:
            raise HTTPException(404, f"no item {item_id}") from e

    @app.get("/api/sheets/{name}")
    def sheet(name: str):
        need_run()
        for kind in ("filled.png", "svg", "png"):
            if name.endswith("." + kind):
                data = state.render(name[: -len(kind) - 1], kind)
                if data is None:
                    break
                return Response(data, media_type=MEDIA[kind])
        raise HTTPException(404, f"no sheet {name}")

    @app.get("/api/crops/{name}")
    def crop(name: str):
        need_run()
        data = state.crop(name.removesuffix(".png")) if name.endswith(".png") else None
        if data is None:
            raise HTTPException(404, f"no crop {name}")
        return Response(data, media_type="image/png")

    @app.get("/api/rules")
    def rules():
        need_run()
        return JSONResponse(state.rules())

    @app.get("/api/director")
    def director():
        need_run()
        return JSONResponse(state.director())

    return app


def serve(host: str = "127.0.0.1", port: int = PORT) -> None:
    import uvicorn

    uvicorn.run(create_app(), host=host, port=port, log_level="info")

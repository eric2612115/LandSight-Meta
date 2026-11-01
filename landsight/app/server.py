"""FastAPI on :8795, the backend half of docs/API.md. The frontend (Vite + React, :5195) lives in frontend/.

  GET  /api/health                     {ok, spark: fixtures | live, version}
  POST /api/package/open               body {"path": folder} or empty: the sample package (samples/greenfield) through
                                       landsight.review, recorded Meta calls; ?live=1 live Muse Spark and SAM 3.1;
                                       ?site=m4 the older m4 synthetic site (landsight/app/run.py)
  GET  /api/run                        the last Run; while a package is being opened: the previous Run with
                                       "stale": true, or 202 {"status": "running"} when there is none yet
  POST /api/items/{item_id}/confirm    a person confirms a flagged item -> Item (an item every source already agreed
                                       on comes back with "confirmed": true and "note": "already agreed")
  GET  /api/sheets/{sheet_id}.svg      the sheet as it prints (also .png, and .filled.png: the coloured render SAM saw)
  GET  /api/crops/{item_id}.png        the exact image Muse Spark was sent for the item
  GET  /api/rules                      the regulation checks
  GET  /api/director                   the film's scenes, as pointers into the run
"""

from __future__ import annotations

import threading

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
    current: dict = {"state": None, "opening": 0}
    lock = threading.Lock()
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
    def open_package(body=Body(default=None), live: int = 0, site: str = ""):
        if body is not None and not isinstance(body, dict):
            raise HTTPException(422, 'the body must be a JSON object: {"path": "<folder>"} or empty')
        path = (body or {}).get("path")
        if path is not None and not isinstance(path, str):
            raise HTTPException(422, f"path must be a string (a folder), not {type(path).__name__}")
        st = m4 if site == "m4" else package
        if site not in ("", "m4", "package"):
            raise HTTPException(400, f"unknown site {site!r}: leave it out for the package, or site=m4")
        with lock:
            current["opening"] += 1
        try:
            out = st.open(path, live=bool(live))
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        finally:
            with lock:
                current["opening"] -= 1
        current["state"] = st
        return JSONResponse(out)

    @app.get("/api/run")
    def run():
        if current["opening"]:
            st = current["state"]
            prev = None
            if st is not None and not (st is m4 and m4.takeoff is None) and not (st is package and not package.opened):
                try:
                    prev = st.run()
                except Exception:  # noqa: BLE001 - the state is being replaced under us: say so instead
                    prev = None
            if prev is None:
                return JSONResponse({"status": "running", "detail": "a package is being opened; ask again shortly"},
                                    status_code=202)
            return JSONResponse(prev | {"stale": True, "status": "running"})
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


class PortBusy(OSError):
    pass


def bind(host: str = "127.0.0.1", port: int = PORT):
    """The listening socket, bound before anything is printed: a busy port raises PortBusy, so no banner ever claims
    a server that is not there."""
    import socket

    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
    except OSError as e:
        sock.close()
        raise PortBusy(f"{host}:{port} is in use ({e.strerror}); see who holds it with "
                       f"`lsof -nP -iTCP:{port} -sTCP:LISTEN`, or start on another port: "
                       f"`uv run python -m landsight serve --port {port + 1}`") from e
    sock.set_inheritable(True)
    return sock


def serve(host: str = "127.0.0.1", port: int = PORT, sock=None, on_ready=None) -> None:
    """Serve the API. `sock` is a socket from bind() (bound here when None); `on_ready` runs once it is listening."""
    import uvicorn

    sock = sock or bind(host, port)
    config = uvicorn.Config(create_app(), host=host, port=port, log_level="info")
    server = uvicorn.Server(config)
    if on_ready is not None:
        startup = server.startup

        async def announce(sockets=None):
            await startup(sockets=sockets)
            if server.started:
                on_ready()

        server.startup = announce
    server.run(sockets=[sock])

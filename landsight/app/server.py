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
  GET  /api/run?scenario=quote         the last Run as one scenario sees it (its checks, its slice of the scoreboard)

landsight.db (LANDSIGHT_DB, else ./landsight.db; docs/API.md "Stable data"):
  GET  /api/projects                   projects, their packages and each package's latest run
  POST /api/projects                   {"name"} -> a project
  POST /api/projects/{id}/packages     {"path", "name"?} register a package folder
  GET  /api/packages/{id}              one package
  POST /api/packages/{id}/review       run the review (?live=1, ?fresh=N) -> Run; the endpoints above map onto it
  GET  /api/runs/{id}                  a stored Run with its confirmations, notes and flags (?scenario=)
  GET  /api/runs/{id}/checks           the export listing: open + confirmed checks (?scenario=, ?confirmed=1)
  POST /api/runs/{id}/checks/{check_id}/decision   {"decision": confirm|dismiss|open, "note"?} -> the check
  GET  /api/packages/{id}/runs         every stored run of a package, newest first, with its scoreboard
  GET  /api/price-list                 the firm's rates; PUT /api/price-list/{code} {low, high, ...} edits one row
  GET  /api/meta-calls?run=&ask=       every Muse Spark / SAM 3.1 call a run or a question used (&full=0 trims)
  POST /api/ask                        {"question", "run_id"?} -> answer, citations, proposed actions (?live=1)
  POST /api/ask/actions                {"run_id", "action": {kind, target_id, value, why}} -> applied
"""

from __future__ import annotations

import threading
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from landsight.app.package import PackageState
from landsight.app.run import VERSION, RunState
from landsight.review import scenarios as SC

PORT = 8795
FRONTEND_ORIGINS = ["http://localhost:5195", "http://127.0.0.1:5195"]
MEDIA = {"svg": "image/svg+xml", "png": "image/png", "filled.png": "image/png"}


def create_app(features: dict[str, bool] | None = None, db_path: str | Path | None = None) -> FastAPI:
    """The API. `features` switches the conditional builds on or off (landsight.app.run.FEATURES; default: all on,
    except those named in LANDSIGHT_FEATURES_OFF). `db_path`: landsight.db (default LANDSIGHT_DB, else ./landsight.db)."""
    from landsight.store import connect, default_path
    from landsight.store import service as DBS

    db = Path(db_path) if db_path else default_path()
    app = FastAPI(title="Landsight", version=VERSION, docs_url=None, redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=FRONTEND_ORIGINS, allow_methods=["*", "PUT"], allow_headers=["*"])
    m4, package = RunState(features), PackageState(db)
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

    def conn():
        return connect(db)

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

    def scenario_view(run: dict, scenario: str) -> dict:
        if not scenario:
            return run
        try:
            return SC.run_slice(run, scenario)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e

    @app.get("/api/run")
    def run(scenario: str = "", confirmed: int = 0):
        if scenario and scenario not in SC.SCENARIOS:
            raise HTTPException(400, f"unknown scenario {scenario!r}: one of {', '.join(SC.SCENARIOS)}")
        if confirmed:
            return JSONResponse(DBS.filter_checks(scenario_view(need_run().run(), scenario), confirmed=True))
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
            return JSONResponse(scenario_view(prev, scenario) | {"stale": True, "status": "running"})
        return JSONResponse(scenario_view(need_run().run(), scenario))

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

    # ------------------------------------------------------------------------------------------ landsight.db
    def body_dict(body) -> dict:
        if body is None:
            return {}
        if not isinstance(body, dict):
            raise HTTPException(422, "the body must be a JSON object")
        return body

    @app.get("/api/projects")
    def get_projects():
        c = conn()
        try:
            return JSONResponse(DBS.projects(c))
        finally:
            c.close()

    @app.post("/api/projects")
    def new_project(body=Body(default=None)):
        name = body_dict(body).get("name")
        if not isinstance(name, str) or not name.strip():
            raise HTTPException(422, 'give the project a name: {"name": "..."}')
        c = conn()
        try:
            pid = DBS.ensure_project(c, name.strip())
            return JSONResponse(next(p for p in DBS.projects(c) if p["project_id"] == pid))
        finally:
            c.close()

    @app.post("/api/projects/{project_id}/packages")
    def add_package(project_id: int, body=Body(default=None)):
        b = body_dict(body)
        path = b.get("path")
        if not isinstance(path, str) or not path.strip():
            raise HTTPException(422, 'give the package folder: {"path": "<folder>"}')
        if b.get("name") is not None and not isinstance(b.get("name"), str):
            raise HTTPException(422, "name must be a string")
        c = conn()
        try:
            return JSONResponse(DBS.register_package(c, project_id, path, b.get("name")))
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        except (ValueError, OSError) as e:
            raise HTTPException(400, str(e)) from e
        finally:
            c.close()

    @app.get("/api/packages/{package_id}")
    def get_package(package_id: int):
        c = conn()
        try:
            return JSONResponse(DBS.package(c, package_id))
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        finally:
            c.close()

    @app.post("/api/packages/{package_id}/review")
    def review_package(package_id: int, live: int = 0, fresh: int = 0):
        c = conn()
        try:
            DBS.package(c, package_id)
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        finally:
            c.close()
        if fresh and not live:
            raise HTTPException(400, "fresh re-asks recorded calls live: add live=1")
        with lock:
            current["opening"] += 1
        try:
            out = package.open(live=bool(live), package_id=package_id, fresh=-1 if fresh < 0 else fresh)
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        finally:
            with lock:
                current["opening"] -= 1
        current["state"] = package
        return JSONResponse(out)

    def stored_run(run_id: str) -> dict:
        """A run as the screen sees it: the current one live (renders, confirmations), any other from the database."""
        if package.opened and package.base["run_id"] == run_id:
            return package.run() | {"stored": True, "current": True}
        c = conn()
        try:
            return DBS.get_run(c, run_id)
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        finally:
            c.close()

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str, scenario: str = "", confirmed: int = 0):
        return JSONResponse(DBS.filter_checks(scenario_view(stored_run(run_id), scenario), confirmed=bool(confirmed)))

    @app.get("/api/runs/{run_id}/checks")
    def get_checks(run_id: str, scenario: str = "", confirmed: int = 0):
        """The export listing: open and confirmed checks (dismissed ones left out); confirmed=1: confirmed only."""
        if scenario and scenario not in SC.SCENARIOS:
            raise HTTPException(400, f"unknown scenario {scenario!r}: one of {', '.join(SC.SCENARIOS)}")
        c = conn()
        try:
            DBS.run_row(c, run_id)
            return JSONResponse(DBS.checks(c, run_id, scenario or None, confirmed=bool(confirmed), drop_dismissed=True))
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        finally:
            c.close()

    @app.post("/api/runs/{run_id}/checks/{check_id}/decision")
    def decide(run_id: str, check_id: str, body=Body(default=None)):
        """A person's verdict on one flag: {"decision": "confirm" | "dismiss" | "open", "note"?: string} -> the check."""
        b = body_dict(body)
        decision, note = b.get("decision"), b.get("note")
        if decision not in DBS.DECISIONS:
            raise HTTPException(422, f'decision must be one of {", ".join(DBS.DECISIONS)}: {{"decision": "confirm", '
                                     '"note": "..."}')
        if note is not None and not isinstance(note, str):
            raise HTTPException(422, "note must be a string")
        c = conn()
        try:
            DBS.set_decision(c, run_id, check_id, decision, note)
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        finally:
            c.close()
        run = stored_run(run_id)
        return JSONResponse(next(x for x in run["checks"] if x["check_id"] == check_id))

    @app.get("/api/packages/{package_id}/runs")
    def get_package_runs(package_id: int):
        c = conn()
        try:
            return JSONResponse(DBS.package_runs(c, package_id))
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        finally:
            c.close()

    @app.get("/api/price-list")
    def get_prices():
        c = conn()
        try:
            return JSONResponse(DBS.price_rows(c))
        finally:
            c.close()

    @app.put("/api/price-list/{code}")
    def put_price(code: str, body=Body(default=None)):
        b = body_dict(body)
        if not b:
            raise HTTPException(422, 'give the fields to change, e.g. {"low": 6200, "high": 7200}')
        c = conn()
        try:
            return JSONResponse(DBS.update_price(c, code, dict(b)))
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        finally:
            c.close()

    @app.get("/api/meta-calls")
    def get_meta_calls(run: str = "", ask: int | None = None, full: int = 1):
        c = conn()
        try:
            rid = run or (package.base["run_id"] if package.opened else DBS.latest_run_id(c))
            return JSONResponse(DBS.meta_calls(c, rid if ask is None else (run or None), ask, bool(full)))
        finally:
            c.close()

    def ask_run_id(c, b: dict) -> str:
        rid = b.get("run_id")
        if rid is not None and not isinstance(rid, str):
            raise HTTPException(422, "run_id must be a string")
        rid = rid or (package.base["run_id"] if package.opened else DBS.latest_run_id(c))
        if not rid:
            raise HTTPException(404, "no run yet: open or review a package first")
        try:
            DBS.run_row(c, rid)
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        return rid

    @app.post("/api/ask")
    def ask(body=Body(default=None), live: int = 0):
        import os

        from landsight.ask.service import ask_run
        from landsight.review.spark import FixtureMissing

        b = body_dict(body)
        q = b.get("question")
        if not isinstance(q, str) or not q.strip():
            raise HTTPException(422, 'ask a question: {"question": "...", "run_id": "..."}')
        if live and not os.environ.get("MODEL_API_KEY"):
            raise HTTPException(400, "live mode needs MODEL_API_KEY")
        c = conn()
        try:
            rid = ask_run_id(c, b)
            return JSONResponse(ask_run(c, rid, q, live=bool(live)))
        except FixtureMissing as e:
            raise HTTPException(404, f"no recorded answer for this question on this package ({e}); ask with "
                                     "live=1 and a key to record one") from e
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        finally:
            c.close()

    @app.post("/api/ask/actions")
    def ask_action(body=Body(default=None)):
        from landsight.ask import apply_action

        b = body_dict(body)
        action = b.get("action") if isinstance(b.get("action"), dict) else {k: b.get(k) for k in
                                                                            ("kind", "target_id", "value", "why")}
        c = conn()
        try:
            rid = ask_run_id(c, b)
            out = apply_action(c, rid, action, source=b.get("source") if isinstance(b.get("source"), str) else "ask")
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from e
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        finally:
            c.close()
        if action.get("kind") == "confirm_element" and package.opened and package.base["run_id"] == rid:
            try:
                out["item"] = package.confirm(str(action["target_id"]))
            except KeyError:
                pass
        if package.opened and package.base["run_id"] == rid:
            out["run"] = package.run()
        else:
            c = conn()
            try:
                out["run"] = DBS.get_run(c, rid)
            finally:
                c.close()
        return JSONResponse(out)

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

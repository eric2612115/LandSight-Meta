"""A dropped folder, uploaded (D-81): `POST /api/projects/{project_id}/packages/upload`, multipart form data, one part
per file whose filename (or, failing that, field name) is its path relative to the dropped folder, top folder
included ("greenfield/answer_key.json", "greenfield/Greenfield Residences — Landscape Package/Drawings/…").

The body is parsed while it streams (python-multipart's low-level parser; Content-Length is never trusted): every part's
path is checked before a byte is written, and the caps are counted as the bytes arrive — 500 files, 50 MB per file,
100 MB in all; the first one passed answers 413 and the half-written upload is deleted. Files land in a staging folder
under out/uploads/, are hashed (sorted relative paths + each file's sha256), and the staging folder becomes
out/uploads/<hash>/: the same content uploaded twice is the same folder, hence the same package. Hidden files
(.DS_Store, ._*) and the files the triage skips are not written, so a Finder's litter does not change the hash.

Path rules (each rejection is 400 with the rule and the path): no empty path, no absolute path, no backslash, no NUL,
no drive letter, no empty segment, no "." or ".." segment; the path is normalised to NFC and the resolved target must
stay inside the upload folder."""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import unicodedata
import uuid
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MB = 1024 * 1024
CAPS = {"files": 500, "per_file": 50 * MB, "total": 100 * MB}
SKIP_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
DRIVE = re.compile(r"^[A-Za-z]:")


def uploads_dir() -> Path:
    return Path(os.environ.get("LANDSIGHT_UPLOADS") or REPO / "out" / "uploads")


class UploadError(Exception):
    def __init__(self, status: int, detail: str, **extra):
        super().__init__(detail)
        self.status, self.detail, self.extra = status, detail, extra

    def body(self) -> dict:
        return {"detail": self.detail, **self.extra}


def safe_path(raw: str) -> str:
    """The relative path a part names, checked and normalised (NFC), or UploadError(400)."""
    if raw is None or raw == "":
        raise UploadError(400, "a file part has no path: send its relative path as the filename", rule="empty")
    p = unicodedata.normalize("NFC", raw)
    checks = [("\x00" in p, "nul", "a NUL character"), ("\\" in p, "backslash", "a backslash (use /)"),
              (p.startswith("/"), "absolute", "an absolute path"), (bool(DRIVE.match(p)), "drive", "a drive letter"),
              (any(s == "" for s in p.split("/")), "empty_segment", "an empty segment (// or a trailing /)"),
              (any(s == ".." for s in p.split("/")), "dotdot", "a '..' segment"),
              (any(s == "." for s in p.split("/")), "dot", "a '.' segment")]
    for bad, rule, what in checks:
        if bad:
            raise UploadError(400, f"unsafe path {p!r}: {what}", rule=rule, path=p)
    return p


def target_in(folder: Path, rel: str) -> Path:
    """The file's place inside `folder`, resolved; UploadError(400) if it would land anywhere else."""
    base = folder.resolve()
    t = (base / rel).resolve()
    if not t.is_relative_to(base) or t == base:
        raise UploadError(400, f"unsafe path {rel!r}: it resolves outside the upload folder", rule="outside", path=rel)
    return t


def skipped(rel: str) -> bool:
    name = rel.rsplit("/", 1)[-1]
    return name in SKIP_NAMES or name.startswith(".")


def _disposition(raw: bytes) -> dict[str, str]:
    """name / filename from a Content-Disposition header (UTF-8 as browsers send it; filename*=UTF-8''… too; the
    HTML form encoding's %22, %0D and %0A escapes undone; a backslash is kept, so the path rules can refuse it)."""
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    out: dict[str, str] = {}
    for m in re.finditer(r';\s*([A-Za-z0-9_*-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)', text):
        k, v = m.group(1).lower(), m.group(2).strip()
        if v.startswith('"'):
            v = v[1:-1]  # browsers send a backslash as it is (and escape " as %22), so nothing is unescaped here
        if k.endswith("*"):
            from urllib.parse import unquote

            enc, _, rest = v.partition("''")
            v, k = unquote(rest, encoding=enc or "utf-8"), k[:-1]
        out[k] = v
    for esc, ch in (("%22", '"'), ("%0D", "\r"), ("%0A", "\n")):
        if "filename" in out:
            out["filename"] = out["filename"].replace(esc, ch)
    return out


@dataclass
class Received:
    staging: Path
    files: list[tuple[str, int, str]] = field(default_factory=list)  # (relative path, bytes, sha256)
    skipped: list[str] = field(default_factory=list)
    total: int = 0


async def receive(request, caps: dict | None = None) -> Received:
    """Stream the multipart body into a fresh staging folder under uploads_dir(), enforcing the path rules and the caps
    as the bytes arrive. Raises UploadError (and removes the staging folder) on the first problem."""
    from python_multipart.multipart import MultipartParser, parse_options_header

    caps = caps or CAPS
    ctype, params = parse_options_header(request.headers.get("content-type", ""))
    if ctype != b"multipart/form-data" or not params.get(b"boundary"):
        raise UploadError(422, "the body must be multipart/form-data: one part per file, filename = its relative path")
    staging = uploads_dir() / f".staging-{uuid.uuid4().hex}"
    staging.mkdir(parents=True)
    got = Received(staging)
    state: dict = {"headers": {}, "field": b"", "value": b"", "fh": None, "rel": None, "size": 0, "sha": None,
                   "seen": set()}

    def on_part_begin():
        state.update(headers={}, field=b"", value=b"", fh=None, rel=None, size=0, sha=hashlib.sha256())

    def on_header_field(data, start, end):
        state["field"] += data[start:end]

    def on_header_value(data, start, end):
        state["value"] += data[start:end]

    def on_header_end():
        state["headers"][state["field"].strip().lower()] = state["value"].strip()
        state["field"], state["value"] = b"", b""

    def on_headers_finished():
        disp = _disposition(state["headers"].get(b"content-disposition", b""))
        name, filename = disp.get("name") or "", disp.get("filename")
        raw = filename if filename and ("/" in filename or "/" not in name) else (name if "/" in name else filename)
        if raw is None:
            return  # a plain form field (no file): ignored
        rel = safe_path(raw)
        if rel in state["seen"]:
            raise UploadError(400, f"the path {rel!r} is sent twice", rule="duplicate", path=rel)
        state["seen"].add(rel)
        if len(state["seen"]) > caps["files"]:
            raise UploadError(413, f"too many files: the cap is {caps['files']} files per upload", cap="files",
                              limit=caps["files"], path=rel)
        state["rel"] = rel
        if skipped(rel):
            got.skipped.append(rel)
            return
        t = target_in(staging, rel)
        try:
            t.parent.mkdir(parents=True, exist_ok=True)
            state["fh"] = t.open("wb")
        except OSError as e:  # "a/b" after a file "a", or the other way round
            raise UploadError(400, f"the path {rel!r} conflicts with another file in the upload", rule="conflict",
                              path=rel) from e

    def on_part_data(data, start, end):
        if state["rel"] is None:
            return
        n = end - start
        state["size"] += n
        got.total += n
        if state["size"] > caps["per_file"]:
            raise UploadError(413, f"file too large: {state['rel']!r} passes the {caps['per_file'] // MB} MB per-file cap",
                              cap="per_file", limit=caps["per_file"], path=state["rel"])
        if got.total > caps["total"]:
            raise UploadError(413, f"upload too large: the {caps['total'] // MB} MB total cap is passed at "
                                   f"{state['rel']!r}", cap="total", limit=caps["total"], path=state["rel"])
        if state["fh"] is not None:
            state["fh"].write(data[start:end])
            state["sha"].update(data[start:end])

    def on_part_end():
        if state["fh"] is not None:
            state["fh"].close()
            got.files.append((state["rel"], state["size"], state["sha"].hexdigest()))
            state["fh"] = None

    parser = MultipartParser(params[b"boundary"], {
        "on_part_begin": on_part_begin, "on_header_field": on_header_field, "on_header_value": on_header_value,
        "on_header_end": on_header_end, "on_headers_finished": on_headers_finished, "on_part_data": on_part_data,
        "on_part_end": on_part_end})
    try:
        async for chunk in request.stream():
            if chunk:
                parser.write(chunk)
        parser.finalize()
    except UploadError:
        _close(state)
        shutil.rmtree(staging, ignore_errors=True)
        raise
    except Exception as e:  # noqa: BLE001 - a malformed body, whatever the parser says about it
        _close(state)
        shutil.rmtree(staging, ignore_errors=True)
        raise UploadError(422, f"a malformed multipart body: {type(e).__name__}: {str(e)[:120]}") from e
    if state["fh"] is not None:  # the body ended inside a part
        _close(state)
        shutil.rmtree(staging, ignore_errors=True)
        raise UploadError(422, "a malformed multipart body: it ends inside a file part")
    if not got.files:
        shutil.rmtree(staging, ignore_errors=True)
        raise UploadError(400, "an empty upload: no file parts (send one part per file of the dropped folder)")
    return got


def _close(state: dict) -> None:
    if state.get("fh") is not None:
        try:
            state["fh"].close()
        except OSError:
            pass
        state["fh"] = None


def content_id(files: list[tuple[str, int, str]]) -> str:
    """The upload's id: a hash of the sorted relative paths and each file's sha256 (same content → same id)."""
    h = hashlib.sha256()
    for rel, _, sha in sorted(files):
        h.update(rel.encode())
        h.update(b"\0")
        h.update(sha.encode())
        h.update(b"\n")
    return h.hexdigest()[:16]


def settle(got: Received) -> tuple[str, Path, bool]:
    """Move the staging folder to out/uploads/<id>/ (or drop it when that content is already there). Returns (id,
    the folder to register, reused). The folder to register is the dropped folder: the single top folder when the
    upload has one, else the upload's root."""
    uid = content_id(got.files)
    final = uploads_dir() / uid
    reused = final.is_dir()
    if reused:
        shutil.rmtree(got.staging, ignore_errors=True)
    else:
        got.staging.rename(final)
    tops = {rel.split("/", 1)[0] for rel, _, _ in got.files}
    top_files = [rel for rel, _, _ in got.files if "/" not in rel]
    folder = final / next(iter(tops)) if len(tops) == 1 and not top_files else final
    return uid, folder, reused

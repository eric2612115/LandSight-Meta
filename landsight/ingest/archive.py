"""Unpack an archive into a temporary folder without trusting its member names: no absolute paths, no '..', no drive
letters, no symlinks, a cap on member count and unpacked size (a zip bomb stops with an error, not a full disk)."""

from __future__ import annotations

import stat
import zipfile
from pathlib import Path, PurePosixPath

MAX_MEMBERS = 500
MAX_BYTES = 200 * 1024 * 1024


class UnsafeArchive(ValueError):
    pass


def _safe_name(name: str) -> PurePosixPath:
    p = PurePosixPath(name.replace("\\", "/"))
    if p.is_absolute() or any(part in ("..", "") for part in p.parts if part != ".") or ":" in p.parts[0]:
        raise UnsafeArchive(f"unsafe member name {name!r}")
    return p


def unpack_zip(path: Path, dest: Path) -> list[Path]:
    """Extract the regular files of `path` under `dest`; returns their paths. Raises UnsafeArchive on any member that
    would land outside `dest`, on symlinks, and on archives over the member or size caps."""
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    out: list[Path] = []
    with zipfile.ZipFile(path) as z:
        infos = z.infolist()
        if len(infos) > MAX_MEMBERS:
            raise UnsafeArchive(f"{len(infos)} members (cap {MAX_MEMBERS})")
        if sum(i.file_size for i in infos) > MAX_BYTES:
            raise UnsafeArchive("unpacked size over the cap")
        for info in infos:
            if info.is_dir():
                continue
            if stat.S_ISLNK(info.external_attr >> 16):
                raise UnsafeArchive(f"symlink member {info.filename!r}")
            rel = _safe_name(info.filename)
            target = (dest / Path(*rel.parts)).resolve()
            if not target.is_relative_to(dest):
                raise UnsafeArchive(f"member {info.filename!r} escapes the folder")
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, target.open("wb") as dst:
                remaining = MAX_BYTES
                while chunk := src.read(1 << 16):
                    remaining -= len(chunk)
                    if remaining < 0:
                        raise UnsafeArchive("member larger than declared")
                    dst.write(chunk)
            out.append(target)
    return out

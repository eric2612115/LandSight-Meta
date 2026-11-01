"""Walk a package folder and give every file a verdict (docs/PACKAGE.md "Triage verdicts", docs/API.md FileVerdict).

By extension first, then by content where the extension does not settle it: a .bak is compared with the DXFs beside
it, a .zip is unpacked (safely) and its members triaged as children, an .xlsx is a bill or a quote by what its sheets
say, a PDF is split into vector / raster / text pages. Images and text PDFs are left provisional here; Muse Spark
decides them (landsight.review), and `decide_image` / `decide_document` record its answer. Every verdict carries
`decided_by` (ext | content | spark) and a one-line `why`."""

from __future__ import annotations

import hashlib
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from landsight.ingest import pdf as P
from landsight.ingest.archive import UnsafeArchive, unpack_zip

SKIP = {".DS_Store", "Thumbs.db", "desktop.ini"}
IMAGE_EXT = {".png", ".jpg", ".jpeg"}
UNSUPPORTED_WHY = {".xls": "Excel 97–2003, save as .xlsx", ".dwg": "DWG: save as DXF to be read",
                   ".rar": "RAR archive: unpack it or save as .zip", ".skp": "SketchUp model: not a drawing sheet",
                   ".shx": "AutoCAD font file: not a drawing", ".doc": "Word 97–2003: save as .docx or PDF"}


@dataclass
class FileRecord:
    file_id: str
    path: str  # relative to the package folder (an archive member: "<zip path>/<member>")
    abs_path: Path
    name: str
    ext: str
    size_bytes: int
    verdict: str = "unreadable"
    decided_by: str = "ext"
    why: str = ""
    parent: str | None = None
    children: list[str] = field(default_factory=list)
    sheet_ids: list[str] = field(default_factory=list)
    model: object | None = None  # dxf.Model for DXF files
    pages: list = field(default_factory=list)  # ingest.pdf.Page for PDFs
    text: str = ""  # extracted text of a text PDF
    data: bytes | None = None  # image bytes
    spark: dict | None = None  # Muse Spark's answer about this file (image, document, raster title block)
    facts: dict = field(default_factory=dict)  # backup_of, sheet_names, bill header ...

    def api(self) -> dict:
        out = {"file_id": self.file_id, "path": self.path, "name": self.name, "ext": self.ext,
               "size_bytes": self.size_bytes, "verdict": self.verdict, "decided_by": self.decided_by, "why": self.why}
        if len(self.sheet_ids) == 1:
            out["sheet_id"] = self.sheet_ids[0]
        elif self.sheet_ids:
            out["sheet_id"] = self.sheet_ids[0]
            out["sheet_ids"] = list(self.sheet_ids)
        if self.children:
            out["children"] = list(self.children)
        if self.parent:
            out["parent"] = self.parent
        return out


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_dxf(rec: FileRecord) -> None:
    from landsight.dxf import load

    try:
        rec.model = load(rec.abs_path)
    except Exception as e:  # not a DXF after all, or damaged
        rec.verdict, rec.decided_by, rec.why = "unreadable", "content", f"DXF that ezdxf cannot read ({type(e).__name__})"
        return
    m = rec.model
    rec.verdict, rec.decided_by = "drawing_vector", "ext"
    rec.why = f"DXF: vector drawing, {len(m.entities)} lines and curves, {len(m.texts)} texts, {len(m.hatches)} hatches"


def _xlsx(rec: FileRecord) -> None:
    import openpyxl

    try:
        wb = openpyxl.load_workbook(rec.abs_path, read_only=True, data_only=True)
    except Exception as e:
        rec.verdict, rec.decided_by, rec.why = "unreadable", "content", f"spreadsheet that cannot be opened ({type(e).__name__})"
        return
    words = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(min_row=1, max_row=6, values_only=True):
            words += [str(v) for v in row if isinstance(v, str)]
    wb.close()
    head = " ".join(words).lower()
    if "quotation" in head or "quote" in head:
        rec.verdict, rec.why = "quote", "spreadsheet headed as a quotation"
    else:
        rec.verdict = "bill"
        line = next((w for w in words if "bill of quantities" in w.lower() or "boq" in w.lower()), "")
        rec.why = f"bill of quantities: {line}" if line else "spreadsheet of quantities and prices (read as a bill)"
    rec.decided_by = "content"


def _pptx(rec: FileRecord) -> None:
    rec.verdict, rec.decided_by = "presentation", "ext"
    try:
        from pptx import Presentation

        deck = Presentation(str(rec.abs_path))
        titles = [sh.text_frame.text.strip() for s in deck.slides for sh in s.shapes
                  if sh.has_text_frame and sh.text_frame.text.strip()]
        rec.why = f"slide deck, {len(deck.slides)} slides" + (f": {titles[0][:60]}" if titles else "") + "; not a drawing"
    except Exception:
        rec.why = "slide deck: not a drawing"


def _pdf(rec: FileRecord) -> None:
    try:
        rec.pages = P.pages(rec.abs_path)
    except Exception as e:
        rec.verdict, rec.decided_by, rec.why = "unreadable", "content", f"PDF that cannot be opened ({type(e).__name__})"
        return
    kinds = {p.kind for p in rec.pages}
    rec.decided_by = "content"
    if kinds == {"vector"}:
        rec.verdict, rec.why = "drawing_vector", f"PDF, {P.summary(rec.pages)}: drawing sheets"
    elif kinds <= {"raster", "empty"} and "raster" in kinds:
        rec.verdict, rec.why = "drawing_raster", f"PDF, {P.summary(rec.pages)}: a raster drawing, nothing to measure"
    elif "text" in kinds and "vector" not in kinds:
        rec.text = "\n".join(p.text for p in rec.pages)
        rec.verdict, rec.why = "spec", f"PDF, {P.summary(rec.pages)} (provisional: Muse Spark reads it)"
    elif "vector" in kinds:
        rec.verdict, rec.why = "drawing_vector", f"PDF, {P.summary(rec.pages)}"
    else:
        rec.verdict, rec.why = "unreadable", "PDF with no text, no vectors and no images"


def _backup(rec: FileRecord, all_files: list[Path]) -> None:
    rec.verdict, rec.decided_by = "backup_ignored", "content"
    sha = _sha(rec.abs_path)
    dxfs = sorted(p for p in all_files if p.suffix.lower() == ".dxf")
    same = next((p for p in dxfs if p.stat().st_size == rec.size_bytes and _sha(p) == sha), None)
    if same is not None:
        rec.facts["backup_of"] = str(same)
        rec.why = f"AutoCAD backup, byte-identical to {same.name}: ignored"
        return
    try:  # a near-identical backup: same drawing content (ezdxf signature ignores handles and timestamps)
        from landsight.dxf import load

        sig = load(rec.abs_path).signature()
        for p in dxfs:
            if load(p).signature() == sig:
                rec.facts["backup_of"] = str(p)
                rec.why = f"AutoCAD backup with the same drawing content as {p.name}: ignored"
                return
    except Exception:
        pass
    rec.decided_by = "ext"
    rec.why = "AutoCAD backup (.bak) with no matching DXF in the package: ignored"


def walk(root: Path, workdir: Path) -> list[FileRecord]:
    """Every file under `root` (sorted by path) with its first verdict, plus archive members as child records."""
    root = Path(root)
    files = sorted((p for p in root.rglob("*") if p.is_file() and p.name not in SKIP and not p.name.startswith(".")),
                   key=lambda p: p.relative_to(root).as_posix())
    records: list[FileRecord] = []
    children: list[FileRecord] = []
    for n, p in enumerate(files, 1):
        rec = FileRecord(f"F-{n:02d}", p.relative_to(root).as_posix(), p, p.name, p.suffix.lower(), p.stat().st_size)
        _first_verdict(rec, files)
        if rec.ext == ".zip":
            children += _unpack(rec, Path(workdir) / rec.file_id)
        records.append(rec)
    return records + children


def _first_verdict(rec: FileRecord, all_files: list[Path]) -> None:
    ext = rec.ext
    if ext == ".dxf":
        _load_dxf(rec)
    elif ext == ".bak":
        _backup(rec, all_files)
    elif ext in UNSUPPORTED_WHY:
        rec.verdict, rec.decided_by, rec.why = "unsupported", "ext", UNSUPPORTED_WHY[ext]
    elif ext == ".xlsx":
        _xlsx(rec)
    elif ext == ".pptx":
        _pptx(rec)
    elif ext in IMAGE_EXT:
        rec.data = rec.abs_path.read_bytes()
        rec.verdict, rec.decided_by, rec.why = "drawing_image", "ext", "image (provisional: Muse Spark looks at it)"
    elif ext == ".pdf":
        _pdf(rec)
    elif ext == ".zip":
        rec.verdict, rec.decided_by = "archive_unpacked", "ext"
    else:
        rec.verdict, rec.decided_by = "unsupported", "ext"
        rec.why = f"{ext or 'no extension'}: not a format Landsight reads"


def _unpack(rec: FileRecord, dest: Path) -> list[FileRecord]:
    dest.mkdir(parents=True, exist_ok=True)
    dest = dest.resolve()
    try:
        members = unpack_zip(rec.abs_path, dest)
    except zipfile.BadZipFile as e:  # not a zip at all, or a damaged one: this file only, never the package
        rec.verdict, rec.decided_by, rec.why = "unreadable", "content", f"not a valid zip ({e})"
        return []
    except (UnsafeArchive, OSError, ValueError) as e:
        rec.verdict, rec.decided_by, rec.why = "unreadable", "content", f"archive not unpacked: {e}"
        return []
    except Exception as e:  # noqa: BLE001 - encrypted, unknown compression, a broken member stream
        rec.verdict, rec.decided_by, rec.why = "unreadable", "content", f"archive not unpacked ({type(e).__name__}: {e})"
        return []
    out = []
    for i, m in enumerate(sorted(members, key=lambda q: q.relative_to(dest).as_posix()), 1):
        rel = m.relative_to(dest).as_posix()
        child = FileRecord(f"{rec.file_id}-{i}", f"{rec.path}/{rel}", m, m.name, m.suffix.lower(), m.stat().st_size,
                           parent=rec.file_id)
        _first_verdict(child, [m])
        out.append(child)
        rec.children.append(child.file_id)
    names = ", ".join(c.name for c in out) or "nothing"
    rec.why = f"zip unpacked: {len(out)} file{'s' if len(out) != 1 else ''} ({names})"
    rec.decided_by = "content"
    return out


# --------------------------------------------------------------------------------------------- Muse Spark's answers


def decide_image(rec: FileRecord, answer: dict | None, error: str = "") -> None:
    """An image: a material photo (matched to a finish code) or a drawing; either way read, not measured."""
    rec.spark = answer
    rec.verdict = "drawing_image"
    if not answer:
        rec.decided_by, rec.why = "ext", f"image: kept for reference, not measured ({error or 'Muse Spark not asked'})"
        return
    rec.decided_by = "spark"
    if answer.get("kind") == "material_photo":
        code = finish_code(answer.get("matches_code"))
        match = f" → matched to {code}" if code.lower() != "none" else ", no finish code matched"
        rec.why = f"material photo: {answer.get('material') or 'material'}{match}; read, not measured"
    else:
        rec.why = f"image ({answer.get('kind')}): {answer.get('why', '')[:90]}; read, not measured"


def finish_code(text: str | None) -> str:
    """'PV-2 EXPOSED AGGREGATE' or 'PV-2' -> 'PV-2'; anything else -> 'none'."""
    m = re.match(r"^\s*([A-Z]{1,3}-?\d{0,2})\b", text or "")
    return m.group(1) if m and (text or "").strip().lower() != "none" else "none"


def decide_document(rec: FileRecord, answer: dict | None, error: str = "") -> None:
    rec.spark = answer
    if not answer:
        rec.decided_by = "content"
        rec.verdict = "spec"
        rec.why = f"text PDF ({error or 'Muse Spark not asked'}): kept as a specification, not summarised"
        return
    kind = answer.get("kind", "document")
    rec.verdict = {"spec": "spec", "quote": "quote", "bill": "bill"}.get(kind, "document")
    rec.decided_by = "spark"
    rec.why = f"{rec.verdict}: {answer.get('summary') or answer.get('title', '')}"[:200]


def decide_raster(rec: FileRecord, answer: dict | None, error: str = "") -> None:
    rec.spark = answer
    tb = (answer or {}).get("title_block") or {}
    if answer and (tb.get("number") or tb.get("title")):
        rec.decided_by = "spark"
        bits = [b for b in (tb.get("number"), tb.get("title"), f"Rev {tb['revision']}" if tb.get("revision") else "",
                            tb.get("date"), tb.get("scale")) if b]
        rec.why = f"raster PDF, no vectors: Muse Spark read the title block ({' · '.join(bits)}); not measured"
    else:
        rec.why = f"raster PDF, no vectors: not measured ({error or 'no title block read'})"

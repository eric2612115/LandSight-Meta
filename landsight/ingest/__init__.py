"""Package triage: walk a folder, give every file a verdict (by extension, by content, or by Muse Spark), unpack
archives safely, split PDFs into vector / raster / text pages."""

from landsight.ingest.archive import UnsafeArchive, unpack_zip
from landsight.ingest.triage import FileRecord, decide_document, decide_image, decide_raster, walk

__all__ = ["FileRecord", "UnsafeArchive", "decide_document", "decide_image", "decide_raster", "unpack_zip", "walk"]

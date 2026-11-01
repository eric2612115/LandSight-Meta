"""Exact geometry with shapely: close loose line work into shapes (with gap snapping), cluster what stays open,
find the legend / title block / schedule boxes, and expand labels such as "@3m", "x8", "8-" and "typ."."""

from landsight.geometry.close import (Candidate, CloseResult, Leader, Shape, canopy_shapes, close, hedge_bands,
                                      is_canopy)
from landsight.geometry.labels import Expansion, expand, spacing_count
from landsight.geometry.regions import Region, exclude, find_regions

__all__ = ["Candidate", "CloseResult", "Expansion", "Leader", "Region", "Shape", "canopy_shapes", "close", "exclude",
           "expand", "find_regions", "hedge_bands", "is_canopy", "spacing_count"]

"""Ask the package: the owner's question answered by Muse
Spark from the package's own material, with the file, page and sentence each fact came from, plus actions that turn
the answer into a confirmed element, a confirmed price, a regulation note or a flag."""

from landsight.ask.ask import apply_action, ask
from landsight.ask.corpus import Chunk, build_corpus
from landsight.ask.retrieve import retrieve

__all__ = ["Chunk", "apply_action", "ask", "build_corpus", "retrieve"]

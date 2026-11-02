"""BM25 over the package's chunks (no vector database): a question's words against each chunk's words, with numbers
normalised (1,500 -> 1500), codes kept whole (PV-1, L-6, E19), a light stemmer and a few owner's words expanded to the
package's (current -> latest). At most `per_file` chunks come from one file and at most PER_KIND from one kind, so a
long bill cannot crowd out the spec that answers the question."""

from __future__ import annotations

import math
import re
from collections import Counter

TOKEN = re.compile(r"[a-z]{1,4}-\d+[a-z]?|[a-z]+|\d+(?:\.\d+)?")
STOP = set("""a an and are as at be by can do does for from has have how i in is it its of on or our that the
this to was what when where which who why will with this these those any all there their them than then so if not
no yes me my we you your about into over under per vs""".split())


# a few words an owner uses for what the package calls something else (query side only)
EXPAND = {"current": ["latest"], "chang": ["differ", "version"], "spec": ["standard", "specification"],
          "slab": ["artificial", "podium", "roof"], "apply": ["exempt", "applic"], "requir": ["minimum"],
          "permeable": ["pervious"], "flag": ["under", "over"], "camphor": ["camphore"], "price": ["rate"],
          "checklist": ["required"], "revision": ["version"], "paving": ["paver"]}
PER_KIND = {"bill_row": 4, "rule": 6, "check": 5}  # the same bill row repeats across versions; the rule table is long


def stem(w: str) -> str:
    if not w.isalpha() or len(w) <= 4:
        return w
    for suf in ("ing", "ed", "es", "s"):
        if w.endswith(suf) and len(w) - len(suf) >= 4 and not w.endswith("ss"):
            w = w[: -len(suf)]
            break
    if len(w) > 4 and w[-1] == w[-2] and w[-1] not in "aeiouls":
        w = w[:-1]  # flagged -> flagg -> flag
    return w[:-1] if len(w) > 4 and w.endswith("e") else w


def tokens(text: str) -> list[str]:
    t = re.sub(r"(?<=\d),(?=\d{3}\b)", "", (text or "").lower())
    t = t.replace("²", "2").replace("article", "art").replace("§", " art ")
    return [stem(w) for w in TOKEN.findall(t) if w not in STOP]


def query_tokens(question: str) -> list[str]:
    q = tokens(question)
    for w in list(q):
        q += [stem(x) for x in EXPAND.get(w, [])]
    return list(dict.fromkeys(q))


def retrieve(question: str, chunks: list, k: int = 14, per_file: int = 4, k1: float = 1.4, b: float = 0.75,
             max_chars: int = 11000) -> list[tuple[float, object]]:
    """The top chunks for a question as (score, chunk), best first."""
    docs = [tokens(c.text) for c in chunks]
    n = len(docs) or 1
    avg = sum(len(d) for d in docs) / n or 1.0
    df: Counter = Counter()
    for d in docs:
        df.update(set(d))
    q = query_tokens(question)
    scored = []
    for c, d in zip(chunks, docs):
        tf = Counter(d)
        s = 0.0
        for w in q:
            if w not in tf:
                continue
            idf = math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5))
            s += idf * tf[w] * (k1 + 1) / (tf[w] + k1 * (1 - b + b * len(d) / avg))
        if s > 0:
            scored.append((round(s, 4), c))
    scored.sort(key=lambda sc: (-sc[0], sc[1].chunk_id))
    out, per, kinds, chars = [], Counter(), Counter(), 0
    for s, c in scored:
        if per[c.file_id] >= per_file or kinds[c.kind] >= PER_KIND.get(c.kind, k):
            continue
        if out and chars + len(c.text) > max_chars:
            continue
        out.append((s, c))
        per[c.file_id] += 1
        kinds[c.kind] += 1
        chars += len(c.text)
        if len(out) >= k:
            break
    return out

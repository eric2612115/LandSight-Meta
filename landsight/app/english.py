"""Every human-readable string the API returns is English. The current synthetic site is still drawn in Chinese, so
labels, titles and model answers are mapped here; any Chinese left after the glossary is dropped (only citation
URLs may carry it). When the English site lands, the glossary simply stops matching."""

from __future__ import annotations

import re

GLOSSARY = {  # longest first at use time
    "綠邑社區景觀工程": "Greenfield Residences landscape works",
    "植栽配置平面圖": "Planting Plan", "南向立面圖": "South Elevation", "鋪面計畫圖": "Paving Plan",
    "植栽表合計": "plant schedule total", "植栽表": "plant schedule", "數量表": "quantity schedule", "圖例": "legend",
    "計畫道路": "planned road", "工程名稱": "project", "圖名": "title", "圖號": "drawing no.", "比例": "scale",
    "基地面積": "site area", "建蔽率": "building coverage", "日期": "date",
    "樟樹": "Camphor", "茄苳": "Bischofia", "茄冬": "Bischofia", "欒樹": "Flamegold (golden-rain tree)",
    "小葉欖仁": "Madagascar almond", "金露花": "Duranta", "杜鵑": "Azalea",
    "草皮": "Lawn", "草坪": "Lawn", "透水磚": "Permeable pavers", "洗石子": "Exposed aggregate", "植草磚": "Grass pavers",
    "花台": "Planter edge", "花臺": "Planter edge",
    "生態複層": "multilayer planting", "闊葉大喬木": "broadleaf large tree", "闊葉小喬木": "small broadleaf tree",
    "針葉喬木": "conifer", "疏葉喬木": "sparse-leaf tree", "棕櫚類": "palm", "灌木": "shrub", "多年生蔓藤": "perennial vine",
    "草花花圃": "flower bed", "喬木": "trees", "圖面": "drawing",
    "雙排": "2 rows", "米高徑": "cal.", "米徑": "cal.", "株/m²": "plants/m²", "株": "plants",
}
_KEYS = sorted(GLOSSARY, key=len, reverse=True)
_CJK = re.compile(r"[⺀-鿿豈-﫿　-〿＀-￯]+")

SPECIES_CODE = {  # provisional codes until the English site sets its own (Camphor CC is the package's)
    "Camphor": "CC", "Bischofia": "BJ", "Duranta": "DU", "Azalea": "AZ", "Lawn": "LN", "Permeable pavers": "PP",
    "Exposed aggregate": "EA", "Grass pavers": "GP", "Planter edge": "PE",
}
SHEET_KIND_EN = {"plan": "plan", "elevation": "elevation", "detail": "detail", "schedule": "schedule", "legend": "legend"}
URL_KEYS = {"url", "svg_url", "png_url", "crop_url", "filled_png_url"}


def en(text):
    """English for one string: glossary terms replaced, leftover CJK removed, spacing tidied."""
    if not isinstance(text, str) or not text:
        return text
    if not _CJK.search(text):
        return text
    out = text
    for k in _KEYS:
        if k in out:
            out = out.replace(k, f" {GLOSSARY[k]} ")
    out = _CJK.sub(" ", out)
    out = re.sub(r"\s+([,.;:)\]])", r"\1", re.sub(r"([(\[])\s+", r"\1", re.sub(r"\s{2,}", " ", out)))
    return out.strip()


def deep(obj, key: str | None = None):
    """en() over every string value in a JSON-like structure, except URLs."""
    if isinstance(obj, dict):
        return {en(k): (v if k in URL_KEYS else deep(v, k)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [deep(v, key) for v in obj]
    return en(obj) if isinstance(obj, str) else obj


def label(name: str) -> str:
    return en(name) or name


def code(name: str) -> str | None:
    return SPECIES_CODE.get(label(name))


def has_cjk(text: str) -> bool:
    return bool(_CJK.search(text or ""))

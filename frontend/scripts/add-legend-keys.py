"""Add deadline legend keys."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "deadline.legend.under_7d": "< 7d",
        "deadline.legend.under_30d": "< 30d",
        "deadline.legend.over_30d": "30d+",
    },
    "ar": {
        "deadline.legend.under_7d": "أقل من 7 أيام",
        "deadline.legend.under_30d": "أقل من 30 يومًا",
        "deadline.legend.over_30d": "30+ يومًا",
    },
    "fr": {
        "deadline.legend.under_7d": "< 7j",
        "deadline.legend.under_30d": "< 30j",
        "deadline.legend.over_30d": "30j+",
    },
    "es": {
        "deadline.legend.under_7d": "< 7d",
        "deadline.legend.under_30d": "< 30d",
        "deadline.legend.over_30d": "30d+",
    },
    "sw": {
        "deadline.legend.under_7d": "< siku 7",
        "deadline.legend.under_30d": "< siku 30",
        "deadline.legend.over_30d": "siku 30+",
    },
    "so": {
        "deadline.legend.under_7d": "< 7 maalmood",
        "deadline.legend.under_30d": "< 30 maalmood",
        "deadline.legend.over_30d": "30+ maalmood",
    },
}

for lang, additions in KEYS.items():
    p = ROOT / f"{lang}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    added = 0
    for k, v in additions.items():
        if k not in data:
            data[k] = v
            added += 1
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{lang}: +{added}")

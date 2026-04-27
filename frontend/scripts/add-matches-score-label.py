"""Tiny addition: matches.score_label."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"
KEY = "matches.score_label"
VALUES = {
    "en": "match",
    "ar": "توافق",
    "fr": "correspondance",
    "es": "coincidencia",
    "sw": "ulinganifu",
    "so": "isku-dhig",
}
for lang, val in VALUES.items():
    p = ROOT / f"{lang}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    if KEY not in data:
        data[KEY] = val
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{lang}: added")

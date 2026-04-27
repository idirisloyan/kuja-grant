"""Add grant.tab.qa key to all langs."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"
KEY = "grant.tab.qa"
VALUES = {
    "en": "Q&A",
    "ar": "أسئلة وأجوبة",
    "fr": "Q&R",
    "es": "P&R",
    "sw": "Maswali",
    "so": "Su'aalo",
}
for lang, val in VALUES.items():
    p = ROOT / f"{lang}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    if KEY not in data:
        data[KEY] = val
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{lang}: added")
    else:
        print(f"{lang}: exists")

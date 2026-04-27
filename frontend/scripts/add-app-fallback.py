"""Add 'Application #N' label fallback key."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"
KEY = "applications.label_fallback"
VALUES = {
    "en": "Application #{n}",
    "ar": "الطلب #{n}",
    "fr": "Candidature #{n}",
    "es": "Postulación #{n}",
    "sw": "Ombi #{n}",
    "so": "Codsi #{n}",
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

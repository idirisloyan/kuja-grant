"""Phase 4.2 — i18n keys for the live drafters pill."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "drafters.label": "drafting now",
        "drafters.tooltip": "Active drafts in the last {days} days",
    },
    "ar": {
        "drafters.label": "يحضّرون الآن",
        "drafters.tooltip": "مسوّدات نشطة خلال آخر {days} يوم",
    },
    "fr": {
        "drafters.label": "rédigent maintenant",
        "drafters.tooltip": "Brouillons actifs dans les {days} derniers jours",
    },
    "es": {
        "drafters.label": "redactando ahora",
        "drafters.tooltip": "Borradores activos en los últimos {days} días",
    },
    "sw": {
        "drafters.label": "wanaandika sasa",
        "drafters.tooltip": "Rasimu zinazoendelea katika siku {days} zilizopita",
    },
    "so": {
        "drafters.label": "qoraya hadda",
        "drafters.tooltip": "Qabyada firfircoon {days} maalmood ee la soo dhaafay",
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

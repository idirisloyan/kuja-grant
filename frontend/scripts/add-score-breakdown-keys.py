"""Phase 5.2 + voice profile keys."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "score_breakdown.tooltip": "Click to see how this score breaks down",
        "score_breakdown.empty": "No component data available for this score.",
        "score_breakdown.max_total": "Components sum to {n} max points",
        "match.component.eligibility": "Eligibility match",
        "match.component.sector": "Sector overlap",
        "match.component.geography": "Geography overlap",
        "match.component.capacity": "Capacity vs grant burden",
        "match.component.track_record": "Track record",
    },
    "ar": {
        "score_breakdown.tooltip": "انقر لمعرفة كيفية حساب هذه الدرجة",
        "score_breakdown.empty": "لا توجد بيانات مكوّنات لهذه الدرجة.",
        "score_breakdown.max_total": "مجموع نقاط المكونات الأقصى: {n}",
        "match.component.eligibility": "تطابق الأهلية",
        "match.component.sector": "تطابق القطاع",
        "match.component.geography": "تطابق الجغرافيا",
        "match.component.capacity": "القدرة مقابل عبء المنحة",
        "match.component.track_record": "السجل السابق",
    },
    "fr": {
        "score_breakdown.tooltip": "Cliquez pour voir la décomposition du score",
        "score_breakdown.empty": "Aucune donnée de composante disponible.",
        "score_breakdown.max_total": "Les composantes totalisent {n} points max",
        "match.component.eligibility": "Correspondance d'éligibilité",
        "match.component.sector": "Recoupement sectoriel",
        "match.component.geography": "Recoupement géographique",
        "match.component.capacity": "Capacité vs charge de la subvention",
        "match.component.track_record": "Historique",
    },
    "es": {
        "score_breakdown.tooltip": "Haz clic para ver cómo se desglosa este puntaje",
        "score_breakdown.empty": "No hay datos de componentes disponibles.",
        "score_breakdown.max_total": "Los componentes suman {n} puntos máx.",
        "match.component.eligibility": "Coincidencia de elegibilidad",
        "match.component.sector": "Coincidencia sectorial",
        "match.component.geography": "Coincidencia geográfica",
        "match.component.capacity": "Capacidad vs carga de la subvención",
        "match.component.track_record": "Trayectoria",
    },
    "sw": {
        "score_breakdown.tooltip": "Bofya kuona jinsi alama hii imegawanywa",
        "score_breakdown.empty": "Hakuna data ya vipengele kwa alama hii.",
        "score_breakdown.max_total": "Vipengele vinajumlisha pointi {n} za juu",
        "match.component.eligibility": "Kufanana kwa ustahiki",
        "match.component.sector": "Kufanana kwa sekta",
        "match.component.geography": "Kufanana kwa eneo",
        "match.component.capacity": "Uwezo dhidi ya mzigo wa ruzuku",
        "match.component.track_record": "Rekodi ya zamani",
    },
    "so": {
        "score_breakdown.tooltip": "Guji si aad u aragto sida buundadan loo qaybiyey",
        "score_breakdown.empty": "Ma jiraan xog qayb-qayb ah oo buundadan u diyaar ah.",
        "score_breakdown.max_total": "Qaybaha waxay isku gaadhayaan dhibco {n} oo ugu badan",
        "match.component.eligibility": "Isku-dhigan xaq-u-yeelashada",
        "match.component.sector": "Isku-dhigan qaybeed",
        "match.component.geography": "Isku-dhigan juqraafi",
        "match.component.capacity": "Awoodda iyo culayska deeqda",
        "match.component.track_record": "Taariikhda hore",
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

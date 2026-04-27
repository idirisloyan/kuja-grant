"""Phase 3.2 — i18n keys for the NGO opportunity feed."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "matches.heading": "Best matches for you",
        "matches.subtitle": "Open grants ranked by your win probability",
        "matches.recompute": "Refresh",
        "matches.empty.title": "No matches yet",
        "matches.empty.body": "We'll surface ranked grants once we've scored you against the open call list.",
    },
    "ar": {
        "matches.heading": "أفضل المنح المناسبة لك",
        "matches.subtitle": "المنح المفتوحة مرتّبة حسب احتمال الفوز بها",
        "matches.recompute": "تحديث",
        "matches.empty.title": "لا توجد توافقات بعد",
        "matches.empty.body": "سنعرض هنا المنح المرتّبة بمجرد تقييم منظمتك مقابل قائمة المنح المفتوحة.",
    },
    "fr": {
        "matches.heading": "Meilleures correspondances pour vous",
        "matches.subtitle": "Subventions ouvertes classées par probabilité de succès",
        "matches.recompute": "Actualiser",
        "matches.empty.title": "Aucune correspondance pour l'instant",
        "matches.empty.body": "Nous afficherons des subventions classées dès que nous vous aurons évalué par rapport aux appels ouverts.",
    },
    "es": {
        "matches.heading": "Tus mejores coincidencias",
        "matches.subtitle": "Subvenciones abiertas ordenadas por probabilidad de éxito",
        "matches.recompute": "Actualizar",
        "matches.empty.title": "Aún no hay coincidencias",
        "matches.empty.body": "Mostraremos subvenciones priorizadas en cuanto tengamos tu evaluación frente a las convocatorias abiertas.",
    },
    "sw": {
        "matches.heading": "Ulingano bora zaidi kwako",
        "matches.subtitle": "Ruzuku zilizo wazi zikiwa zimepangwa kulingana na uwezekano wa kufaulu",
        "matches.recompute": "Onyesha upya",
        "matches.empty.title": "Bado hakuna ulingano",
        "matches.empty.body": "Tutaonyesha ruzuku zilizopangwa mara baada ya kukutathmini dhidi ya ruzuku zilizo wazi.",
    },
    "so": {
        "matches.heading": "Deeqaha ugu wanaagsan adiga",
        "matches.subtitle": "Deeqaha furan oo loo kala saaray itimaalka aad ku guulaysan karto",
        "matches.recompute": "Cusboonaysii",
        "matches.empty.title": "Wali ma jiraan deeqo ku habboon",
        "matches.empty.body": "Waxaan halkan ku tusi doonaa deeqaha la kala saaray markii aan kuu qiimeyno liiska deeqaha furan.",
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

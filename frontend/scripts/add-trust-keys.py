"""Phase 5.4 + 5.1 UI — i18n keys for confidence badge + provenance chips."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "ai.confidence.high.tooltip": "High — claim is directly supported by a named source we can show you.",
        "ai.confidence.medium.tooltip": "Medium — claim is reasonable based on your sources but check the specifics.",
        "ai.confidence.low.tooltip": "Low — generic claim or extrapolation; verify before submitting.",
        "provenance.loading": "Loading sources…",
        "provenance.empty": "No source citations recorded for this section.",
    },
    "ar": {
        "ai.confidence.high.tooltip": "مرتفعة — مدعومة بمصدر محدد يمكننا عرضه لك.",
        "ai.confidence.medium.tooltip": "متوسطة — معقولة استناداً إلى مصادرك، لكن تحقق من التفاصيل.",
        "ai.confidence.low.tooltip": "منخفضة — ادعاء عام أو استنتاج موسّع؛ تحقق قبل التقديم.",
        "provenance.loading": "جارٍ تحميل المصادر…",
        "provenance.empty": "لا توجد مصادر مسجّلة لهذا القسم.",
    },
    "fr": {
        "ai.confidence.high.tooltip": "Élevée — l'affirmation est directement soutenue par une source nommée que nous pouvons vous montrer.",
        "ai.confidence.medium.tooltip": "Moyenne — affirmation raisonnable d'après vos sources, mais vérifiez les détails.",
        "ai.confidence.low.tooltip": "Faible — affirmation générique ou extrapolation ; vérifiez avant de soumettre.",
        "provenance.loading": "Chargement des sources…",
        "provenance.empty": "Aucune citation de source enregistrée pour cette section.",
    },
    "es": {
        "ai.confidence.high.tooltip": "Alta — la afirmación está directamente respaldada por una fuente que podemos mostrarte.",
        "ai.confidence.medium.tooltip": "Media — afirmación razonable según tus fuentes; verifica los detalles.",
        "ai.confidence.low.tooltip": "Baja — afirmación genérica o extrapolación; verifica antes de enviar.",
        "provenance.loading": "Cargando fuentes…",
        "provenance.empty": "No hay citas de fuentes registradas para esta sección.",
    },
    "sw": {
        "ai.confidence.high.tooltip": "Juu — madai yanaungwa moja kwa moja na chanzo tunachoweza kukuonyesha.",
        "ai.confidence.medium.tooltip": "Wastani — madai ni ya busara kulingana na vyanzo vyako, lakini hakiki maelezo.",
        "ai.confidence.low.tooltip": "Chini — madai ya jumla au makisio; hakiki kabla ya kuwasilisha.",
        "provenance.loading": "Inapakia vyanzo…",
        "provenance.empty": "Hakuna marejeleo ya vyanzo yaliyorekodiwa kwa sehemu hii.",
    },
    "so": {
        "ai.confidence.high.tooltip": "Sare — sheegashada waxaa toos u taageeraysa il magacaaban oo aan ku tusi karno.",
        "ai.confidence.medium.tooltip": "Dhexdhexaad — sheegashada waa macquul ku saleysan ilahaaga, laakiin hubi faahfaahinta.",
        "ai.confidence.low.tooltip": "Hoose — sheegasho guud ama qiyaaso; hubi ka hor inta aadan gudbin.",
        "provenance.loading": "Waxaa la soo dejinayaa ilaha…",
        "provenance.empty": "Ma jiraan tixraac ilo ah oo qaybtan loo diiwaangeliyay.",
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

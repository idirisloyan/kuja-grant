"""Phase 2.2 — i18n keys for the donor grant-brief generator UI."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "common.cancel": "Cancel",
        "grant_brief.cta.open": "Or design with AI from a prompt",
        "grant_brief.cta.design": "Design grant",
        "grant_brief.cta.designing": "Designing…",
        "grant_brief.heading": "Design from a prompt",
        "grant_brief.subtitle": "Type 1-2 lines about who you want to fund and what outcome you care about. AI will design a complete first-draft grant — title, description, criteria with weights, eligibility, documents, reporting cadence, deadline. Edit before publishing.",
        "grant_brief.placeholder": "e.g. $500k for women-led climate adaptation in coastal Kenya, focus on smallholder agroforestry, 18-month duration",
        "grant_brief.toast.applied": "Grant designed: {criteria} criteria · review and edit",
    },
    "ar": {
        "common.cancel": "إلغاء",
        "grant_brief.cta.open": "أو صمّم بالذكاء الاصطناعي من وصف قصير",
        "grant_brief.cta.design": "صمّم المنحة",
        "grant_brief.cta.designing": "جارٍ التصميم…",
        "grant_brief.heading": "صمّم من وصف قصير",
        "grant_brief.subtitle": "اكتب سطراً أو سطرين عن من تريد تمويله وما النتيجة التي تهتم بها. سيصمّم الذكاء الاصطناعي مسودة منحة كاملة — العنوان والوصف ومعايير التقييم بأوزانها والأهلية والمستندات وجدول التقارير والموعد النهائي. يمكنك تعديلها قبل النشر.",
        "grant_brief.placeholder": "مثال: 500 ألف دولار لتكيّف المرأة مع المناخ في ساحل كينيا، التركيز على الحراجة الزراعية لصغار المزارعين، مدة 18 شهراً",
        "grant_brief.toast.applied": "تم تصميم المنحة: {criteria} معايير · راجع وعدّل",
    },
    "fr": {
        "common.cancel": "Annuler",
        "grant_brief.cta.open": "Ou concevoir avec l'IA depuis un résumé",
        "grant_brief.cta.design": "Concevoir la subvention",
        "grant_brief.cta.designing": "Conception en cours…",
        "grant_brief.heading": "Concevoir depuis un résumé",
        "grant_brief.subtitle": "Saisissez 1-2 lignes sur qui vous souhaitez financer et le résultat visé. L'IA produira un premier brouillon complet — titre, description, critères pondérés, éligibilité, documents, calendrier de rapport, date limite. Modifiez avant publication.",
        "grant_brief.placeholder": "Ex. : 500k$ pour l'adaptation climatique des femmes sur la côte du Kenya, focus agroforesterie pour petits exploitants, durée 18 mois",
        "grant_brief.toast.applied": "Subvention conçue : {criteria} critères · relisez et éditez",
    },
    "es": {
        "common.cancel": "Cancelar",
        "grant_brief.cta.open": "O diseñar con IA desde un resumen",
        "grant_brief.cta.design": "Diseñar subvención",
        "grant_brief.cta.designing": "Diseñando…",
        "grant_brief.heading": "Diseñar desde un resumen",
        "grant_brief.subtitle": "Escribe 1-2 líneas sobre a quién quieres financiar y qué resultado te importa. La IA diseñará un borrador completo: título, descripción, criterios con pesos, elegibilidad, documentos, calendario de reportes, fecha límite. Edita antes de publicar.",
        "grant_brief.placeholder": "Ej.: $500k para adaptación climática liderada por mujeres en la costa de Kenia, enfoque en agroforestería de pequeños productores, duración 18 meses",
        "grant_brief.toast.applied": "Subvención diseñada: {criteria} criterios · revisa y edita",
    },
    "sw": {
        "common.cancel": "Ghairi",
        "grant_brief.cta.open": "Au tengeneza na AI kutoka muhtasari",
        "grant_brief.cta.design": "Buni ruzuku",
        "grant_brief.cta.designing": "Inabuni…",
        "grant_brief.heading": "Buni kutoka muhtasari",
        "grant_brief.subtitle": "Andika mistari 1-2 kuhusu unaowataka kufadhili na matokeo unayotaka. AI itabuni rasimu kamili — kichwa, maelezo, vigezo na uzani, ustahiki, hati, ratiba ya ripoti, tarehe ya mwisho. Hariri kabla ya kuchapisha.",
        "grant_brief.placeholder": "Mfano: $500k kwa wakulima wadogo wa kike kuhusu hali ya hewa katika ufuo wa Kenya, miezi 18",
        "grant_brief.toast.applied": "Ruzuku imebuniwa: vigezo {criteria} · kagua na hariri",
    },
    "so": {
        "common.cancel": "Ka noqo",
        "grant_brief.cta.open": "Ama naqshadee adigoo isticmaalaya AI iyo warbixin",
        "grant_brief.cta.design": "Naqshadee deeqda",
        "grant_brief.cta.designing": "Waxaa la naqshadeynayaa…",
        "grant_brief.heading": "Naqshadee adoo isticmaalaya warbixin",
        "grant_brief.subtitle": "Qor 1-2 jumlado oo ku saabsan cidda aad rabto inaad maalgeliso iyo natiijada aad rabto. AI-gu wuxuu naqshadeyn doonaa qabyo dhammeystiran — cinwaan, sharraxaad, cabbirrada miisaaman, xaq u yeelashada, dukumeentiyada, jadwalka warbixinta, wakhtiga ugu dambeeya. Wax ka beddel ka hor daabacaadda.",
        "grant_brief.placeholder": "Tusaale: $500k oo loogu talagalay isbeddelka cimilada ee dumarka ee xeebta Kenya, diiradda saaray dhirta beeralayda yaryar, 18 bilood",
        "grant_brief.toast.applied": "Deeqda waa la naqshadeeyay: cabbirro {criteria} · eeg oo wax ka beddel",
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

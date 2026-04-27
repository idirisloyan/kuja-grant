"""Phase 5.3 — i18n keys for the application activity timeline."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "application.tab.activity": "Activity",
        "application.activity.heading": "Activity timeline",
        "application.activity.subtitle": "Every event on this application — state changes, AI runs, reviewer touches, document uploads.",
        "application.activity.loading": "Loading activity…",
        "application.activity.empty": "No activity yet.",
        "application.activity.coming_soon": "The activity timeline is being prepared for your account.",
        "application.activity.created": "Application created",
        "application.activity.last_edited": "Last edited",
        "application.activity.submitted": "Submitted to donor",
        "application.activity.ai_call": "AI assistant invoked",
        "application.activity.provenance": "Source citation recorded",
        "application.activity.review": "Review activity",
        "application.activity.document_uploaded": "Document uploaded",
    },
    "ar": {
        "application.tab.activity": "النشاط",
        "application.activity.heading": "خط زمني للنشاط",
        "application.activity.subtitle": "كل حدث على هذا الطلب — تغييرات الحالة، تشغيل الذكاء الاصطناعي، تدخّل المراجعين، رفع المستندات.",
        "application.activity.loading": "جارٍ تحميل النشاط…",
        "application.activity.empty": "لا يوجد نشاط بعد.",
        "application.activity.coming_soon": "خط النشاط قيد التحضير لحسابك.",
        "application.activity.created": "تم إنشاء الطلب",
        "application.activity.last_edited": "آخر تعديل",
        "application.activity.submitted": "تم تقديمه إلى المانح",
        "application.activity.ai_call": "تشغيل مساعد الذكاء الاصطناعي",
        "application.activity.provenance": "تم تسجيل مرجع للمصدر",
        "application.activity.review": "نشاط المراجعة",
        "application.activity.document_uploaded": "تم رفع مستند",
    },
    "fr": {
        "application.tab.activity": "Activité",
        "application.activity.heading": "Chronologie d'activité",
        "application.activity.subtitle": "Chaque événement sur cette candidature — changements d'état, appels IA, interactions évaluateurs, téléversements.",
        "application.activity.loading": "Chargement de l'activité…",
        "application.activity.empty": "Aucune activité pour l'instant.",
        "application.activity.coming_soon": "La chronologie est en préparation pour votre compte.",
        "application.activity.created": "Candidature créée",
        "application.activity.last_edited": "Dernière modification",
        "application.activity.submitted": "Soumise au bailleur",
        "application.activity.ai_call": "Assistant IA invoqué",
        "application.activity.provenance": "Citation de source enregistrée",
        "application.activity.review": "Activité d'évaluation",
        "application.activity.document_uploaded": "Document téléversé",
    },
    "es": {
        "application.tab.activity": "Actividad",
        "application.activity.heading": "Línea de actividad",
        "application.activity.subtitle": "Cada evento en esta postulación — cambios de estado, llamadas IA, acciones del evaluador, cargas de documentos.",
        "application.activity.loading": "Cargando actividad…",
        "application.activity.empty": "Aún no hay actividad.",
        "application.activity.coming_soon": "La línea de actividad se está preparando para tu cuenta.",
        "application.activity.created": "Postulación creada",
        "application.activity.last_edited": "Última edición",
        "application.activity.submitted": "Enviada al donante",
        "application.activity.ai_call": "Asistente IA invocado",
        "application.activity.provenance": "Cita de fuente registrada",
        "application.activity.review": "Actividad de revisión",
        "application.activity.document_uploaded": "Documento cargado",
    },
    "sw": {
        "application.tab.activity": "Shughuli",
        "application.activity.heading": "Mstari wa shughuli",
        "application.activity.subtitle": "Kila tukio kwenye ombi hili — mabadiliko ya hali, miito ya AI, hatua za mkaguzi, upakiaji wa hati.",
        "application.activity.loading": "Inapakia shughuli…",
        "application.activity.empty": "Bado hakuna shughuli.",
        "application.activity.coming_soon": "Mstari wa shughuli unaandaliwa kwa akaunti yako.",
        "application.activity.created": "Ombi limeundwa",
        "application.activity.last_edited": "Imehaririwa mara ya mwisho",
        "application.activity.submitted": "Limewasilishwa kwa mfadhili",
        "application.activity.ai_call": "Msaidizi wa AI ameitwa",
        "application.activity.provenance": "Marejeleo ya chanzo yameandikwa",
        "application.activity.review": "Shughuli ya ukaguzi",
        "application.activity.document_uploaded": "Hati imepakiwa",
    },
    "so": {
        "application.tab.activity": "Howsha",
        "application.activity.heading": "Wakhtiga hawl-galka",
        "application.activity.subtitle": "Dhacdo kasta oo codsigan ku saabsan — beddelka xaaladda, wicitaannada AI, taabashada eegayaasha, soo dejinta dukumeentiyada.",
        "application.activity.loading": "Waxaa la soo dejinayaa hawl-galka…",
        "application.activity.empty": "Wali ma jirto howl.",
        "application.activity.coming_soon": "Wakhtiga hawl-galka waa la diyaarinayaa akoonkaaga.",
        "application.activity.created": "Codsiga waa la abuuray",
        "application.activity.last_edited": "Markii ugu dambeysay ee la beddelay",
        "application.activity.submitted": "Waxaa loo gudbiyey deeq-bixiyaha",
        "application.activity.ai_call": "Kaaliyaha AI waa la wacay",
        "application.activity.provenance": "Tixraac il ah waa la diiwaangeliyay",
        "application.activity.review": "Hawsha eegista",
        "application.activity.document_uploaded": "Dukumeenti waa la soo dhejiyay",
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

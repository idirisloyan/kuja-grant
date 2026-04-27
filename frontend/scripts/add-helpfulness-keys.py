"""Phase 9.2 UI — i18n keys for the AI helpfulness panel."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "observability.helpfulness.heading": "AI helpfulness signal",
        "observability.helpfulness.window": "{h}h window",
        "observability.helpfulness.loading": "Loading helpfulness data…",
        "observability.helpfulness.empty": "No AI calls in this window.",
        "observability.helpfulness.by_language": "Calls by language",
        "observability.helpfulness.col.endpoint": "Endpoint",
        "observability.helpfulness.col.calls": "Calls",
        "observability.helpfulness.col.success": "Success",
        "observability.helpfulness.col.p95": "p95",
        "observability.helpfulness.col.helpfulness": "Helpful %",
        "observability.helpfulness.col.used": "Used",
        "observability.helpfulness.col.edited": "Edited",
        "observability.helpfulness.col.dismissed": "Dismissed",
        "observability.helpfulness.footnote": "Helpful % weights 'used' as 1.0, 'edited' as 0.5, 'dismissed' as 0. Calls without a feedback signal are excluded from the percentage.",
    },
    "ar": {
        "observability.helpfulness.heading": "إشارة جودة الذكاء الاصطناعي",
        "observability.helpfulness.window": "نافذة {h} ساعة",
        "observability.helpfulness.loading": "جارٍ تحميل بيانات الجودة…",
        "observability.helpfulness.empty": "لا توجد استدعاءات للذكاء الاصطناعي في هذه النافذة.",
        "observability.helpfulness.by_language": "الاستدعاءات حسب اللغة",
        "observability.helpfulness.col.endpoint": "نقطة النهاية",
        "observability.helpfulness.col.calls": "الاستدعاءات",
        "observability.helpfulness.col.success": "النجاح",
        "observability.helpfulness.col.p95": "p95",
        "observability.helpfulness.col.helpfulness": "نسبة الفائدة %",
        "observability.helpfulness.col.used": "مستخدم",
        "observability.helpfulness.col.edited": "محرّر",
        "observability.helpfulness.col.dismissed": "مرفوض",
        "observability.helpfulness.footnote": "نسبة الفائدة تحسب 'مستخدم' = 1.0، 'محرّر' = 0.5، 'مرفوض' = 0. الاستدعاءات بلا إشارة مستثناة من النسبة.",
    },
    "fr": {
        "observability.helpfulness.heading": "Signal d'utilité de l'IA",
        "observability.helpfulness.window": "Fenêtre {h}h",
        "observability.helpfulness.loading": "Chargement des données d'utilité…",
        "observability.helpfulness.empty": "Aucun appel IA dans cette fenêtre.",
        "observability.helpfulness.by_language": "Appels par langue",
        "observability.helpfulness.col.endpoint": "Endpoint",
        "observability.helpfulness.col.calls": "Appels",
        "observability.helpfulness.col.success": "Succès",
        "observability.helpfulness.col.p95": "p95",
        "observability.helpfulness.col.helpfulness": "Utilité %",
        "observability.helpfulness.col.used": "Utilisé",
        "observability.helpfulness.col.edited": "Édité",
        "observability.helpfulness.col.dismissed": "Rejeté",
        "observability.helpfulness.footnote": "Utilité % pondère « Utilisé » à 1.0, « Édité » à 0.5, « Rejeté » à 0. Les appels sans signal sont exclus du pourcentage.",
    },
    "es": {
        "observability.helpfulness.heading": "Señal de utilidad de la IA",
        "observability.helpfulness.window": "Ventana de {h}h",
        "observability.helpfulness.loading": "Cargando datos de utilidad…",
        "observability.helpfulness.empty": "No hay llamadas a IA en esta ventana.",
        "observability.helpfulness.by_language": "Llamadas por idioma",
        "observability.helpfulness.col.endpoint": "Endpoint",
        "observability.helpfulness.col.calls": "Llamadas",
        "observability.helpfulness.col.success": "Éxito",
        "observability.helpfulness.col.p95": "p95",
        "observability.helpfulness.col.helpfulness": "Útil %",
        "observability.helpfulness.col.used": "Usado",
        "observability.helpfulness.col.edited": "Editado",
        "observability.helpfulness.col.dismissed": "Descartado",
        "observability.helpfulness.footnote": "Útil % pondera 'Usado' = 1.0, 'Editado' = 0.5, 'Descartado' = 0. Las llamadas sin señal se excluyen del porcentaje.",
    },
    "sw": {
        "observability.helpfulness.heading": "Ishara ya manufaa ya AI",
        "observability.helpfulness.window": "Dirisha la saa {h}",
        "observability.helpfulness.loading": "Inapakia data ya manufaa…",
        "observability.helpfulness.empty": "Hakuna miito ya AI katika dirisha hili.",
        "observability.helpfulness.by_language": "Miito kulingana na lugha",
        "observability.helpfulness.col.endpoint": "Endpoint",
        "observability.helpfulness.col.calls": "Miito",
        "observability.helpfulness.col.success": "Mafanikio",
        "observability.helpfulness.col.p95": "p95",
        "observability.helpfulness.col.helpfulness": "Yenye manufaa %",
        "observability.helpfulness.col.used": "Imetumika",
        "observability.helpfulness.col.edited": "Imehaririwa",
        "observability.helpfulness.col.dismissed": "Imekataliwa",
        "observability.helpfulness.footnote": "Asilimia ya manufaa inapima 'Imetumika' = 1.0, 'Imehaririwa' = 0.5, 'Imekataliwa' = 0. Miito bila ishara haijajumuishwa.",
    },
    "so": {
        "observability.helpfulness.heading": "Calaamadda waxtarka AI",
        "observability.helpfulness.window": "Daaqada saacadood {h}",
        "observability.helpfulness.loading": "Waxaa la soo dejinayaa xogta waxtarka…",
        "observability.helpfulness.empty": "Ma jiraan wicitaanno AI ah daaqadan.",
        "observability.helpfulness.by_language": "Wicitaanno luqad",
        "observability.helpfulness.col.endpoint": "Endpoint",
        "observability.helpfulness.col.calls": "Wicitaano",
        "observability.helpfulness.col.success": "Guul",
        "observability.helpfulness.col.p95": "p95",
        "observability.helpfulness.col.helpfulness": "Faa'iido %",
        "observability.helpfulness.col.used": "La isticmaalay",
        "observability.helpfulness.col.edited": "La beddelay",
        "observability.helpfulness.col.dismissed": "La diiday",
        "observability.helpfulness.footnote": "Boqolkiiba faa'iido waxay miisaamaysaa 'La isticmaalay' = 1.0, 'La beddelay' = 0.5, 'La diiday' = 0. Wicitaannada aan calaamad lahayn waa laga reebaa.",
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

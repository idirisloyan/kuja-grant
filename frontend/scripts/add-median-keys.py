"""Phase 2.1 — i18n keys for median NGO preview."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "median_preview.cta.open": "Preview applicant pool",
        "median_preview.heading": "Predicted applicant pool",
        "median_preview.subtitle": "AI imagines what a median qualifying NGO will submit and rates how well each criterion will discriminate between strong and weak applicants.",
        "median_preview.loading": "Generating predicted applicant pool…",
        "median_preview.discrimination_label": "How well each criterion discriminates",
        "median_preview.tightenings_label": "Criteria to tighten before publish",
        "median_preview.pitfalls_label": "Common applicant pitfalls",
        "median_preview.sample_responses_label": "Sample responses ({n})",
        "median_preview.health.strong": "Design looks strong",
        "median_preview.health.mixed": "Design is mixed",
        "median_preview.health.weak": "Design needs work",
        "median_preview.discrimination.high": "High",
        "median_preview.discrimination.medium": "Medium",
        "median_preview.discrimination.low": "Low — fix",
    },
    "ar": {
        "median_preview.cta.open": "عاين فئة المتقدمين المتوقعة",
        "median_preview.heading": "فئة المتقدمين المتوقعة",
        "median_preview.subtitle": "يتخيّل الذكاء الاصطناعي ما ستقدمه منظمة مؤهلة متوسطة، ويُقيّم مدى قدرة كل معيار على التمييز بين المتقدمين الأقوى والأضعف.",
        "median_preview.loading": "جارٍ إنشاء توقّع فئة المتقدمين…",
        "median_preview.discrimination_label": "قدرة كل معيار على التمييز",
        "median_preview.tightenings_label": "المعايير المطلوب إحكامها قبل النشر",
        "median_preview.pitfalls_label": "أخطاء شائعة لدى المتقدمين",
        "median_preview.sample_responses_label": "إجابات نموذجية ({n})",
        "median_preview.health.strong": "التصميم يبدو قوياً",
        "median_preview.health.mixed": "التصميم متوسط",
        "median_preview.health.weak": "التصميم يحتاج إلى تحسين",
        "median_preview.discrimination.high": "مرتفعة",
        "median_preview.discrimination.medium": "متوسطة",
        "median_preview.discrimination.low": "منخفضة — أحكِم",
    },
    "fr": {
        "median_preview.cta.open": "Aperçu du pool de candidats",
        "median_preview.heading": "Pool de candidats prédit",
        "median_preview.subtitle": "L'IA imagine ce qu'une ONG médiane qualifiée soumettrait et évalue dans quelle mesure chaque critère discriminera entre candidats forts et faibles.",
        "median_preview.loading": "Génération du pool prédit…",
        "median_preview.discrimination_label": "Discrimination par critère",
        "median_preview.tightenings_label": "Critères à resserrer avant publication",
        "median_preview.pitfalls_label": "Pièges fréquents pour les candidats",
        "median_preview.sample_responses_label": "Exemples de réponses ({n})",
        "median_preview.health.strong": "Conception solide",
        "median_preview.health.mixed": "Conception mitigée",
        "median_preview.health.weak": "Conception à retravailler",
        "median_preview.discrimination.high": "Élevée",
        "median_preview.discrimination.medium": "Moyenne",
        "median_preview.discrimination.low": "Faible — à corriger",
    },
    "es": {
        "median_preview.cta.open": "Vista previa del pool de postulantes",
        "median_preview.heading": "Pool de postulantes predicho",
        "median_preview.subtitle": "La IA imagina lo que enviaría una ONG mediana calificada y evalúa qué tan bien cada criterio discriminará entre postulantes fuertes y débiles.",
        "median_preview.loading": "Generando pool predicho…",
        "median_preview.discrimination_label": "Discriminación por criterio",
        "median_preview.tightenings_label": "Criterios a ajustar antes de publicar",
        "median_preview.pitfalls_label": "Errores comunes de los postulantes",
        "median_preview.sample_responses_label": "Respuestas de muestra ({n})",
        "median_preview.health.strong": "Diseño sólido",
        "median_preview.health.mixed": "Diseño mixto",
        "median_preview.health.weak": "Diseño necesita trabajo",
        "median_preview.discrimination.high": "Alta",
        "median_preview.discrimination.medium": "Media",
        "median_preview.discrimination.low": "Baja — corregir",
    },
    "sw": {
        "median_preview.cta.open": "Onyesha kundi linalotarajiwa la waombaji",
        "median_preview.heading": "Kundi linalotarajiwa la waombaji",
        "median_preview.subtitle": "AI inawazia kile NGO ya wastani inayotosheleza ingewasilisha na inakadiria jinsi kila kigezo kitaweza kutofautisha waombaji wenye nguvu na dhaifu.",
        "median_preview.loading": "Inazalisha utabiri wa kundi…",
        "median_preview.discrimination_label": "Utenganishaji wa kila kigezo",
        "median_preview.tightenings_label": "Vigezo vinavyohitaji kuimarishwa kabla ya kuchapisha",
        "median_preview.pitfalls_label": "Makosa ya kawaida ya waombaji",
        "median_preview.sample_responses_label": "Mifano ya majibu ({n})",
        "median_preview.health.strong": "Muundo unaonekana imara",
        "median_preview.health.mixed": "Muundo wa mchanganyiko",
        "median_preview.health.weak": "Muundo unahitaji kazi",
        "median_preview.discrimination.high": "Juu",
        "median_preview.discrimination.medium": "Wastani",
        "median_preview.discrimination.low": "Chini — rekebisha",
    },
    "so": {
        "median_preview.cta.open": "Eeg kooxda codsadayaasha la saadaaliyay",
        "median_preview.heading": "Kooxda codsadayaasha la saadaaliyay",
        "median_preview.subtitle": "AI-gu wuxuu malayn doonaa waxa NGO dhexdhexaad u qalantaa ay gudbinayso, oo wuxuu qiimeyn doonaa sida cabbir kasta u kala saari karo codsadayaasha xoogga leh iyo kuwa daciifka ah.",
        "median_preview.loading": "Waxaa la sameynayaa saadaalinta kooxda…",
        "median_preview.discrimination_label": "Awoodda kala-saaridda ee cabbir kasta",
        "median_preview.tightenings_label": "Cabbirrada loo baahan yahay in la sii xoojiyo ka hor daabacaadda",
        "median_preview.pitfalls_label": "Khaladaadka caadiga ah ee codsadayaasha",
        "median_preview.sample_responses_label": "Tusaalooyin jawaabaha ({n})",
        "median_preview.health.strong": "Naqshaddu way xoog leedahay",
        "median_preview.health.mixed": "Naqshaddu waa isku qasan",
        "median_preview.health.weak": "Naqshaddu waxay u baahan tahay shaqo",
        "median_preview.discrimination.high": "Sare",
        "median_preview.discrimination.medium": "Dhexdhexaad",
        "median_preview.discrimination.low": "Hoose — hagaaji",
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

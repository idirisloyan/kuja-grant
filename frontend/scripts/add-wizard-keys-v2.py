"""Round 2: eligibility category labels + doc type labels."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "eligibility.geographic": "Geographic Requirements",
        "eligibility.org_type": "Organization Type",
        "eligibility.experience": "Experience & Track Record",
        "eligibility.budget": "Budget / Financial Capacity",
        "eligibility.sector": "Sector Expertise",
        "eligibility.registration": "Registration & Compliance",
        "doctype.financial_report": "Financial Report",
        "doctype.registration": "Registration Certificate",
        "doctype.audit": "Audit Report",
        "doctype.PSEA": "PSEA Policy",
        "doctype.project_report": "Project Reports",
        "doctype.budget": "Detailed Budget",
        "doctype.CV": "Staff CVs",
        "doctype.strategic_plan": "Strategic Plan",
    },
    "ar": {
        "eligibility.geographic": "متطلبات جغرافية",
        "eligibility.org_type": "نوع المنظمة",
        "eligibility.experience": "الخبرة والسجل",
        "eligibility.budget": "الميزانية / القدرة المالية",
        "eligibility.sector": "الخبرة القطاعية",
        "eligibility.registration": "التسجيل والامتثال",
        "doctype.financial_report": "تقرير مالي",
        "doctype.registration": "شهادة تسجيل",
        "doctype.audit": "تقرير تدقيق",
        "doctype.PSEA": "سياسة الحماية من الاستغلال والاعتداء الجنسي",
        "doctype.project_report": "تقارير المشروع",
        "doctype.budget": "ميزانية تفصيلية",
        "doctype.CV": "السير الذاتية للموظفين",
        "doctype.strategic_plan": "الخطة الاستراتيجية",
    },
    "fr": {
        "eligibility.geographic": "Exigences géographiques",
        "eligibility.org_type": "Type d'organisation",
        "eligibility.experience": "Expérience et antécédents",
        "eligibility.budget": "Budget / Capacité financière",
        "eligibility.sector": "Expertise sectorielle",
        "eligibility.registration": "Immatriculation et conformité",
        "doctype.financial_report": "Rapport financier",
        "doctype.registration": "Certificat d'immatriculation",
        "doctype.audit": "Rapport d'audit",
        "doctype.PSEA": "Politique PSEA",
        "doctype.project_report": "Rapports de projet",
        "doctype.budget": "Budget détaillé",
        "doctype.CV": "CV du personnel",
        "doctype.strategic_plan": "Plan stratégique",
    },
    "es": {
        "eligibility.geographic": "Requisitos geográficos",
        "eligibility.org_type": "Tipo de organización",
        "eligibility.experience": "Experiencia y trayectoria",
        "eligibility.budget": "Presupuesto / Capacidad financiera",
        "eligibility.sector": "Experiencia sectorial",
        "eligibility.registration": "Registro y cumplimiento",
        "doctype.financial_report": "Informe financiero",
        "doctype.registration": "Certificado de registro",
        "doctype.audit": "Informe de auditoría",
        "doctype.PSEA": "Política PSEA",
        "doctype.project_report": "Informes de proyecto",
        "doctype.budget": "Presupuesto detallado",
        "doctype.CV": "CV del personal",
        "doctype.strategic_plan": "Plan estratégico",
    },
    "sw": {
        "eligibility.geographic": "Mahitaji ya kijiografia",
        "eligibility.org_type": "Aina ya shirika",
        "eligibility.experience": "Uzoefu na rekodi",
        "eligibility.budget": "Bajeti / uwezo wa kifedha",
        "eligibility.sector": "Utaalamu wa sekta",
        "eligibility.registration": "Usajili na utii",
        "doctype.financial_report": "Ripoti ya kifedha",
        "doctype.registration": "Cheti cha usajili",
        "doctype.audit": "Ripoti ya ukaguzi",
        "doctype.PSEA": "Sera ya PSEA",
        "doctype.project_report": "Ripoti za mradi",
        "doctype.budget": "Bajeti yenye undani",
        "doctype.CV": "CV za wafanyakazi",
        "doctype.strategic_plan": "Mpango wa kimkakati",
    },
    "so": {
        "eligibility.geographic": "Shuruudaha juqraafi",
        "eligibility.org_type": "Nooca ururka",
        "eligibility.experience": "Khibradda iyo taariikhda",
        "eligibility.budget": "Miisaaniyad / awood maaliyadeed",
        "eligibility.sector": "Khibrad qaybeed",
        "eligibility.registration": "Diiwaangelin iyo u hoggaansanaan",
        "doctype.financial_report": "Warbixin maaliyadeed",
        "doctype.registration": "Shahaadada diiwaangelinta",
        "doctype.audit": "Warbixin hubinta xisaabaadka",
        "doctype.PSEA": "Siyaasadda PSEA",
        "doctype.project_report": "Warbixinada mashruuca",
        "doctype.budget": "Miisaaniyad faahfaahsan",
        "doctype.CV": "CV-yada shaqaalaha",
        "doctype.strategic_plan": "Qorshe istiraatiijiyadeed",
    },
}


def main():
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


if __name__ == "__main__":
    main()

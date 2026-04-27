"""Phase 1.3 UI — i18n keys for the report co-author."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "report_coauthor.cta.open": "Generate report draft",
        "report_coauthor.cta.generate": "Generate draft",
        "report_coauthor.cta.generating": "Generating…",
        "report_coauthor.heading": "AI report draft",
        "report_coauthor.subtitle": "Add a few notes about what happened this period — meetings, milestones, beneficiary numbers. AI will draft every section grounded in your prior reports + uploaded documents, and flag any gaps that need evidence.",
        "report_coauthor.notes_placeholder": "e.g. We trained 60 new CHWs in Q3 across 3 counties. Attendance sheets uploaded. Two scheduled trainings were postponed due to election logistics.",
        "report_coauthor.replace_existing": "Replace my existing draft",
        "report_coauthor.sections_summary": "{n} drafted sections",
        "report_coauthor.gaps_label": "{n} gaps need evidence",
        "report_coauthor.applied_to_form": "Draft saved — review and edit",
        "report_coauthor.toast.draft_ready": "Draft ready: {n} sections · {gaps} gaps flagged",
    },
    "ar": {
        "report_coauthor.cta.open": "أنشئ مسودة تقرير",
        "report_coauthor.cta.generate": "أنشئ المسودة",
        "report_coauthor.cta.generating": "جارٍ الإنشاء…",
        "report_coauthor.heading": "مسودة التقرير بالذكاء الاصطناعي",
        "report_coauthor.subtitle": "أضف بعض الملاحظات عما حدث في هذه الفترة — اجتماعات، إنجازات، أعداد المستفيدين. سيقوم الذكاء الاصطناعي بصياغة كل قسم مستنداً إلى تقاريرك السابقة والمستندات المرفوعة، وتحديد أي ثغرات تحتاج إلى أدلة.",
        "report_coauthor.notes_placeholder": "مثال: درّبنا 60 من العاملين الصحيين في الربع الثالث في 3 محافظات. كشوف الحضور مرفوعة. تأجّلت تدريبتان بسبب لوجستيات الانتخابات.",
        "report_coauthor.replace_existing": "استبدال المسودة الحالية",
        "report_coauthor.sections_summary": "{n} قسم مسوّد",
        "report_coauthor.gaps_label": "{n} ثغرة تحتاج إلى أدلّة",
        "report_coauthor.applied_to_form": "تم حفظ المسودة — راجع وعدّل",
        "report_coauthor.toast.draft_ready": "المسودة جاهزة: {n} أقسام · {gaps} ثغرات",
    },
    "fr": {
        "report_coauthor.cta.open": "Générer brouillon de rapport",
        "report_coauthor.cta.generate": "Générer le brouillon",
        "report_coauthor.cta.generating": "Génération…",
        "report_coauthor.heading": "Brouillon de rapport IA",
        "report_coauthor.subtitle": "Ajoutez quelques notes sur cette période — réunions, jalons, nombre de bénéficiaires. L'IA rédigera chaque section à partir de vos rapports précédents et documents téléversés, et signalera les lacunes nécessitant des preuves.",
        "report_coauthor.notes_placeholder": "Ex. : nous avons formé 60 ASC au T3 dans 3 comtés. Feuilles de présence téléversées. Deux formations reportées pour raisons électorales.",
        "report_coauthor.replace_existing": "Remplacer mon brouillon actuel",
        "report_coauthor.sections_summary": "{n} sections rédigées",
        "report_coauthor.gaps_label": "{n} lacunes à documenter",
        "report_coauthor.applied_to_form": "Brouillon enregistré — relisez et éditez",
        "report_coauthor.toast.draft_ready": "Brouillon prêt : {n} sections · {gaps} lacunes",
    },
    "es": {
        "report_coauthor.cta.open": "Generar borrador de informe",
        "report_coauthor.cta.generate": "Generar borrador",
        "report_coauthor.cta.generating": "Generando…",
        "report_coauthor.heading": "Borrador de informe IA",
        "report_coauthor.subtitle": "Agrega notas sobre lo ocurrido en este período: reuniones, hitos, número de beneficiarios. La IA redactará cada sección basándose en tus informes previos y documentos cargados, y marcará brechas que necesitan evidencia.",
        "report_coauthor.notes_placeholder": "Ej.: capacitamos a 60 ACS en Q3 en 3 condados. Listas de asistencia cargadas. Dos capacitaciones se aplazaron por logística electoral.",
        "report_coauthor.replace_existing": "Reemplazar mi borrador actual",
        "report_coauthor.sections_summary": "{n} secciones redactadas",
        "report_coauthor.gaps_label": "{n} brechas requieren evidencia",
        "report_coauthor.applied_to_form": "Borrador guardado — revisa y edita",
        "report_coauthor.toast.draft_ready": "Borrador listo: {n} secciones · {gaps} brechas",
    },
    "sw": {
        "report_coauthor.cta.open": "Tengeneza rasimu ya ripoti",
        "report_coauthor.cta.generate": "Tengeneza rasimu",
        "report_coauthor.cta.generating": "Inatengeneza…",
        "report_coauthor.heading": "Rasimu ya ripoti ya AI",
        "report_coauthor.subtitle": "Ongeza maelezo machache kuhusu kile kilichotokea kipindi hiki — mikutano, hatua, idadi ya wanufaika. AI itatayarisha kila sehemu ikitegemea ripoti zako za awali na hati zilizopakiwa, na kutaja mapengo yanayohitaji ushahidi.",
        "report_coauthor.notes_placeholder": "Mfano: tulifundisha CHWs 60 katika robo ya tatu katika kaunti 3. Karatasi za mahudhurio zimepakiwa. Mafunzo mawili yaliahirishwa kwa sababu za uchaguzi.",
        "report_coauthor.replace_existing": "Badilisha rasimu yangu iliyopo",
        "report_coauthor.sections_summary": "sehemu zilizotayarishwa {n}",
        "report_coauthor.gaps_label": "mapengo {n} yanahitaji ushahidi",
        "report_coauthor.applied_to_form": "Rasimu imehifadhiwa — kagua na hariri",
        "report_coauthor.toast.draft_ready": "Rasimu tayari: sehemu {n} · mapengo {gaps}",
    },
    "so": {
        "report_coauthor.cta.open": "Soo saar qabyada warbixinta",
        "report_coauthor.cta.generate": "Soo saar qabyada",
        "report_coauthor.cta.generating": "Waxaa la sameynayaa…",
        "report_coauthor.heading": "Qabyada warbixinta ee AI",
        "report_coauthor.subtitle": "Ku dar qoraallo gaagaaban oo ku saabsan waxa dhacay xilligan — kulamo, marxalado, tirada dadka faa'iidaystay. AI-gu wuxuu qori doonaa qayb kasta isagoo ku tiirsanaya warbixinadaadii hore iyo dukumeentiyada la soo dhejiyay, oo wuxuu calaamadinayaa daldalool kasta oo u baahan caddayn.",
        "report_coauthor.notes_placeholder": "Tusaale: waxaan tababarnay 60 CHW Q3 saddex degmood. Liisaska sooxaadirka waa la soo dhejiyay. Laba tababar oo lala qorsheeyay ayaa la dib u dhigay sababo doorashada awgeed.",
        "report_coauthor.replace_existing": "Beddel qabyadayda jirta",
        "report_coauthor.sections_summary": "qaybaha la sameeyay {n}",
        "report_coauthor.gaps_label": "daldaloolo {n} oo u baahan caddayn",
        "report_coauthor.applied_to_form": "Qabyada waa la kaydiyay — eeg oo wax ka beddel",
        "report_coauthor.toast.draft_ready": "Qabyada diyaar: qaybo {n} · daldaloolo {gaps}",
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

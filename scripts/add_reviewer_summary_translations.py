"""Phase 10.3 — add reviewer_summary.* keys to all 6 locales."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

TRANSLATIONS = {
    'en': {
        'reviewer_summary.title': 'AI summary',
        'reviewer_summary.fallback_label': 'BASELINE',
        'reviewer_summary.generate': 'Generate summary',
        'reviewer_summary.generating': 'Generating…',
        'reviewer_summary.executive_read': 'Executive read',
        'reviewer_summary.who': 'Who',
        'reviewer_summary.what': 'Proposes',
        'reviewer_summary.why_strong': 'Why strong',
        'reviewer_summary.why_weak': 'Why weak',
        'reviewer_summary.evidence_per_criterion': 'Evidence per criterion',
        'reviewer_summary.red_flags': 'Red flags to investigate',
        'reviewer_summary.comparable': 'Compared to other applicants',
        'reviewer_summary.draft_rationale': 'Draft rationale (editable)',
        'reviewer_summary.use_rationale': 'Use this rationale',
        'reviewer_summary.copy': 'Copy',
        'reviewer_summary.copied': 'Copied',
        'reviewer_summary.copy_failed': 'Could not copy to clipboard',
        'reviewer_summary.rationale_used': 'Rationale pasted into the highest-weighted criterion',
        'reviewer_summary.editable_note': 'Edit before submitting — your judgment is the final word.',
    },
    'ar': {
        'reviewer_summary.title': 'ملخص الذكاء الاصطناعي',
        'reviewer_summary.fallback_label': 'أساسي',
        'reviewer_summary.generate': 'إنشاء ملخص',
        'reviewer_summary.generating': 'جارٍ الإنشاء…',
        'reviewer_summary.executive_read': 'قراءة تنفيذية',
        'reviewer_summary.who': 'من',
        'reviewer_summary.what': 'المقترح',
        'reviewer_summary.why_strong': 'نقاط القوة',
        'reviewer_summary.why_weak': 'نقاط الضعف',
        'reviewer_summary.evidence_per_criterion': 'الأدلة لكل معيار',
        'reviewer_summary.red_flags': 'مؤشرات تستدعي التحقيق',
        'reviewer_summary.comparable': 'مقارنة بالمتقدمين الآخرين',
        'reviewer_summary.draft_rationale': 'مسودة التبرير (قابلة للتعديل)',
        'reviewer_summary.use_rationale': 'استخدم هذا التبرير',
        'reviewer_summary.copy': 'نسخ',
        'reviewer_summary.copied': 'تم النسخ',
        'reviewer_summary.copy_failed': 'تعذر النسخ إلى الحافظة',
        'reviewer_summary.rationale_used': 'تم لصق التبرير في المعيار الأعلى وزناً',
        'reviewer_summary.editable_note': 'قم بالتعديل قبل الإرسال — حكمك هو الكلمة النهائية.',
    },
    'fr': {
        'reviewer_summary.title': 'Synthèse IA',
        'reviewer_summary.fallback_label': 'BASIQUE',
        'reviewer_summary.generate': 'Générer la synthèse',
        'reviewer_summary.generating': 'Génération…',
        'reviewer_summary.executive_read': 'Lecture exécutive',
        'reviewer_summary.who': 'Qui',
        'reviewer_summary.what': 'Propose',
        'reviewer_summary.why_strong': 'Points forts',
        'reviewer_summary.why_weak': 'Points faibles',
        'reviewer_summary.evidence_per_criterion': 'Preuves par critère',
        'reviewer_summary.red_flags': 'Signaux à investiguer',
        'reviewer_summary.comparable': 'Comparé aux autres candidats',
        'reviewer_summary.draft_rationale': 'Justification (modifiable)',
        'reviewer_summary.use_rationale': 'Utiliser cette justification',
        'reviewer_summary.copy': 'Copier',
        'reviewer_summary.copied': 'Copié',
        'reviewer_summary.copy_failed': 'Impossible de copier',
        'reviewer_summary.rationale_used': 'Justification collée dans le critère le plus pondéré',
        'reviewer_summary.editable_note': "Modifiez avant l'envoi — votre jugement est final.",
    },
    'es': {
        'reviewer_summary.title': 'Resumen IA',
        'reviewer_summary.fallback_label': 'BÁSICO',
        'reviewer_summary.generate': 'Generar resumen',
        'reviewer_summary.generating': 'Generando…',
        'reviewer_summary.executive_read': 'Lectura ejecutiva',
        'reviewer_summary.who': 'Quién',
        'reviewer_summary.what': 'Propone',
        'reviewer_summary.why_strong': 'Fortalezas',
        'reviewer_summary.why_weak': 'Debilidades',
        'reviewer_summary.evidence_per_criterion': 'Evidencia por criterio',
        'reviewer_summary.red_flags': 'Señales a investigar',
        'reviewer_summary.comparable': 'Comparado con otros solicitantes',
        'reviewer_summary.draft_rationale': 'Borrador de justificación (editable)',
        'reviewer_summary.use_rationale': 'Usar esta justificación',
        'reviewer_summary.copy': 'Copiar',
        'reviewer_summary.copied': 'Copiado',
        'reviewer_summary.copy_failed': 'No se pudo copiar',
        'reviewer_summary.rationale_used': 'Justificación pegada en el criterio de mayor peso',
        'reviewer_summary.editable_note': 'Edite antes de enviar — su juicio es final.',
    },
    'sw': {
        'reviewer_summary.title': 'Muhtasari wa AI',
        'reviewer_summary.fallback_label': 'MSINGI',
        'reviewer_summary.generate': 'Tengeneza muhtasari',
        'reviewer_summary.generating': 'Inatengeneza…',
        'reviewer_summary.executive_read': 'Usomaji wa utendaji',
        'reviewer_summary.who': 'Nani',
        'reviewer_summary.what': 'Anapendekeza',
        'reviewer_summary.why_strong': 'Nguvu',
        'reviewer_summary.why_weak': 'Udhaifu',
        'reviewer_summary.evidence_per_criterion': 'Ushahidi kwa kila kigezo',
        'reviewer_summary.red_flags': 'Ishara za kuchunguza',
        'reviewer_summary.comparable': 'Ukilinganishwa na waombaji wengine',
        'reviewer_summary.draft_rationale': 'Sababu ya kupata (inaweza kuhaririwa)',
        'reviewer_summary.use_rationale': 'Tumia sababu hii',
        'reviewer_summary.copy': 'Nakili',
        'reviewer_summary.copied': 'Imenakiliwa',
        'reviewer_summary.copy_failed': 'Imeshindwa kunakili',
        'reviewer_summary.rationale_used': 'Sababu imebandikwa kwenye kigezo chenye uzito mkubwa',
        'reviewer_summary.editable_note': 'Hariri kabla ya kuwasilisha — uamuzi wako ni wa mwisho.',
    },
    'so': {
        'reviewer_summary.title': 'Soosaarka AI',
        'reviewer_summary.fallback_label': 'ASAASI',
        'reviewer_summary.generate': 'Sameey soosaar',
        'reviewer_summary.generating': 'Waa la sameynayaa…',
        'reviewer_summary.executive_read': 'Akhrin tabaha',
        'reviewer_summary.who': 'Yaa',
        'reviewer_summary.what': 'Wuxuu soo jeedinayaa',
        'reviewer_summary.why_strong': 'Xoogga',
        'reviewer_summary.why_weak': 'Daciifka',
        'reviewer_summary.evidence_per_criterion': 'Caddaymaha shuruuda kasta',
        'reviewer_summary.red_flags': 'Calaamado la baadho',
        'reviewer_summary.comparable': 'Marka la barbar dhigo codsadayaasha kale',
        'reviewer_summary.draft_rationale': 'Qabyada sababaynta (waa la wax ka beddeli karaa)',
        'reviewer_summary.use_rationale': 'Isticmaal sababayntan',
        'reviewer_summary.copy': 'Koobi',
        'reviewer_summary.copied': 'Waa la koobiyay',
        'reviewer_summary.copy_failed': 'Koobiga waa fashilmay',
        'reviewer_summary.rationale_used': 'Sababayntu waxay ku dhajisantay shuruuda ugu miisaanka badan',
        'reviewer_summary.editable_note': 'Wax ka beddel ka hor gudbinta — go\'aankaagu waa kii ugu dambeeyay.',
    },
}


def main():
    for lang, payload in TRANSLATIONS.items():
        p = I18N / f'{lang}.json'
        data = json.load(p.open(encoding='utf-8'))
        data.update(payload)
        with p.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'  {lang}: +{len(payload)} reviewer_summary keys')
    print('Done.')


if __name__ == '__main__':
    main()

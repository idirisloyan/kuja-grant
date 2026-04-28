"""One-shot: add readiness.* and report_readiness.* keys to all 5 non-EN locales.

This is a Phase 10.1/10.2 deliverable — adding the i18n parity needed
for the new submission readiness + report pre-flight surfaces. Each
locale gets a hand-written translation; native-speaker review is on the
priority-1 backlog (see docs/i18n_review_targets.md).
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

TRANSLATIONS = {
    'ar': {
        'readiness.check': 'فحص قبل التقديم',
        'readiness.checking': 'جارٍ الفحص…',
        'readiness.title': 'جاهزية التقديم',
        'readiness.scanning': 'يتم فحص طلبك بحثاً عن الثغرات والإجابات الضعيفة والمبالغات…',
        'readiness.verdict.ready': 'جاهز',
        'readiness.verdict.needs_work': 'يحتاج تحسين',
        'readiness.verdict.not_ready': 'غير جاهز',
        'readiness.fallback_notice': 'فحص الذكاء الاصطناعي غير متاح — تم تشغيل فحص أساسي. أعد المحاولة لاحقاً.',
        'readiness.strengths': 'النقاط القوية',
        'readiness.gaps': 'ثغرات يجب إصلاحها',
        'readiness.gaps_subtitle': 'مرتبة حسب الأهمية. يجب إصلاح الموانع قبل التقديم.',
        'readiness.fix_label': 'الإصلاح',
        'readiness.suggested_rewrite': 'إعادة صياغة مقترحة',
        'readiness.apply_rewrite': 'تطبيق إعادة الصياغة',
        'readiness.applied': 'تم التطبيق',
        'readiness.applied_toast': 'تم تطبيق إعادة الصياغة — راجعها قبل التقديم.',
        'readiness.missing_evidence': 'أدلة مفقودة',
        'readiness.where_to_find': 'أين تجدها',
        'readiness.overclaims': 'ادعاءات مبالغ فيها محتملة',
        'readiness.softer': 'صياغة قابلة للدفاع',
        'readiness.generic_answers': 'إجابات عامة جداً',
        'readiness.concrete_alt': 'بديل محدد',
        'report_readiness.check': 'فحص قبل التقديم',
        'report_readiness.checking': 'جارٍ الفحص…',
        'report_readiness.title': 'جاهزية التقرير',
        'report_readiness.scanning': 'يتم فحص تقريرك من منظور المانح…',
        'report_readiness.donor_concerns': 'مخاوف المانح',
        'report_readiness.vague_claims': 'ادعاءات غامضة',
        'report_readiness.vague_sharper': 'صياغة أكثر حدة',
        'report_readiness.budget_variance': 'فروقات الميزانية المطلوب توضيحها',
    },
    'fr': {
        'readiness.check': 'Vérification pré-soumission',
        'readiness.checking': 'Vérification…',
        'readiness.title': 'Prêt pour la soumission',
        'readiness.scanning': 'Analyse de votre candidature pour détecter les lacunes, les réponses faibles et les surévaluations…',
        'readiness.verdict.ready': 'Prêt',
        'readiness.verdict.needs_work': 'À retravailler',
        'readiness.verdict.not_ready': 'Pas prêt',
        'readiness.fallback_notice': "L'IA est hors ligne — vérification de base effectuée. Réessayez plus tard.",
        'readiness.strengths': 'Ce qui fonctionne',
        'readiness.gaps': 'Lacunes à combler',
        'readiness.gaps_subtitle': "Triées par gravité. Les bloquants doivent être corrigés avant l'envoi.",
        'readiness.fix_label': 'Correction',
        'readiness.suggested_rewrite': 'Réécriture suggérée',
        'readiness.apply_rewrite': 'Appliquer',
        'readiness.applied': 'Appliqué',
        'readiness.applied_toast': "Réécriture appliquée — vérifiez avant d'envoyer.",
        'readiness.missing_evidence': 'Preuves manquantes',
        'readiness.where_to_find': 'Où chercher',
        'readiness.overclaims': 'Affirmations à risque',
        'readiness.softer': 'Reformulation défendable',
        'readiness.generic_answers': 'Trop générique',
        'readiness.concrete_alt': 'Alternative concrète',
        'report_readiness.check': 'Vérification pré-envoi',
        'report_readiness.checking': 'Vérification…',
        'report_readiness.title': 'Rapport prêt à envoyer',
        'report_readiness.scanning': 'Analyse de votre rapport du point de vue du bailleur…',
        'report_readiness.donor_concerns': 'Préoccupations du bailleur',
        'report_readiness.vague_claims': 'Affirmations vagues',
        'report_readiness.vague_sharper': 'Version plus précise',
        'report_readiness.budget_variance': 'Écarts budgétaires à expliquer',
    },
    'es': {
        'readiness.check': 'Verificación previa',
        'readiness.checking': 'Verificando…',
        'readiness.title': 'Lista para enviar',
        'readiness.scanning': 'Analizando su solicitud en busca de lagunas, respuestas débiles y exageraciones…',
        'readiness.verdict.ready': 'Lista',
        'readiness.verdict.needs_work': 'Requiere trabajo',
        'readiness.verdict.not_ready': 'No lista',
        'readiness.fallback_notice': 'IA no disponible — se realizó verificación básica. Reintente más tarde.',
        'readiness.strengths': 'Lo que funciona',
        'readiness.gaps': 'Brechas a corregir',
        'readiness.gaps_subtitle': 'Ordenadas por gravedad. Los bloqueadores deben corregirse antes de enviar.',
        'readiness.fix_label': 'Corrección',
        'readiness.suggested_rewrite': 'Reescritura sugerida',
        'readiness.apply_rewrite': 'Aplicar',
        'readiness.applied': 'Aplicada',
        'readiness.applied_toast': 'Reescritura aplicada — revise antes de enviar.',
        'readiness.missing_evidence': 'Evidencia faltante',
        'readiness.where_to_find': 'Dónde encontrarla',
        'readiness.overclaims': 'Afirmaciones excesivas',
        'readiness.softer': 'Reformulación defendible',
        'readiness.generic_answers': 'Demasiado genérico',
        'readiness.concrete_alt': 'Alternativa concreta',
        'report_readiness.check': 'Verificación previa',
        'report_readiness.checking': 'Verificando…',
        'report_readiness.title': 'Informe listo',
        'report_readiness.scanning': 'Analizando su informe desde la perspectiva del donante…',
        'report_readiness.donor_concerns': 'Preocupaciones del donante',
        'report_readiness.vague_claims': 'Afirmaciones vagas',
        'report_readiness.vague_sharper': 'Versión más precisa',
        'report_readiness.budget_variance': 'Variaciones presupuestarias a explicar',
    },
    'sw': {
        'readiness.check': 'Ukaguzi wa kabla ya kuwasilisha',
        'readiness.checking': 'Inakagua…',
        'readiness.title': 'Utayari wa kuwasilisha',
        'readiness.scanning': 'Inakagua maombi yako kupata mapengo, majibu dhaifu, na madai ya kupita kiasi…',
        'readiness.verdict.ready': 'Tayari',
        'readiness.verdict.needs_work': 'Inahitaji kazi',
        'readiness.verdict.not_ready': 'Haijawa tayari',
        'readiness.fallback_notice': 'AI haipatikani — ukaguzi wa msingi umefanyika. Jaribu tena baadaye.',
        'readiness.strengths': 'Yale yanayofanya kazi',
        'readiness.gaps': 'Mapengo ya kurekebisha',
        'readiness.gaps_subtitle': 'Yamepangwa kwa uzito. Vizuizi lazima virekebishwe kabla ya kuwasilisha.',
        'readiness.fix_label': 'Kurekebisha',
        'readiness.suggested_rewrite': 'Uandishi mpya uliopendekezwa',
        'readiness.apply_rewrite': 'Tumia uandishi',
        'readiness.applied': 'Imetumika',
        'readiness.applied_toast': 'Uandishi mpya umetumika — kagua kabla ya kuwasilisha.',
        'readiness.missing_evidence': 'Ushahidi unaokosekana',
        'readiness.where_to_find': 'Mahali pa kuipata',
        'readiness.overclaims': 'Madai ya kupita kiasi',
        'readiness.softer': 'Uundaji wenye kutetewa',
        'readiness.generic_answers': 'Jibu la jumla mno',
        'readiness.concrete_alt': 'Mbadala mahususi',
        'report_readiness.check': 'Ukaguzi wa kabla ya kuwasilisha',
        'report_readiness.checking': 'Inakagua…',
        'report_readiness.title': 'Utayari wa ripoti',
        'report_readiness.scanning': 'Inakagua ripoti yako kutoka mtazamo wa mfadhili…',
        'report_readiness.donor_concerns': 'Wasiwasi wa mfadhili',
        'report_readiness.vague_claims': 'Madai yasiyo wazi',
        'report_readiness.vague_sharper': 'Toleo lililo wazi zaidi',
        'report_readiness.budget_variance': 'Tofauti za bajeti za kuelezea',
    },
    'so': {
        'readiness.check': 'Hubinta ka hor gudbinta',
        'readiness.checking': 'Waa la baarayaa…',
        'readiness.title': 'Diyaarinta gudbinta',
        'readiness.scanning': 'Waxaa la baarayaa codsigaaga si loo helo nuqsano, jawaabo daciif ah, iyo sheegashooyin xad-dhaaf…',
        'readiness.verdict.ready': 'Diyaar',
        'readiness.verdict.needs_work': 'U baahan shaqo',
        'readiness.verdict.not_ready': 'Diyaar maaha',
        'readiness.fallback_notice': 'AI ma jiro — hubin aasaasi ah ayaa la sameeyay. Mar kale isku day.',
        'readiness.strengths': 'Waxa shaqaynaya',
        'readiness.gaps': 'Nuqsaanno la hagaajinayo',
        'readiness.gaps_subtitle': 'Lagu kala saaray darnaanta. Xannibaadyada waa in la hagaajiyaa ka hor gudbinta.',
        'readiness.fix_label': 'Hagaajinta',
        'readiness.suggested_rewrite': 'Qoraal cusub oo la soo jeediyay',
        'readiness.apply_rewrite': 'Adeegso',
        'readiness.applied': 'La adeegsaday',
        'readiness.applied_toast': 'Qoraalka cusub waa la adeegsaday — eeg ka hor gudbinta.',
        'readiness.missing_evidence': 'Caddayn maqan',
        'readiness.where_to_find': 'Halka laga heli karo',
        'readiness.overclaims': 'Sheegashooyin xad-dhaaf ah',
        'readiness.softer': 'Qaab la difaaci karo',
        'readiness.generic_answers': 'Guud aad u badan',
        'readiness.concrete_alt': 'Beddel gaar ah',
        'report_readiness.check': 'Hubinta ka hor gudbinta',
        'report_readiness.checking': 'Waa la baarayaa…',
        'report_readiness.title': 'Diyaarinta warbixinta',
        'report_readiness.scanning': 'Waxaa la baaraya warbixintaada laga eegayo dhinaca deeq-bixiyaha…',
        'report_readiness.donor_concerns': 'Walaacyada deeq-bixiyaha',
        'report_readiness.vague_claims': 'Sheegashooyin aan caddayn',
        'report_readiness.vague_sharper': 'Nooc ka cad',
        'report_readiness.budget_variance': 'Kala duwanaanshaha miisaaniyadda ee la sharxayo',
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
        print(f'  {lang}: +{len(payload)} readiness keys')
    print('Done.')


if __name__ == '__main__':
    main()

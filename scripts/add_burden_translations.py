"""Phase 10.4 — burden estimator translations."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'burden.title': 'Applicant burden + design check',
        'burden.fallback_label': 'BASELINE',
        'burden.check': 'Check burden',
        'burden.recheck': 'Re-check',
        'burden.analyzing': 'Analyzing…',
        'burden.recommend_extend': 'Consider extending the deadline by {n} day(s) given the burden.',
        'burden.vague_criteria': 'Vague criteria',
        'burden.too_burdensome': 'Asks that lock out smaller NGOs',
        'burden.simplifications': 'Suggested simplifications',
        'burden.predicted_issues': 'Likely application quality issues',
        'burden.eligibility_concerns': 'Eligibility concerns',
        'burden.sharper': 'Sharper',
        'burden.alternative': 'Alternative',
        'burden.current': 'Current',
        'burden.proposed': 'Proposed',
        'burden.suggestion': 'Suggestion',
    },
    'ar': {
        'burden.title': 'فحص عبء المتقدم وجودة التصميم',
        'burden.fallback_label': 'أساسي',
        'burden.check': 'افحص العبء',
        'burden.recheck': 'إعادة الفحص',
        'burden.analyzing': 'جارٍ التحليل…',
        'burden.recommend_extend': 'فكّر في تمديد الموعد النهائي بـ {n} يومًا نظرًا للعبء.',
        'burden.vague_criteria': 'معايير غامضة',
        'burden.too_burdensome': 'متطلبات تستبعد المنظمات الأصغر',
        'burden.simplifications': 'تبسيطات مقترحة',
        'burden.predicted_issues': 'مشكلات جودة محتملة',
        'burden.eligibility_concerns': 'مخاوف الأهلية',
        'burden.sharper': 'أكثر دقة',
        'burden.alternative': 'بديل',
        'burden.current': 'الحالي',
        'burden.proposed': 'المقترح',
        'burden.suggestion': 'اقتراح',
    },
    'fr': {
        'burden.title': 'Charge des candidats + qualité du design',
        'burden.fallback_label': 'BASIQUE',
        'burden.check': 'Vérifier la charge',
        'burden.recheck': 'Re-vérifier',
        'burden.analyzing': 'Analyse…',
        'burden.recommend_extend': "Envisagez d'étendre la date limite de {n} jour(s).",
        'burden.vague_criteria': 'Critères vagues',
        'burden.too_burdensome': 'Demandes qui excluent les petites ONG',
        'burden.simplifications': 'Simplifications suggérées',
        'burden.predicted_issues': 'Problèmes de qualité probables',
        'burden.eligibility_concerns': "Préoccupations d'éligibilité",
        'burden.sharper': 'Plus précis',
        'burden.alternative': 'Alternative',
        'burden.current': 'Actuel',
        'burden.proposed': 'Proposé',
        'burden.suggestion': 'Suggestion',
    },
    'es': {
        'burden.title': 'Carga del solicitante + calidad del diseño',
        'burden.fallback_label': 'BÁSICO',
        'burden.check': 'Verificar carga',
        'burden.recheck': 'Re-verificar',
        'burden.analyzing': 'Analizando…',
        'burden.recommend_extend': 'Considere extender el plazo {n} día(s) por la carga.',
        'burden.vague_criteria': 'Criterios vagos',
        'burden.too_burdensome': 'Requisitos que excluyen ONG pequeñas',
        'burden.simplifications': 'Simplificaciones sugeridas',
        'burden.predicted_issues': 'Problemas de calidad probables',
        'burden.eligibility_concerns': 'Preocupaciones de elegibilidad',
        'burden.sharper': 'Más preciso',
        'burden.alternative': 'Alternativa',
        'burden.current': 'Actual',
        'burden.proposed': 'Propuesto',
        'burden.suggestion': 'Sugerencia',
    },
    'sw': {
        'burden.title': 'Mzigo wa mwombaji + ubora wa muundo',
        'burden.fallback_label': 'MSINGI',
        'burden.check': 'Kagua mzigo',
        'burden.recheck': 'Kagua tena',
        'burden.analyzing': 'Inachambua…',
        'burden.recommend_extend': 'Fikiria kuongeza muda wa kuwasilisha kwa siku {n}.',
        'burden.vague_criteria': 'Vigezo visivyowazi',
        'burden.too_burdensome': 'Mahitaji yanayowafunga NGOs ndogo',
        'burden.simplifications': 'Urahisishaji uliopendekezwa',
        'burden.predicted_issues': 'Matatizo yanayowezekana',
        'burden.eligibility_concerns': 'Wasiwasi wa kustahiki',
        'burden.sharper': 'Wazi zaidi',
        'burden.alternative': 'Mbadala',
        'burden.current': 'Sasa',
        'burden.proposed': 'Iliyopendekezwa',
        'burden.suggestion': 'Pendekezo',
    },
    'so': {
        'burden.title': 'Culayska codsadaha + tayada naqshadaynta',
        'burden.fallback_label': 'ASAASI',
        'burden.check': 'Hubi culayska',
        'burden.recheck': 'Dib u hubi',
        'burden.analyzing': 'Waa la falanqaynayaa…',
        'burden.recommend_extend': 'Tixgali in la kordhiyo waqtiga {n} maalmood.',
        'burden.vague_criteria': 'Shuruudo aan caddayn',
        'burden.too_burdensome': 'Codsi xidha NGOs yar yar',
        'burden.simplifications': 'Fududayn la soo jeediyay',
        'burden.predicted_issues': 'Dhibaatooyin la filan karo',
        'burden.eligibility_concerns': 'Walaacyada u-qalmidda',
        'burden.sharper': 'Cad',
        'burden.alternative': 'Beddel',
        'burden.current': 'Hadda',
        'burden.proposed': 'La soo jeediyay',
        'burden.suggestion': 'Talo',
    },
}


def main():
    for lang, payload in T.items():
        p = I18N / f'{lang}.json'
        data = json.load(p.open(encoding='utf-8'))
        data.update(payload)
        with p.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'  {lang}: +{len(payload)} burden keys')
    print('Done.')


if __name__ == '__main__':
    main()

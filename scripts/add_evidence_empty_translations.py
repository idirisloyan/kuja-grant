"""Phase 13.22 — extract-evidence empty-state translations."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'review.detail.evidence_no_criteria_label': 'Evidence extract not applicable',
        'review.detail.evidence_no_criteria_body': 'This grant has no evaluation criteria defined, so criterion-by-criterion evidence extraction does not apply here. Add criteria to the grant to enable this feature.',
    },
    'ar': {
        'review.detail.evidence_no_criteria_label': 'استخراج الأدلة غير قابل للتطبيق',
        'review.detail.evidence_no_criteria_body': 'لا توجد معايير تقييم محددة لهذه المنحة، لذا فإن استخراج الأدلة لكل معيار لا ينطبق هنا. أضف معايير إلى المنحة لتفعيل هذه الميزة.',
    },
    'fr': {
        'review.detail.evidence_no_criteria_label': "Extraction d'éléments non applicable",
        'review.detail.evidence_no_criteria_body': "Cette subvention n'a pas de critères d'évaluation définis, donc l'extraction par critère ne s'applique pas. Ajoutez des critères à la subvention pour activer cette fonctionnalité.",
    },
    'es': {
        'review.detail.evidence_no_criteria_label': 'Extracción de evidencia no aplicable',
        'review.detail.evidence_no_criteria_body': 'Esta subvención no tiene criterios de evaluación definidos, por lo que la extracción de evidencia por criterio no aplica. Agregue criterios para habilitar esta función.',
    },
    'sw': {
        'review.detail.evidence_no_criteria_label': 'Utoaji wa ushahidi haitumiki',
        'review.detail.evidence_no_criteria_body': 'Ruzuku hii haina vigezo vya tathmini vilivyofafanuliwa, kwa hivyo utoaji wa ushahidi kwa kila kigezo hautumiki hapa. Ongeza vigezo kwenye ruzuku ili kuwezesha kipengele hiki.',
    },
    'so': {
        'review.detail.evidence_no_criteria_label': 'Soosaarista caddaynta ma khusayso',
        'review.detail.evidence_no_criteria_body': "Deeqdani ma laha shuruudo qiimayn la qeexay, sidaa darteed soosaarista caddaynta ee shuruud kasta ma khusayso halkan. Ku dar shuruudo deeqda si aad u shidi karto astaantan.",
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
        print(f'  {lang}: +{len(payload)}')

if __name__ == '__main__':
    main()

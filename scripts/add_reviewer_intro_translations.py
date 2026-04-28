"""Tiny i18n addition: reviewer_summary.intro."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {'reviewer_summary.intro': 'One-screen executive read of this application — extracted evidence per criterion plus a draft rationale you can edit instead of writing from scratch.'},
    'ar': {'reviewer_summary.intro': 'قراءة تنفيذية للطلب على شاشة واحدة — أدلة مستخرجة لكل معيار بالإضافة إلى مسودة تبرير يمكنك تعديلها.'},
    'fr': {'reviewer_summary.intro': "Lecture exécutive sur un écran — preuves extraites par critère et brouillon de justification éditable plutôt qu'à écrire de zéro."},
    'es': {'reviewer_summary.intro': 'Lectura ejecutiva en una pantalla — evidencia extraída por criterio más un borrador de justificación que puede editar en vez de escribir desde cero.'},
    'sw': {'reviewer_summary.intro': 'Usomaji wa utendaji kwenye skrini moja — ushahidi uliotolewa kwa kila kigezo pamoja na rasimu ya sababu unayoweza kuhariri badala ya kuandika upya.'},
    'so': {'reviewer_summary.intro': 'Akhrin tabaha hal shaashad — caddaymo laga soo saaray shuruud kasta iyo qabyada sababaynta oo aad wax ka beddeli karto halkii aad si gaar ah u qori lahayd.'},
}

def main():
    for lang, payload in T.items():
        p = I18N / f'{lang}.json'
        data = json.load(p.open(encoding='utf-8'))
        data.update(payload)
        with p.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'  {lang}: +{len(payload)} reviewer_summary.intro key')


if __name__ == '__main__':
    main()

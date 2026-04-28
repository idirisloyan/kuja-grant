"""Phase 10.6 — this_week.* translations."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'this_week.title': 'This week',
        'this_week.readiness': 'readiness',
        'this_week.uplift_unit': 'pts',
        'this_week.empty': "You're all caught up — nothing flagged for this week.",
    },
    'ar': {
        'this_week.title': 'هذا الأسبوع',
        'this_week.readiness': 'الجاهزية',
        'this_week.uplift_unit': 'نقطة',
        'this_week.empty': 'أنت محدّث — لا توجد بنود لهذا الأسبوع.',
    },
    'fr': {
        'this_week.title': 'Cette semaine',
        'this_week.readiness': 'préparation',
        'this_week.uplift_unit': 'pts',
        'this_week.empty': "Vous êtes à jour — rien à signaler cette semaine.",
    },
    'es': {
        'this_week.title': 'Esta semana',
        'this_week.readiness': 'preparación',
        'this_week.uplift_unit': 'pts',
        'this_week.empty': 'Está al día — sin pendientes esta semana.',
    },
    'sw': {
        'this_week.title': 'Wiki hii',
        'this_week.readiness': 'utayari',
        'this_week.uplift_unit': 'alama',
        'this_week.empty': 'Umemaliza yote — hakuna kilichowekwa alama wiki hii.',
    },
    'so': {
        'this_week.title': 'Toddobaadkan',
        'this_week.readiness': 'diyaarinta',
        'this_week.uplift_unit': 'dhibco',
        'this_week.empty': 'Wax kasta waad gaartay — wax dhab ah lama calaamadeyn toddobaadkan.',
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
        print(f'  {lang}: +{len(payload)} this_week keys')
    print('Done.')


if __name__ == '__main__':
    main()

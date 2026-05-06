"""Phase 13.9 — Ask AI panel translations."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'ask_ai.title': 'Ask Kuja',
        'ask_ai.placeholder': 'Ask about your grants, reports, risks…',
        'ask_ai.thinking': 'Looking it up…',
        'ask_ai.try_examples': 'Try asking:',
        'ask_ai.example_1': 'Which reports are overdue?',
        'ask_ai.example_2': 'Show me the compliance health for grant 12.',
        'ask_ai.example_3': 'List my open risks.',
    },
    'ar': {
        'ask_ai.title': 'اسأل كوجا',
        'ask_ai.placeholder': 'اسأل عن منحك أو تقاريرك أو مخاطرك…',
        'ask_ai.thinking': 'جارٍ البحث…',
        'ask_ai.try_examples': 'جرّب أن تسأل:',
        'ask_ai.example_1': 'ما التقارير المتأخرة؟',
        'ask_ai.example_2': 'أرني درجة الامتثال للمنحة 12.',
        'ask_ai.example_3': 'اعرض المخاطر المفتوحة لديّ.',
    },
    'fr': {
        'ask_ai.title': 'Demander à Kuja',
        'ask_ai.placeholder': 'Posez une question sur vos subventions, rapports, risques…',
        'ask_ai.thinking': 'Recherche en cours…',
        'ask_ai.try_examples': 'Essayez de demander :',
        'ask_ai.example_1': 'Quels rapports sont en retard ?',
        'ask_ai.example_2': "Montrez-moi le score de conformité pour la subvention 12.",
        'ask_ai.example_3': 'Listez mes risques ouverts.',
    },
    'es': {
        'ask_ai.title': 'Preguntar a Kuja',
        'ask_ai.placeholder': 'Pregunte sobre sus subvenciones, informes, riesgos…',
        'ask_ai.thinking': 'Buscando…',
        'ask_ai.try_examples': 'Pruebe a preguntar:',
        'ask_ai.example_1': '¿Qué informes están vencidos?',
        'ask_ai.example_2': 'Muéstreme el puntaje de cumplimiento para la subvención 12.',
        'ask_ai.example_3': 'Liste mis riesgos abiertos.',
    },
    'sw': {
        'ask_ai.title': 'Uliza Kuja',
        'ask_ai.placeholder': 'Uliza kuhusu ruzuku, ripoti, hatari zako…',
        'ask_ai.thinking': 'Inatafuta…',
        'ask_ai.try_examples': 'Jaribu kuuliza:',
        'ask_ai.example_1': 'Ripoti zipi zimepitwa na muda?',
        'ask_ai.example_2': 'Nionyeshe alama ya kufuata sheria kwa ruzuku 12.',
        'ask_ai.example_3': 'Orodhesha hatari zangu zilizo wazi.',
    },
    'so': {
        'ask_ai.title': 'Weydii Kuja',
        'ask_ai.placeholder': 'Weydii ku saabsan deeqahaaga, warbixinta, halista…',
        'ask_ai.thinking': 'Waa la raadinayaa…',
        'ask_ai.try_examples': 'Isku day inaad weydiiso:',
        'ask_ai.example_1': 'Warbixino ay waqtigoodu dhaafay?',
        'ask_ai.example_2': "I tus dhibcaha qaanuun-raacida ee deeqda 12.",
        'ask_ai.example_3': 'Liiska halista furan ee aan haysto.',
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

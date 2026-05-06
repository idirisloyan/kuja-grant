"""Phase 13.6 — inline_status.changed key (used by InlineStatusDropdown)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {'inline_status.changed': 'Status updated'},
    'ar': {'inline_status.changed': 'تم تحديث الحالة'},
    'fr': {'inline_status.changed': 'Statut mis à jour'},
    'es': {'inline_status.changed': 'Estado actualizado'},
    'sw': {'inline_status.changed': 'Hali imesasishwa'},
    'so': {'inline_status.changed': 'Heerka waa la cusbooneysiiyay'},
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

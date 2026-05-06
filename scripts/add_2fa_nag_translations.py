"""Phase 13.15 — 2FA nag banner translations."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'twofa_nag.title': 'Two-factor authentication recommended.',
        'twofa_nag.body': 'Admin accounts should enroll in 2FA to protect tenant data.',
        'twofa_nag.enroll_now': 'Enroll now',
    },
    'ar': {
        'twofa_nag.title': 'يُنصح بالمصادقة الثنائية.',
        'twofa_nag.body': 'يجب على حسابات المسؤولين تسجيل المصادقة الثنائية لحماية بيانات المستأجر.',
        'twofa_nag.enroll_now': 'سجّل الآن',
    },
    'fr': {
        'twofa_nag.title': "L'authentification à deux facteurs est recommandée.",
        'twofa_nag.body': 'Les comptes admin devraient activer le 2FA pour protéger les données.',
        'twofa_nag.enroll_now': 'Activer',
    },
    'es': {
        'twofa_nag.title': 'Se recomienda autenticación de dos factores.',
        'twofa_nag.body': 'Las cuentas admin deben habilitar 2FA para proteger los datos.',
        'twofa_nag.enroll_now': 'Activar ahora',
    },
    'sw': {
        'twofa_nag.title': 'Uthibitishaji wa hatua mbili unapendekezwa.',
        'twofa_nag.body': 'Akaunti za msimamizi zinapaswa kujiandikisha kwa 2FA kulinda data.',
        'twofa_nag.enroll_now': 'Jiandikishe sasa',
    },
    'so': {
        'twofa_nag.title': 'Xaqiijinta laba-tallaabo ayaa la talinayaa.',
        'twofa_nag.body': "Akoonnada maamulka waa inay 2FA dhigtaan si ay u ilaaliyaan xogta.",
        'twofa_nag.enroll_now': 'Hadda is diiwaangeli',
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

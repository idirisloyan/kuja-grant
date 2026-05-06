"""Phase 13.16+13.17 — changelog button + keyboard shortcut overlay i18n."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'changelog.open': "What's new",
        'changelog.title': "What's new in Kuja",
        'shortcuts.title': 'Keyboard shortcuts',
        'shortcuts.show_overlay': 'Show this overlay',
        'shortcuts.close_dialog': 'Close any dialog',
        'shortcuts.go_dashboard': 'Go to dashboard',
        'shortcuts.go_applications': 'Go to applications',
        'shortcuts.go_reports': 'Go to reports',
        'shortcuts.go_grants': 'Go to grants',
        'shortcuts.group.global': 'Global',
        'shortcuts.group.navigation': 'Navigation',
    },
    'ar': {
        'changelog.open': 'الجديد',
        'changelog.title': 'ما الجديد في كوجا',
        'shortcuts.title': 'اختصارات لوحة المفاتيح',
        'shortcuts.show_overlay': 'عرض هذه النافذة',
        'shortcuts.close_dialog': 'إغلاق أي مربع حوار',
        'shortcuts.go_dashboard': 'الذهاب إلى لوحة المعلومات',
        'shortcuts.go_applications': 'الذهاب إلى الطلبات',
        'shortcuts.go_reports': 'الذهاب إلى التقارير',
        'shortcuts.go_grants': 'الذهاب إلى المنح',
        'shortcuts.group.global': 'عام',
        'shortcuts.group.navigation': 'التنقل',
    },
    'fr': {
        'changelog.open': 'Nouveautés',
        'changelog.title': 'Quoi de neuf dans Kuja',
        'shortcuts.title': 'Raccourcis clavier',
        'shortcuts.show_overlay': 'Afficher cette superposition',
        'shortcuts.close_dialog': 'Fermer la boîte de dialogue',
        'shortcuts.go_dashboard': 'Aller au tableau de bord',
        'shortcuts.go_applications': 'Aller aux candidatures',
        'shortcuts.go_reports': 'Aller aux rapports',
        'shortcuts.go_grants': 'Aller aux subventions',
        'shortcuts.group.global': 'Global',
        'shortcuts.group.navigation': 'Navigation',
    },
    'es': {
        'changelog.open': 'Novedades',
        'changelog.title': 'Novedades en Kuja',
        'shortcuts.title': 'Atajos de teclado',
        'shortcuts.show_overlay': 'Mostrar esta ventana',
        'shortcuts.close_dialog': 'Cerrar diálogo',
        'shortcuts.go_dashboard': 'Ir al panel',
        'shortcuts.go_applications': 'Ir a solicitudes',
        'shortcuts.go_reports': 'Ir a informes',
        'shortcuts.go_grants': 'Ir a subvenciones',
        'shortcuts.group.global': 'Global',
        'shortcuts.group.navigation': 'Navegación',
    },
    'sw': {
        'changelog.open': 'Mpya',
        'changelog.title': 'Mpya katika Kuja',
        'shortcuts.title': 'Njia za mkato za kibodi',
        'shortcuts.show_overlay': 'Onyesha dirisha hili',
        'shortcuts.close_dialog': 'Funga mazungumzo',
        'shortcuts.go_dashboard': 'Nenda kwa dashibodi',
        'shortcuts.go_applications': 'Nenda kwa maombi',
        'shortcuts.go_reports': 'Nenda kwa ripoti',
        'shortcuts.go_grants': 'Nenda kwa ruzuku',
        'shortcuts.group.global': 'Jumla',
        'shortcuts.group.navigation': 'Urambazaji',
    },
    'so': {
        'changelog.open': 'Wax cusub',
        'changelog.title': 'Waxa cusub ee Kuja',
        'shortcuts.title': 'Furaha kibordhka',
        'shortcuts.show_overlay': 'Tus daaqaddan',
        'shortcuts.close_dialog': 'Xidh wadahadalka',
        'shortcuts.go_dashboard': 'Tag dashboard-ka',
        'shortcuts.go_applications': 'Tag codsiyada',
        'shortcuts.go_reports': 'Tag warbixinta',
        'shortcuts.go_grants': 'Tag deeqaha',
        'shortcuts.group.global': 'Guud',
        'shortcuts.group.navigation': 'Hababka',
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

"""Phase 11.1 — localize ComplianceState pill labels + tooltip descriptions.

The team's Apr 28 retest flagged English compliance vocabulary
(CLEAR / CONFIRMED ISSUE / LIKELY ISSUE / MISSING EVIDENCE /
FOLLOW-UP RECOMMENDED) leaking onto Arabic donor pages. This script
adds compliance_state.<state>.label + .desc keys across all 6 locales
so the pill text and tooltip both render in the user's language.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'compliance_state.clear.label': 'Clear',
        'compliance_state.clear.desc': 'No issues found in our checks.',
        'compliance_state.confirmed.label': 'Confirmed issue',
        'compliance_state.confirmed.desc': 'Hard block until manually overridden.',
        'compliance_state.likely.label': 'Likely issue',
        'compliance_state.likely.desc': 'High confidence; lean toward escalation.',
        'compliance_state.missing.label': 'Missing evidence',
        'compliance_state.missing.desc': "Couldn't run the check; gap, not a fail.",
        'compliance_state.followup.label': 'Follow-up recommended',
        'compliance_state.followup.desc': 'Automated check passed; human eye warranted.',
    },
    'ar': {
        'compliance_state.clear.label': 'سليم',
        'compliance_state.clear.desc': 'لم يتم العثور على مشكلات في فحوصاتنا.',
        'compliance_state.confirmed.label': 'مشكلة مؤكدة',
        'compliance_state.confirmed.desc': 'حظر صارم حتى يتم تجاوزه يدوياً.',
        'compliance_state.likely.label': 'مشكلة محتملة',
        'compliance_state.likely.desc': 'ثقة عالية؛ يُفضّل التصعيد.',
        'compliance_state.missing.label': 'دليل ناقص',
        'compliance_state.missing.desc': 'لم نتمكن من إجراء الفحص؛ ثغرة، لا فشل.',
        'compliance_state.followup.label': 'متابعة موصى بها',
        'compliance_state.followup.desc': 'الفحص التلقائي ناجح؛ يحتاج إلى مراجعة بشرية.',
    },
    'fr': {
        'compliance_state.clear.label': 'En règle',
        'compliance_state.clear.desc': "Aucun problème détecté lors de nos vérifications.",
        'compliance_state.confirmed.label': 'Problème confirmé',
        'compliance_state.confirmed.desc': "Blocage strict jusqu'à dérogation manuelle.",
        'compliance_state.likely.label': 'Problème probable',
        'compliance_state.likely.desc': "Forte confiance ; penchez vers l'escalade.",
        'compliance_state.missing.label': 'Preuves manquantes',
        'compliance_state.missing.desc': "Vérification non exécutée ; lacune, pas un échec.",
        'compliance_state.followup.label': 'Suivi recommandé',
        'compliance_state.followup.desc': 'Vérification automatique réussie ; un regard humain est conseillé.',
    },
    'es': {
        'compliance_state.clear.label': 'En orden',
        'compliance_state.clear.desc': 'No se encontraron problemas en nuestras verificaciones.',
        'compliance_state.confirmed.label': 'Problema confirmado',
        'compliance_state.confirmed.desc': 'Bloqueo firme hasta anulación manual.',
        'compliance_state.likely.label': 'Problema probable',
        'compliance_state.likely.desc': 'Alta confianza; inclínese a escalar.',
        'compliance_state.missing.label': 'Evidencia faltante',
        'compliance_state.missing.desc': 'No se pudo ejecutar la verificación; brecha, no un fallo.',
        'compliance_state.followup.label': 'Seguimiento recomendado',
        'compliance_state.followup.desc': 'Verificación automática aprobada; se recomienda revisión humana.',
    },
    'sw': {
        'compliance_state.clear.label': 'Salama',
        'compliance_state.clear.desc': 'Hakuna matatizo yaliyopatikana katika ukaguzi wetu.',
        'compliance_state.confirmed.label': 'Suala lililothibitishwa',
        'compliance_state.confirmed.desc': 'Kizuizi kigumu hadi kibatilishwe kwa mkono.',
        'compliance_state.likely.label': 'Suala linalowezekana',
        'compliance_state.likely.desc': 'Imani ya juu; elekeza kwenye uongezaji.',
        'compliance_state.missing.label': 'Ushahidi unaokosekana',
        'compliance_state.missing.desc': 'Hatukuweza kuendesha ukaguzi; pengo, si kushindwa.',
        'compliance_state.followup.label': 'Ufuatiliaji unapendekezwa',
        'compliance_state.followup.desc': 'Ukaguzi wa kiotomatiki umefanikiwa; jicho la binadamu linahitajika.',
    },
    'so': {
        'compliance_state.clear.label': 'Caafimaad',
        'compliance_state.clear.desc': 'Wax dhibaato ah laguma helin hubinteenna.',
        'compliance_state.confirmed.label': 'Arrin la xaqiijiyay',
        'compliance_state.confirmed.desc': 'Xidhid adag ilaa la beddelay si gacanta ah.',
        'compliance_state.likely.label': 'Arrin macquul ah',
        'compliance_state.likely.desc': 'Kalsooni sare; u janji kor u qaadis.',
        'compliance_state.missing.label': 'Caddayn maqan',
        'compliance_state.missing.desc': 'Ma awoodno inaan socodsiino hubinta; nuqsaan, ma aha guuldarro.',
        'compliance_state.followup.label': 'Sii wadis ayaa la talinayaa',
        'compliance_state.followup.desc': 'Hubinta otomaatiga ah way gudubtay; indho dadku waxay u baahan yihiin.',
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
        print(f'  {lang}: +{len(payload)} compliance_state keys')
    print('Done.')


if __name__ == '__main__':
    main()

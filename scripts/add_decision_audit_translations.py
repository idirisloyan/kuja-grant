"""Phase 10.8 — decision_audit.* keys."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'decision_audit.open': 'Decision audit',
        'decision_audit.title': 'Decision audit',
        'decision_audit.empty': 'No events recorded yet.',
        'decision_audit.ai_summary': 'AI calls on this application',
        'decision_audit.ai_runs': 'runs',
        'decision_audit.ai_summary_note': 'Counts are AI invocations, not suggestions accepted. Heuristic only.',
    },
    'ar': {
        'decision_audit.open': 'سجل القرارات',
        'decision_audit.title': 'سجل القرارات',
        'decision_audit.empty': 'لم يتم تسجيل أحداث بعد.',
        'decision_audit.ai_summary': 'استدعاءات الذكاء الاصطناعي على هذا الطلب',
        'decision_audit.ai_runs': 'مرات',
        'decision_audit.ai_summary_note': 'الأعداد هي استدعاءات للذكاء الاصطناعي، وليست اقتراحات مقبولة. تقدير فقط.',
    },
    'fr': {
        'decision_audit.open': 'Audit des décisions',
        'decision_audit.title': 'Audit des décisions',
        'decision_audit.empty': 'Aucun événement enregistré.',
        'decision_audit.ai_summary': "Appels IA sur cette candidature",
        'decision_audit.ai_runs': 'exécutions',
        'decision_audit.ai_summary_note': "Compte d'invocations IA, pas de suggestions acceptées. Heuristique seulement.",
    },
    'es': {
        'decision_audit.open': 'Auditoría de decisiones',
        'decision_audit.title': 'Auditoría de decisiones',
        'decision_audit.empty': 'No se han registrado eventos.',
        'decision_audit.ai_summary': 'Llamadas IA sobre esta solicitud',
        'decision_audit.ai_runs': 'ejecuciones',
        'decision_audit.ai_summary_note': 'Conteos de invocaciones IA, no sugerencias aceptadas. Solo heurística.',
    },
    'sw': {
        'decision_audit.open': 'Ukaguzi wa uamuzi',
        'decision_audit.title': 'Ukaguzi wa uamuzi',
        'decision_audit.empty': 'Hakuna matukio yaliyorekodiwa bado.',
        'decision_audit.ai_summary': 'Wito wa AI kwenye maombi haya',
        'decision_audit.ai_runs': 'mara',
        'decision_audit.ai_summary_note': 'Idadi ni wito wa AI, si mapendekezo yaliyokubaliwa. Makadirio pekee.',
    },
    'so': {
        'decision_audit.open': 'Hubinta go\'aanka',
        'decision_audit.title': 'Hubinta go\'aanka',
        'decision_audit.empty': 'Ma jiraan dhacdooyin la diiwaangeliyay weli.',
        'decision_audit.ai_summary': 'Wicitaannada AI codsigaan',
        'decision_audit.ai_runs': 'jeer',
        'decision_audit.ai_summary_note': 'Tirinta waa wicitaano AI, ma aha talooyin la aqbalay. Qiyaas keliya.',
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
        print(f'  {lang}: +{len(payload)} decision_audit keys')
    print('Done.')


if __name__ == '__main__':
    main()

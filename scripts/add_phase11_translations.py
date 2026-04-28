"""Phase 11 — i18n keys for memory transparency, decision-changers, etc."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'coauthor.memory_used_title': 'Drew on {n} fact(s) from your memory',
        'coauthor.memory_used_note': "Items you've used before rank higher next time. Visit Org Memory to manage.",
        'reviewer_summary.paste_into_this': 'Paste into this row',
        'reviewer_summary.per_crit_rationale': 'Rationale for this criterion',
        'reviewer_summary.decision_changers': 'What would change this decision',
        'reviewer_summary.decision_changers_hint': 'Specific evidence that would shift the score — useful for follow-up before scoring.',
        'report_readiness.addresses': 'Resolves',
    },
    'ar': {
        'coauthor.memory_used_title': 'استند إلى {n} حقيقة من ذاكرتك',
        'coauthor.memory_used_note': 'العناصر التي استخدمتها سابقاً ترتفع في الترتيب. تفضّل بزيارة ذاكرة المنظمة لإدارتها.',
        'reviewer_summary.paste_into_this': 'الصق في هذا الصف',
        'reviewer_summary.per_crit_rationale': 'تبرير لهذا المعيار',
        'reviewer_summary.decision_changers': 'ما الذي يغيّر هذا القرار',
        'reviewer_summary.decision_changers_hint': 'أدلة محددة قد تغيّر الدرجة — مفيدة للمتابعة قبل التقييم.',
        'report_readiness.addresses': 'يعالج',
    },
    'fr': {
        'coauthor.memory_used_title': "S'est appuyé sur {n} fait(s) de votre mémoire",
        'coauthor.memory_used_note': "Les éléments déjà utilisés montent dans le classement. Visitez Mémoire ONG pour les gérer.",
        'reviewer_summary.paste_into_this': 'Coller dans cette ligne',
        'reviewer_summary.per_crit_rationale': 'Justification pour ce critère',
        'reviewer_summary.decision_changers': 'Ce qui changerait cette décision',
        'reviewer_summary.decision_changers_hint': "Preuves spécifiques qui modifieraient la note — utile avant de scorer.",
        'report_readiness.addresses': 'Résout',
    },
    'es': {
        'coauthor.memory_used_title': 'Se basó en {n} hecho(s) de su memoria',
        'coauthor.memory_used_note': 'Los elementos ya usados suben en el ranking. Visite Memoria ONG para gestionar.',
        'reviewer_summary.paste_into_this': 'Pegar en esta fila',
        'reviewer_summary.per_crit_rationale': 'Justificación para este criterio',
        'reviewer_summary.decision_changers': 'Qué cambiaría esta decisión',
        'reviewer_summary.decision_changers_hint': 'Evidencia específica que cambiaría la puntuación — útil antes de puntuar.',
        'report_readiness.addresses': 'Resuelve',
    },
    'sw': {
        'coauthor.memory_used_title': 'Ilitumia ukweli {n} kutoka kwa kumbukumbu yako',
        'coauthor.memory_used_note': 'Vipengele ulivyotumia kabla huongezeka katika orodha. Tembelea Kumbukumbu ya NGO kuvisimamia.',
        'reviewer_summary.paste_into_this': 'Bandika kwenye safu hii',
        'reviewer_summary.per_crit_rationale': 'Sababu ya kigezo hiki',
        'reviewer_summary.decision_changers': 'Nini kingebadilisha uamuzi huu',
        'reviewer_summary.decision_changers_hint': 'Ushahidi maalum ungeobadilisha alama — muhimu kabla ya kupiga alama.',
        'report_readiness.addresses': 'Hutatua',
    },
    'so': {
        'coauthor.memory_used_title': 'Waxay ku tiirsatay {n} xaqiiq xusuustaada',
        'coauthor.memory_used_note': 'Walxaha aad horay u isticmaashay ayaa kor u kaca darajada. Booqo Xusuusta NGO si aad u maamusho.',
        'reviewer_summary.paste_into_this': 'Ku dhaji safkan',
        'reviewer_summary.per_crit_rationale': 'Sababaynta shuruudan',
        'reviewer_summary.decision_changers': 'Waxa beddeli kara go\'aankan',
        'reviewer_summary.decision_changers_hint': 'Caddayn gaar ah oo beddeli karta dhibcaha — waxay caawisaa ka hor qiimaynta.',
        'report_readiness.addresses': 'Wuxuu xalliyaa',
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
        print(f'  {lang}: +{len(payload)} phase 11 keys')


if __name__ == '__main__':
    main()

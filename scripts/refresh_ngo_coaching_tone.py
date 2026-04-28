"""Phase 11.5 — refresh NGO-facing copy from judging tone to coaching tone.

The team's spec: "make every NGO-facing screen answer where do I stand,
what should I do next, how much will it help. Reduce donor/process
jargon. Use confidence-building phrasing. Highlight progress and
momentum, not gaps. Turn 'you are missing X' into 'here's how to
strengthen this'."

This script overwrites the most-visible NGO readiness keys with
coaching-tone alternatives across all 6 locales.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        # readiness.* — NGO sees these on the apply form pre-flight modal.
        'readiness.gaps': 'Where to strengthen',
        'readiness.gaps_subtitle': "Sorted by impact. Items marked 'blocker' need attention before submit; everything else lifts your score.",
        'readiness.fix_label': 'How to strengthen',
        'readiness.missing_evidence': 'Evidence that would lift your score',
        'readiness.where_to_find': 'A good place to look',
        'readiness.overclaims': 'Claims worth softening',
        'readiness.softer': 'Defensible reframing',
        'readiness.generic_answers': 'Sections to make specific',
        'readiness.concrete_alt': 'Concrete alternative anchored in your work',
        'readiness.strengths': "What's already strong",
    },
    'ar': {
        'readiness.gaps': 'مواضع التحسين',
        'readiness.gaps_subtitle': 'مرتبة حسب الأثر. العناصر الموسومة "مانع" تحتاج إلى معالجة قبل التقديم؛ والباقي يرفع درجتك.',
        'readiness.fix_label': 'طريقة التحسين',
        'readiness.missing_evidence': 'أدلة سترفع درجتك',
        'readiness.where_to_find': 'مكان جيد للبحث',
        'readiness.overclaims': 'ادعاءات يستحسن تخفيفها',
        'readiness.softer': 'صياغة قابلة للدفاع',
        'readiness.generic_answers': 'أقسام لجعلها محددة',
        'readiness.concrete_alt': 'بديل محدد مستند إلى عملك',
        'readiness.strengths': 'النقاط القوية لديك',
    },
    'fr': {
        'readiness.gaps': 'Où renforcer',
        'readiness.gaps_subtitle': "Triées par impact. Les éléments marqués 'bloquant' nécessitent attention avant l'envoi; les autres améliorent votre score.",
        'readiness.fix_label': 'Comment renforcer',
        'readiness.missing_evidence': 'Preuves qui élèveraient votre score',
        'readiness.where_to_find': 'Un bon endroit où chercher',
        'readiness.overclaims': 'Affirmations à adoucir',
        'readiness.softer': 'Reformulation défendable',
        'readiness.generic_answers': 'Sections à rendre spécifiques',
        'readiness.concrete_alt': 'Alternative concrète ancrée dans votre travail',
        'readiness.strengths': 'Ce qui est déjà fort',
    },
    'es': {
        'readiness.gaps': 'Dónde fortalecer',
        'readiness.gaps_subtitle': "Ordenadas por impacto. Las marcadas 'bloqueador' requieren atención antes de enviar; el resto eleva su puntaje.",
        'readiness.fix_label': 'Cómo fortalecer',
        'readiness.missing_evidence': 'Evidencia que elevaría su puntaje',
        'readiness.where_to_find': 'Un buen lugar para buscar',
        'readiness.overclaims': 'Afirmaciones que conviene suavizar',
        'readiness.softer': 'Reformulación defendible',
        'readiness.generic_answers': 'Secciones para hacer específicas',
        'readiness.concrete_alt': 'Alternativa concreta basada en su trabajo',
        'readiness.strengths': 'Lo que ya es fuerte',
    },
    'sw': {
        'readiness.gaps': 'Mahali pa kuimarisha',
        'readiness.gaps_subtitle': "Yamepangwa kwa athari. Vile vilivyotajwa 'kizuizi' vinahitaji uangalifu kabla ya kuwasilisha; vingine hupandisha alama yako.",
        'readiness.fix_label': 'Jinsi ya kuimarisha',
        'readiness.missing_evidence': 'Ushahidi ambao ungepandisha alama yako',
        'readiness.where_to_find': 'Mahali pazuri pa kutafuta',
        'readiness.overclaims': 'Madai yanayofaa kupunguzwa',
        'readiness.softer': 'Uundaji wenye kutetewa',
        'readiness.generic_answers': 'Sehemu za kufanya mahususi',
        'readiness.concrete_alt': 'Mbadala mahususi unaotegemea kazi yako',
        'readiness.strengths': "Yale ambayo tayari ni imara",
    },
    'so': {
        'readiness.gaps': 'Goorma la xoojinayo',
        'readiness.gaps_subtitle': "Lagu kala saaray saamaynta. Walxaha lagu calaamadeeyay 'xanibaad' waxay u baahan yihiin dareen ka hor gudbinta; kuwa kale waxay kor u qaadayaan dhibcahaaga.",
        'readiness.fix_label': 'Sida loo xoojinayo',
        'readiness.missing_evidence': 'Caddayn kor u qaadi laheyd dhibcahaaga',
        'readiness.where_to_find': 'Meel fiican oo laga raadiyo',
        'readiness.overclaims': 'Sheegashooyin la jilcin lahaa',
        'readiness.softer': 'Qaab la difaaci karo',
        'readiness.generic_answers': 'Qaybaha la gaar gaar yeelo',
        'readiness.concrete_alt': 'Beddel gaar ah oo ku salaysan shaqadaada',
        'readiness.strengths': 'Waxa horay u xoogga leh',
    },
}


def main():
    for lang, payload in T.items():
        p = I18N / f'{lang}.json'
        data = json.load(p.open(encoding='utf-8'))
        # OVERWRITE existing keys with coaching tone (this is a tone refresh,
        # not an additive change).
        data.update(payload)
        with p.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'  {lang}: refreshed {len(payload)} NGO coaching keys')


if __name__ == '__main__':
    main()

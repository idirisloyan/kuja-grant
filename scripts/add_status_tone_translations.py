"""Phase 10.10 — donor- and NGO-toned status copy.

The base `status.<key>` keys stay (default). We add `status.donor.<key>`
(precise + decision-oriented) and `status.ngo.<key>` (warm + supportive)
variants. Components can opt into a tone via the role context.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'status.donor.submitted': 'Awaiting review',
        'status.donor.under_review': 'In reviewer queue',
        'status.donor.scored': 'Scored — pending decision',
        'status.donor.awarded': 'Awarded',
        'status.donor.rejected': 'Declined',
        'status.donor.draft': 'In draft',
        'status.ngo.submitted': "Submitted — we'll keep you posted",
        'status.ngo.under_review': 'A reviewer is reading your application now',
        'status.ngo.scored': "Scored — we're finalizing the decision",
        'status.ngo.awarded': 'Awarded — congratulations!',
        'status.ngo.rejected': "Not awarded this round — feedback coming soon",
        'status.ngo.draft': 'In draft — keep going when you can',
    },
    'ar': {
        'status.donor.submitted': 'في انتظار المراجعة',
        'status.donor.under_review': 'في قائمة المراجعين',
        'status.donor.scored': 'تم التقييم — في انتظار القرار',
        'status.donor.awarded': 'ممنوحة',
        'status.donor.rejected': 'مرفوضة',
        'status.donor.draft': 'مسودة',
        'status.ngo.submitted': 'تم الإرسال — سنبقيك على اطلاع',
        'status.ngo.under_review': 'يقوم أحد المراجعين بقراءة طلبك الآن',
        'status.ngo.scored': 'تم التقييم — نقوم بإنهاء القرار',
        'status.ngo.awarded': 'ممنوحة — تهانينا!',
        'status.ngo.rejected': 'غير ممنوحة في هذه الجولة — ستصلك ملاحظات قريباً',
        'status.ngo.draft': 'مسودة — تابع عندما تستطيع',
    },
    'fr': {
        'status.donor.submitted': 'En attente de revue',
        'status.donor.under_review': 'Dans la file des examinateurs',
        'status.donor.scored': 'Notée — décision en attente',
        'status.donor.awarded': 'Octroyée',
        'status.donor.rejected': 'Refusée',
        'status.donor.draft': 'Brouillon',
        'status.ngo.submitted': 'Envoyée — nous vous tiendrons informé',
        'status.ngo.under_review': "Un examinateur lit votre candidature en ce moment",
        'status.ngo.scored': 'Notée — nous finalisons la décision',
        'status.ngo.awarded': 'Octroyée — félicitations !',
        'status.ngo.rejected': 'Pas octroyée cette fois — retours à venir',
        'status.ngo.draft': "Brouillon — continuez quand vous pouvez",
    },
    'es': {
        'status.donor.submitted': 'Esperando revisión',
        'status.donor.under_review': 'En cola de revisores',
        'status.donor.scored': 'Puntuada — pendiente de decisión',
        'status.donor.awarded': 'Otorgada',
        'status.donor.rejected': 'Rechazada',
        'status.donor.draft': 'En borrador',
        'status.ngo.submitted': 'Enviada — la mantendremos informada',
        'status.ngo.under_review': 'Un revisor está leyendo su solicitud ahora',
        'status.ngo.scored': 'Puntuada — estamos finalizando la decisión',
        'status.ngo.awarded': 'Otorgada — ¡felicitaciones!',
        'status.ngo.rejected': 'No otorgada esta vez — comentarios pronto',
        'status.ngo.draft': 'En borrador — continúe cuando pueda',
    },
    'sw': {
        'status.donor.submitted': 'Inasubiri ukaguzi',
        'status.donor.under_review': 'Katika foleni ya wakaguzi',
        'status.donor.scored': 'Imepigwa alama — uamuzi unangoja',
        'status.donor.awarded': 'Imepewa',
        'status.donor.rejected': 'Imekataliwa',
        'status.donor.draft': 'Rasimu',
        'status.ngo.submitted': 'Imewasilishwa — tutakujulisha',
        'status.ngo.under_review': 'Mkaguzi anasoma maombi yako sasa',
        'status.ngo.scored': 'Imepigwa alama — tunamaliza uamuzi',
        'status.ngo.awarded': 'Imepewa — hongera!',
        'status.ngo.rejected': 'Haijapewa wakati huu — maoni yanakuja hivi karibuni',
        'status.ngo.draft': 'Rasimu — endelea unapoweza',
    },
    'so': {
        'status.donor.submitted': 'Sugitaan dib u eegista',
        'status.donor.under_review': 'Safka dib-u-eegista',
        'status.donor.scored': 'La qiimeeyay — sugaya go\'aanka',
        'status.donor.awarded': 'La siiyay',
        'status.donor.rejected': 'La diiday',
        'status.donor.draft': 'Qabyada',
        'status.ngo.submitted': 'Waa la gudbiyay — waan ku ogeysiin doonnaa',
        'status.ngo.under_review': 'Dib-u-eegayaal ayaa hadda akhrinaya codsigaaga',
        'status.ngo.scored': 'La qiimeeyay — waan dhamaynaynaa go\'aanka',
        'status.ngo.awarded': 'La siiyay — hambalyo!',
        'status.ngo.rejected': 'Lama siin wareegan — jawaab celin ayaa soo socota',
        'status.ngo.draft': 'Qabyada — sii wad markaad awooddo',
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
        print(f'  {lang}: +{len(payload)} status-tone keys')
    print('Done.')


if __name__ == '__main__':
    main()

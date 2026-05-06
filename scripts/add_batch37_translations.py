"""Batch 37 — comments UI translations."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {
        'comments.title': 'Comments',
        'comments.empty': 'No comments yet. Tag a colleague with @ to start a thread.',
        'comments.placeholder': 'Write a comment… use @handle to notify someone',
        'comments.post': 'Post',
        'comments.mention': 'Mention',
        'comments.insert_mention': 'Insert @ mention',
        'comments.mention_hint': '@email-localpart resolves to a user',
        'comments.delete_confirm': 'Delete this comment?',
        'comments.edited': '(edited)',
    },
    'ar': {
        'comments.title': 'التعليقات',
        'comments.empty': 'لا توجد تعليقات بعد. اذكر زميلًا بـ @ لبدء محادثة.',
        'comments.placeholder': 'اكتب تعليقًا… استخدم @handle لإخطار شخص ما',
        'comments.post': 'نشر',
        'comments.mention': 'إشارة',
        'comments.insert_mention': 'إدراج إشارة @',
        'comments.mention_hint': 'يحل @email-localpart إلى مستخدم',
        'comments.delete_confirm': 'حذف هذا التعليق؟',
        'comments.edited': '(تم التحرير)',
    },
    'fr': {
        'comments.title': 'Commentaires',
        'comments.empty': "Aucun commentaire. Mentionnez un collègue avec @.",
        'comments.placeholder': 'Écrivez un commentaire… utilisez @handle pour mentionner',
        'comments.post': 'Publier',
        'comments.mention': 'Mentionner',
        'comments.insert_mention': 'Insérer une mention @',
        'comments.mention_hint': '@partie-locale-email résout à un utilisateur',
        'comments.delete_confirm': 'Supprimer ce commentaire ?',
        'comments.edited': '(modifié)',
    },
    'es': {
        'comments.title': 'Comentarios',
        'comments.empty': "Sin comentarios aún. Mencione a un colega con @ para iniciar.",
        'comments.placeholder': 'Escriba un comentario… use @handle para notificar',
        'comments.post': 'Publicar',
        'comments.mention': 'Mencionar',
        'comments.insert_mention': 'Insertar mención @',
        'comments.mention_hint': '@parte-local-email se resuelve a usuario',
        'comments.delete_confirm': '¿Eliminar este comentario?',
        'comments.edited': '(editado)',
    },
    'sw': {
        'comments.title': 'Maoni',
        'comments.empty': 'Hakuna maoni bado. Mtaja mwenzako kwa @ kuanza mazungumzo.',
        'comments.placeholder': 'Andika maoni… tumia @handle kumtaarifu mtu',
        'comments.post': 'Chapisha',
        'comments.mention': 'Taja',
        'comments.insert_mention': 'Ingiza @ taja',
        'comments.mention_hint': '@sehemu-ya-barua-pepe inaelekeza kwa mtumiaji',
        'comments.delete_confirm': 'Futa maoni haya?',
        'comments.edited': '(yamehaririwa)',
    },
    'so': {
        'comments.title': 'Faallooyin',
        'comments.empty': 'Faallooyin ma jiraan weli. Ku xus saaxiibkaa @ si aad u bilowdo.',
        'comments.placeholder': 'Qor faallo… isticmaal @handle si aad ugu sheegto qof',
        'comments.post': 'Daabac',
        'comments.mention': 'Xuso',
        'comments.insert_mention': 'Geli @ xusid',
        'comments.mention_hint': '@qaybta-iimaylka waxay u beddelantaa isticmaale',
        'comments.delete_confirm': 'Tirtir faallaadan?',
        'comments.edited': '(la wax ka beddelay)',
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

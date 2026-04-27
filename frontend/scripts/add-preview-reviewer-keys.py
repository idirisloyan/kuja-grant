"""Phase 4.1 — i18n keys for preview-as-reviewer."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {
        "preview_reviewer.cta.open": "Preview as reviewer",
        "preview_reviewer.cta.back_to_edit": "Back to editing",
        "preview_reviewer.heading": "How the reviewer will see this",
        "preview_reviewer.subtitle": "This is what the donor's reviewer sees when scoring your application — same layout, same per-criterion order, same word counts. Use this to spot thin responses before submitting.",
        "preview_reviewer.empty_response": "No response yet — the reviewer will see this section as empty.",
        "preview_reviewer.count.strong": "{n} strong",
        "preview_reviewer.count.adequate": "{n} adequate",
        "preview_reviewer.count.thin": "{n} thin",
        "preview_reviewer.level.strong": "Strong",
        "preview_reviewer.level.adequate": "Adequate",
        "preview_reviewer.level.thin": "Thin",
        "preview_reviewer.thin_warning": "{n} response(s) are thin — they'll likely score lower with the reviewer. Consider adding specific examples, numbers, or evidence before submitting.",
    },
    "ar": {
        "preview_reviewer.cta.open": "عاين كما يراه المراجع",
        "preview_reviewer.cta.back_to_edit": "ارجع للتحرير",
        "preview_reviewer.heading": "كيف سيراه المراجع",
        "preview_reviewer.subtitle": "هذه هي الطريقة التي سيرى بها مراجع المانح طلبك عند التقييم — نفس التخطيط، نفس ترتيب المعايير، نفس عدد الكلمات. استخدم هذا لاكتشاف الإجابات الضعيفة قبل التقديم.",
        "preview_reviewer.empty_response": "لا توجد إجابة بعد — سيرى المراجع هذا القسم فارغاً.",
        "preview_reviewer.count.strong": "{n} قوية",
        "preview_reviewer.count.adequate": "{n} مقبولة",
        "preview_reviewer.count.thin": "{n} ضعيفة",
        "preview_reviewer.level.strong": "قوية",
        "preview_reviewer.level.adequate": "مقبولة",
        "preview_reviewer.level.thin": "ضعيفة",
        "preview_reviewer.thin_warning": "{n} إجابة ضعيفة — على الأرجح ستحصل على درجة أقل من المراجع. أضف أمثلة محددة أو أرقاماً أو أدلّة قبل التقديم.",
    },
    "fr": {
        "preview_reviewer.cta.open": "Aperçu côté évaluateur",
        "preview_reviewer.cta.back_to_edit": "Retour à l'édition",
        "preview_reviewer.heading": "Ce que verra l'évaluateur",
        "preview_reviewer.subtitle": "Voici ce que voit l'évaluateur du bailleur lorsqu'il note votre candidature — même mise en page, même ordre des critères, mêmes décomptes de mots. Utilisez-le pour détecter les réponses minces avant de soumettre.",
        "preview_reviewer.empty_response": "Pas encore de réponse — l'évaluateur verra cette section vide.",
        "preview_reviewer.count.strong": "{n} solide(s)",
        "preview_reviewer.count.adequate": "{n} correcte(s)",
        "preview_reviewer.count.thin": "{n} mince(s)",
        "preview_reviewer.level.strong": "Solide",
        "preview_reviewer.level.adequate": "Correcte",
        "preview_reviewer.level.thin": "Mince",
        "preview_reviewer.thin_warning": "{n} réponse(s) minces — probablement notées plus bas. Ajoutez des exemples concrets, chiffres ou preuves avant la soumission.",
    },
    "es": {
        "preview_reviewer.cta.open": "Previsualizar como evaluador",
        "preview_reviewer.cta.back_to_edit": "Volver a editar",
        "preview_reviewer.heading": "Cómo lo verá el evaluador",
        "preview_reviewer.subtitle": "Así verá el evaluador del donante tu postulación al puntuarla — el mismo diseño, el mismo orden de criterios, los mismos conteos de palabras. Úsalo para detectar respuestas débiles antes de enviar.",
        "preview_reviewer.empty_response": "Aún sin respuesta — el evaluador verá esta sección vacía.",
        "preview_reviewer.count.strong": "{n} sólida(s)",
        "preview_reviewer.count.adequate": "{n} adecuada(s)",
        "preview_reviewer.count.thin": "{n} débil(es)",
        "preview_reviewer.level.strong": "Sólida",
        "preview_reviewer.level.adequate": "Adecuada",
        "preview_reviewer.level.thin": "Débil",
        "preview_reviewer.thin_warning": "{n} respuesta(s) débiles — probablemente serán puntuadas más bajo. Agrega ejemplos concretos, cifras o evidencia antes de enviar.",
    },
    "sw": {
        "preview_reviewer.cta.open": "Onyesha kama mkaguzi",
        "preview_reviewer.cta.back_to_edit": "Rudi kuhariri",
        "preview_reviewer.heading": "Jinsi mkaguzi atakavyoona",
        "preview_reviewer.subtitle": "Hivi ndivyo mkaguzi wa mfadhili anavyoona ombi lako akipanga alama — mpangilio uleule, mpangilio uleule wa vigezo, hesabu zilezile za maneno. Tumia hii kugundua majibu dhaifu kabla ya kuwasilisha.",
        "preview_reviewer.empty_response": "Bado hakuna jibu — mkaguzi ataona sehemu hii ikiwa tupu.",
        "preview_reviewer.count.strong": "{n} imara",
        "preview_reviewer.count.adequate": "{n} ya kutosha",
        "preview_reviewer.count.thin": "{n} dhaifu",
        "preview_reviewer.level.strong": "Imara",
        "preview_reviewer.level.adequate": "Ya kutosha",
        "preview_reviewer.level.thin": "Dhaifu",
        "preview_reviewer.thin_warning": "{n} jibu dhaifu — pengine litapokea alama ya chini. Ongeza mifano halisi, idadi, au ushahidi kabla ya kuwasilisha.",
    },
    "so": {
        "preview_reviewer.cta.open": "Eeg sida eegaha u arki doono",
        "preview_reviewer.cta.back_to_edit": "Ku noqo wax beddelka",
        "preview_reviewer.heading": "Sida eegaha u arki doono",
        "preview_reviewer.subtitle": "Tani waa sida eegaha deeq-bixiyaha u arkayo codsigaaga marka uu qiimaynayo — qaab isku mid ah, kala dambeyn isku mid ah ee cabbirrada, tirinta erayada isku mid ah. Isticmaal tan si aad u ogaato jawaabaha tabar yar ka hor inta aadan gudbin.",
        "preview_reviewer.empty_response": "Wali ma jirto jawaab — eegaha wuxuu arki doonaa qaybtan oo madhan.",
        "preview_reviewer.count.strong": "{n} xooggan",
        "preview_reviewer.count.adequate": "{n} ku filan",
        "preview_reviewer.count.thin": "{n} tabar yar",
        "preview_reviewer.level.strong": "Xooggan",
        "preview_reviewer.level.adequate": "Ku filan",
        "preview_reviewer.level.thin": "Tabar yar",
        "preview_reviewer.thin_warning": "{n} jawaab tabar yar — waxay u badan tahay inay buundo hooseeyaan ka helaan eegaha. Ku dar tusaalooyin gaar ah, lambaro, ama caddayn ka hor inta aadan gudbin.",
    },
}

for lang, additions in KEYS.items():
    p = ROOT / f"{lang}.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    added = 0
    for k, v in additions.items():
        if k not in data:
            data[k] = v
            added += 1
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{lang}: +{added}")

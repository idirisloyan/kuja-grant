"""Tiny i18n addition: report_readiness.intro for the banner variant."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
I18N = ROOT / 'frontend' / 'src' / 'i18n'

T = {
    'en': {'report_readiness.intro': 'A donor-perspective scan of your report before you submit — concerns flagged, vague claims sharpened, missing evidence surfaced. Saves a bounceback.'},
    'ar': {'report_readiness.intro': 'فحص لتقريرك من منظور المانح قبل التقديم — مخاوف محددة وادعاءات غامضة موضحة وأدلة مفقودة مكشوفة. يوفر إعادة إرسال.'},
    'fr': {'report_readiness.intro': "Une analyse de votre rapport du point de vue du bailleur avant l'envoi — préoccupations signalées, affirmations vagues affinées, preuves manquantes mises en évidence. Évite un retour."},
    'es': {'report_readiness.intro': 'Análisis de su informe desde la perspectiva del donante antes de enviar — preocupaciones, afirmaciones vagas afinadas, evidencia faltante. Evita un rebote.'},
    'sw': {'report_readiness.intro': 'Ukaguzi wa ripoti yako kutoka mtazamo wa mfadhili kabla ya kuwasilisha — wasiwasi, madai yasiyo wazi yaliyoboreshwa, ushahidi unaokosekana. Huokoa kurudishwa.'},
    'so': {'report_readiness.intro': 'Baaritaan warbixintaada laga eegayo dhinaca deeq-bixiyaha ka hor gudbinta — walaacyada, sheegashooyin aan caddayn oo la cadeeyay, caddayn maqan. Waxay kaa badbaadinaysaa dib u celin.'},
}

def main():
    for lang, payload in T.items():
        p = I18N / f'{lang}.json'
        data = json.load(p.open(encoding='utf-8'))
        data.update(payload)
        with p.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'  {lang}: +{len(payload)} report_readiness.intro key')


if __name__ == '__main__':
    main()

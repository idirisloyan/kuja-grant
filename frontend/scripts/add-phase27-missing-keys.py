"""Phase 27 — patch missing i18n key flagged in team's 2026-05-16 browser test.

Single missing key: nav.audit_chain. Earlier sidebar code relied on
`t('nav.audit_chain') || 'Audit chain'` as a fallback, but translate()
returns the literal key when missing — which is a truthy string — so
the || fallback never fired. Fix is to add the key everywhere.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "i18n"

KEYS = {
    "en": {"nav.audit_chain": "Audit chain"},
    "fr": {"nav.audit_chain": "Chaîne d'audit"},
    "es": {"nav.audit_chain": "Cadena de auditoría"},
    "ar": {"nav.audit_chain": "سلسلة التدقيق"},
    "sw": {"nav.audit_chain": "Mlolongo wa ukaguzi"},
    "so": {"nav.audit_chain": "Silsiladda hubinta"},
}


def main():
    for locale, keys in KEYS.items():
        path = ROOT / f"{locale}.json"
        if not path.exists():
            print(f"  [skip] {locale}.json not found")
            continue
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        added = updated = 0
        for k, v in keys.items():
            if k not in data:
                added += 1
            elif data[k] != v:
                updated += 1
            data[k] = v
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
            f.write("\n")
        print(f"  {locale}.json: +{added} new, ~{updated} updated")


if __name__ == "__main__":
    main()

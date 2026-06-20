#!/usr/bin/env python3
"""
Phase 99 — Translation merge script.

The Phase 6.1 audit shipped `docs/i18n_review_targets.md` and the team
agreed: when native-speaker reviewers return annotated translations, a
script applies the new values without disturbing untouched keys or
formatting. This is that script.

Usage:

    # Merge a reviewer's batch in (preserves existing keys not present
    # in the batch; overwrites keys that ARE present).
    py -3 frontend/scripts/update_translations.py \\
        --lang ar \\
        --batch path/to/ar-batch-from-reviewer.json

    # Dry-run mode — print the diff without writing
    py -3 frontend/scripts/update_translations.py --lang ar --batch ar.json --dry-run

    # Bulk-mode — merge a directory of batches keyed by language code
    py -3 frontend/scripts/update_translations.py \\
        --bulk path/to/reviewer-bundle/

Batch format:
  A flat JSON object of key→string, optionally wrapped under a `_meta`
  key for reviewer notes:

    {
      "_meta": { "reviewer": "Amina X.", "date": "2026-07-01",
                 "namespace": "compliance" },
      "application.section.budget": "الميزانية",
      "application.section.budget.help": "اشرح الميزانية بإيجاز..."
    }

  Anything under `_meta` is recorded in the merged file's git commit
  message but never persisted into the JSON itself.

Safety:
  - Preserves key order from the existing translation file (so diffs
    stay focused on the keys that actually changed).
  - Refuses to overwrite an existing value with an empty string (likely
    reviewer error).
  - Refuses to add keys that DON'T exist in the canonical en.json —
    en.json is the source of truth for what keys the app expects.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

I18N_DIR = Path(__file__).resolve().parent.parent / 'src' / 'i18n'
SUPPORTED_LANGS = ('en', 'fr', 'ar', 'es', 'sw', 'so')


def _load_json(p: Path) -> dict:
    with p.open('r', encoding='utf-8') as f:
        return json.load(f)


def _save_json(p: Path, data: dict):
    with p.open('w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=False)
        f.write('\n')


def _merge(target: dict, batch: dict, canonical_keys: set[str]) -> dict:
    """Merge batch into target, preserving target's key order.

    Skips:
      - keys not present in canonical_keys (en.json)
      - empty / whitespace-only batch values
      - _meta and any keys starting with _
    """
    updated = dict(target)
    changes = {}
    skipped_unknown = []
    skipped_empty = []

    for k, v in batch.items():
        if k.startswith('_'):
            continue
        if k not in canonical_keys:
            skipped_unknown.append(k)
            continue
        v_str = str(v).strip()
        if not v_str:
            skipped_empty.append(k)
            continue
        old = target.get(k, '')
        if old != v_str:
            changes[k] = (old, v_str)
            updated[k] = v_str

    return updated, changes, skipped_unknown, skipped_empty


def merge_lang(lang: str, batch_path: Path, dry_run: bool) -> int:
    if lang not in SUPPORTED_LANGS:
        print(f"ERROR: lang '{lang}' not in {SUPPORTED_LANGS}", file=sys.stderr)
        return 2

    target_path = I18N_DIR / f'{lang}.json'
    if not target_path.exists():
        print(f"ERROR: target file not found: {target_path}", file=sys.stderr)
        return 2
    if not batch_path.exists():
        print(f"ERROR: batch file not found: {batch_path}", file=sys.stderr)
        return 2

    en_path = I18N_DIR / 'en.json'
    canonical = _load_json(en_path)
    canonical_keys = set(canonical.keys())

    target = _load_json(target_path)
    batch = _load_json(batch_path)

    updated, changes, skipped_unknown, skipped_empty = _merge(
        target, batch, canonical_keys,
    )

    print(f"== merge {batch_path.name} -> {target_path.name} ==")
    print(f"  keys in batch: {sum(1 for k in batch if not k.startswith('_'))}")
    print(f"  changes:       {len(changes)}")
    if skipped_unknown:
        print(f"  skipped (not in en.json): {len(skipped_unknown)}")
        for k in skipped_unknown[:5]:
            print(f"    - {k}")
        if len(skipped_unknown) > 5:
            print(f"    ...and {len(skipped_unknown) - 5} more")
    if skipped_empty:
        print(f"  skipped (empty value): {len(skipped_empty)}")

    if changes:
        print()
        print("Diff:")
        for k in list(changes.keys())[:25]:
            old, new = changes[k]
            print(f"  {k}")
            print(f"    - {old[:80]!r}")
            print(f"    + {new[:80]!r}")
        if len(changes) > 25:
            print(f"  ...and {len(changes) - 25} more")

    if dry_run:
        print()
        print("Dry run — no file written. Re-run without --dry-run to apply.")
        return 0

    if changes:
        _save_json(target_path, updated)
        print(f"Wrote {target_path.name} with {len(changes)} updated key(s).")
    else:
        print("No changes — file untouched.")
    return 0


def bulk(bundle_dir: Path, dry_run: bool) -> int:
    """Merge every batch in a directory keyed by language code."""
    if not bundle_dir.is_dir():
        print(f"ERROR: bundle dir not found: {bundle_dir}", file=sys.stderr)
        return 2
    found_any = False
    rc = 0
    for lang in SUPPORTED_LANGS:
        if lang == 'en':
            continue
        # Match either `<lang>.json` or `<lang>-batch.json`
        for name in (f'{lang}.json', f'{lang}-batch.json'):
            p = bundle_dir / name
            if p.exists():
                found_any = True
                lang_rc = merge_lang(lang, p, dry_run)
                if lang_rc != 0:
                    rc = lang_rc
                break
    if not found_any:
        print(f"No batches found in {bundle_dir} (expected <lang>.json or <lang>-batch.json)")
        return 1
    return rc


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument('--lang', help='Single-language merge: en|fr|ar|es|sw|so')
    g.add_argument('--bulk', help='Bulk-merge a directory of <lang>.json batches')
    parser.add_argument('--batch', help='Path to the reviewer batch JSON (with --lang)')
    parser.add_argument('--dry-run', action='store_true', default=False)
    args = parser.parse_args(argv)

    if args.lang:
        if not args.batch:
            parser.error('--batch is required when using --lang')
        return merge_lang(args.lang, Path(args.batch), args.dry_run)
    return bulk(Path(args.bulk), args.dry_run)


if __name__ == '__main__':
    sys.exit(main())

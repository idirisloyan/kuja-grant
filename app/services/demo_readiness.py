"""
Demo-readiness scanner — Phase 13.39 / 13.40.

Pure function used by both:
  - GET /api/admin/demo-readiness (admin on-demand view)
  - The daily notification scheduler (auto-warn on warn-level findings)

Single source of truth so the on-demand endpoint and the daily
notification can never drift apart in what they classify as a risk.
"""

from __future__ import annotations

import logging

from sqlalchemy import text

from app.extensions import db

logger = logging.getLogger('kuja')


def _scan_one(label, why, query, fix_hint, *, sample_limit=5):
    """Run one COUNT-with-sample-IDs query."""
    try:
        rows = db.session.execute(text(query)).fetchall()
        count = len(rows)
        sample_ids = [int(r[0]) for r in rows[:sample_limit]] if rows else []
        return {
            'key': label,
            'status': 'ok' if count == 0 else 'warn',
            'why': why,
            'count': count,
            'sample_ids': sample_ids,
            'fix': fix_hint if count else '',
        }
    except Exception as e:
        logger.warning(f'demo-readiness scan {label} failed: {e}')
        return {
            'key': label, 'status': 'unknown',
            'why': why, 'count': None, 'sample_ids': [],
            'fix': 'Could not query — check schema parity.',
        }


def scan_demo_readiness() -> dict:
    """Scan prod for AI surfaces likely to look broken because of sparse data.

    Categories (each emits one finding row):
      - grants_no_criteria        evidence/scoring degrades
      - grants_no_applications    donor dashboard reads as empty
      - apps_no_documents         AI document analysis no-ops
      - apps_no_responses         reviewer evidence panel empty
      - reports_no_submitted_at   compliance health miscomputes
      - orgs_no_profile           org memory + sanctions weaker
      - admins_no_2fa             security risk + nag-banner noise

    Returns: { overall, warn_count, findings: [...] }
    """
    findings: list[dict] = []

    findings.append(_scan_one(
        'grants_no_criteria',
        "Reviewer's evidence-extract surface dead-ends when criteria are empty.",
        "SELECT id FROM grants WHERE status IN ('open', 'review', 'closed') "
        "AND (criteria IS NULL OR criteria = '' OR criteria = '[]') "
        "ORDER BY created_at DESC LIMIT 50",
        "Edit each grant; add 4-7 evaluation criteria. Or use the new "
        "POST /api/ai/suggest-criteria endpoint for an AI draft.",
    ))
    findings.append(_scan_one(
        'grants_no_applications',
        "Open grants with zero applications make donor dashboards look empty.",
        "SELECT g.id FROM grants g LEFT JOIN applications a ON a.grant_id = g.id "
        "WHERE g.status = 'open' "
        "GROUP BY g.id HAVING COUNT(a.id) = 0 "
        "ORDER BY g.created_at DESC LIMIT 50",
        "Either close stale grants or seed sample applications for demos.",
    ))
    findings.append(_scan_one(
        'apps_no_documents',
        "Submitted applications with zero documents — AI doc analysis no-ops.",
        "SELECT a.id FROM applications a "
        "LEFT JOIN documents d ON d.application_id = a.id "
        "WHERE a.status IN ('submitted', 'under_review', 'scored') "
        "GROUP BY a.id HAVING COUNT(d.id) = 0 "
        "ORDER BY a.submitted_at DESC NULLS LAST LIMIT 50",
        "Ask applicants to attach supporting documents before review.",
    ))
    findings.append(_scan_one(
        'apps_no_responses',
        "Submitted applications with empty/short responses — evidence panel reads as broken.",
        "SELECT id FROM applications "
        "WHERE status IN ('submitted', 'under_review', 'scored') "
        "AND (responses IS NULL OR responses = '' OR responses = '{}' "
        "     OR LENGTH(COALESCE(responses, '')) < 200) "
        "ORDER BY submitted_at DESC NULLS LAST LIMIT 50",
        "Coach applicants to fill responses; add help text on the form.",
    ))
    findings.append(_scan_one(
        'reports_no_submitted_at',
        "Reports marked submitted/accepted with NULL submitted_at — compliance pillars miscompute.",
        "SELECT id FROM reports "
        "WHERE status IN ('submitted', 'accepted') AND submitted_at IS NULL "
        "ORDER BY id DESC LIMIT 50",
        "Backfill submitted_at from updated_at, or re-trigger the report submission flow.",
    ))
    findings.append(_scan_one(
        'orgs_no_profile',
        "Organizations with empty profile/about — org memory + sanctions checks weaker.",
        "SELECT id FROM organizations "
        "WHERE COALESCE(NULLIF(TRIM(COALESCE(description, '')), ''), '') = '' "
        "ORDER BY created_at DESC LIMIT 50",
        "Ask the org admins to fill out their profile during onboarding.",
    ))
    findings.append(_scan_one(
        'admins_no_2fa',
        "Admin accounts without TOTP enrolled — security risk + admin-2FA gate noise.",
        "SELECT id FROM users WHERE role = 'admin' AND COALESCE(totp_enabled, false) = false",
        "Direct each admin to /admin/security/ to enroll. Required "
        "before flipping KUJA_ENFORCE_ADMIN_2FA=true.",
    ))

    warn_count = sum(1 for f in findings if f['status'] == 'warn')
    overall = 'warn' if warn_count else 'ok'
    return {'overall': overall, 'warn_count': warn_count, 'findings': findings}

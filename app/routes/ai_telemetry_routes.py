"""
Phase 97 — AI telemetry rollup for admins.

Reads AICallLog and returns per-endpoint failure rates + latency +
token usage over a configurable window. So the team can see which AI
features actually fail in production and prioritise the next fallback
investment based on data, not anecdote.

Auth: admin only.
"""

import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import AICallLog

logger = logging.getLogger('kuja')

ai_telemetry_bp = Blueprint('ai_telemetry', __name__, url_prefix='/api/admin')

# Phase 98.10 — AI quality telemetry. User-facing producer endpoints that
# every AI-touched form submits to. Read side stays under the existing admin
# rollup; producer side lives on a separate blueprint at /api/ai-telemetry
# so the frontend ai-quality.ts module's hardcoded paths resolve.
ai_quality_bp = Blueprint('ai_quality', __name__, url_prefix='/api/ai-telemetry')


# Phase 611 — Stale-model filter. Historical DB rows from deprecated model IDs
# (e.g. claude-sonnet-4-20250514) inflate the rolled-up failure rate because
# Anthropic returns 404 for those IDs, but the live source code never calls
# them. Splitting the rollup into "current" vs "stale" lets ops see today's
# real SLA without rewriting history. Update this set whenever the source
# code's model list changes — single source of truth for the telemetry view.
CURRENT_MODELS = frozenset({
    'claude-opus-4-8',
    'claude-opus-4-7',
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5',
    'claude-fable-5',
})


def _is_stale_model(model_str):
    """Return True if `model_str` is a non-empty model ID NOT in CURRENT_MODELS.

    Null/empty model strings return False so rows lacking attribution don't
    get counted as stale. Calls that succeeded against a stale model are
    also reported (the model was retired but the call worked at the time);
    the meaningful number is *failures* against stale models — those are
    almost certainly 404s the deploy has already moved past.
    """
    if not model_str:
        return False
    return model_str not in CURRENT_MODELS


@ai_telemetry_bp.route('/ai-telemetry', methods=['GET'])
@login_required
def api_ai_telemetry():
    """Aggregate AI call telemetry over a configurable window.

    Query:
      hours = window size in hours (default 168 = 7 days)

    Returns: {
      window_hours, total_calls, total_failures, failure_rate_pct,
      by_endpoint: [{ endpoint, calls, failures, failure_rate_pct,
                      p50_ms, p95_ms, total_tokens_out }],
      recent_failures: [{ endpoint, error_code, error_message,
                          created_at }],
    }
    """
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        hours = int(request.args.get('hours', 168))
        hours = max(1, min(720, hours))  # clamp 1h..30d
    except ValueError:
        hours = 168

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = AICallLog.query.filter(AICallLog.created_at >= cutoff).all()

    total = len(rows)
    failures = sum(1 for r in rows if not r.success)
    stale_failures = sum(
        1 for r in rows if not r.success and _is_stale_model(r.model)
    )
    current_failures = failures - stale_failures
    by_ep = defaultdict(list)
    for r in rows:
        by_ep[r.endpoint or 'unknown'].append(r)

    def _pct(num, denom):
        return round(100 * num / denom, 1) if denom else 0.0

    def _percentile(values, pct):
        if not values:
            return None
        s = sorted(values)
        idx = min(len(s) - 1, int(len(s) * pct / 100))
        return s[idx]

    by_endpoint = []
    for ep, rs in by_ep.items():
        durs = [r.duration_ms for r in rs if r.duration_ms is not None]
        tok_out = sum(r.tokens_out or 0 for r in rs)
        ep_failures = sum(1 for r in rs if not r.success)
        ep_stale_failures = sum(
            1 for r in rs if not r.success and _is_stale_model(r.model)
        )
        ep_current_failures = ep_failures - ep_stale_failures
        # current_calls = total minus the rows attributed to a stale model.
        # Used to compute the live (non-historical) failure rate.
        ep_stale_calls = sum(1 for r in rs if _is_stale_model(r.model))
        ep_current_calls = len(rs) - ep_stale_calls
        by_endpoint.append({
            'endpoint': ep,
            'calls': len(rs),
            'failures': ep_failures,
            'failure_rate_pct': _pct(ep_failures, len(rs)),
            'current_calls': ep_current_calls,
            'current_failures': ep_current_failures,
            'current_failure_rate_pct': _pct(ep_current_failures, ep_current_calls),
            'stale_failures': ep_stale_failures,
            'p50_ms': _percentile(durs, 50),
            'p95_ms': _percentile(durs, 95),
            'total_tokens_out': tok_out,
        })
    # Sort by calls desc so the highest-traffic endpoints come first.
    by_endpoint.sort(key=lambda e: e['calls'], reverse=True)

    recent_failures = [
        {
            'endpoint': r.endpoint,
            'error_code': r.error_code,
            'error_message': (r.error_message or '')[:200],
            'duration_ms': r.duration_ms,
            'model': r.model,
            'is_stale_model': _is_stale_model(r.model),
            'created_at': r.created_at.isoformat() if r.created_at else None,
        }
        for r in sorted(
            (r for r in rows if not r.success),
            key=lambda r: r.created_at, reverse=True,
        )[:20]
    ]

    stale_calls = sum(1 for r in rows if _is_stale_model(r.model))
    current_calls = total - stale_calls

    return jsonify({
        'success': True,
        'window_hours': hours,
        'total_calls': total,
        'total_failures': failures,
        'failure_rate_pct': _pct(failures, total),
        # Phase 611 — live SLA strips rows attributed to deprecated model IDs
        # so today's user-facing reliability isn't muddied by historical 404s.
        'current_calls': current_calls,
        'current_failures': current_failures,
        'current_failure_rate_pct': _pct(current_failures, current_calls),
        'stale_failures': stale_failures,
        'current_models': sorted(CURRENT_MODELS),
        'by_endpoint': by_endpoint,
        'recent_failures': recent_failures,
    })


# ---------------------------------------------------------------------------
# Phase 98.10 — AI quality (edit-distance + false-confidence)
# ---------------------------------------------------------------------------
#
# These two endpoints accept producer events from `lib/ai-quality.ts` on the
# frontend. The endpoints are intentionally lightweight: validate the payload
# shape, log it, and reuse the existing AICallLog table (with endpoint tag
# "ai-quality/<surface>") so the existing /api/admin/ai-telemetry rollup
# surface picks the events up automatically. We intentionally do not block
# the user on telemetry failure — bad input returns 200 + ignored=true.

@ai_quality_bp.route('/quality', methods=['POST'])
@login_required
def api_ai_quality():
    """Record an AI-quality event produced by recordAiQuality() on the client.

    Payload (best-effort; all fields optional, ignored if malformed):
      surface (str), mode ('verbatim'|'blended'|'rejected'),
      editDistanceWords (int), proposedWords (int), finalWords (int),
      editRatio (float 0..1), language (str), latencyMs (int),
      capturedAtISO (ISO timestamp).

    Returns 200 always so the producer's keepalive POST never errors —
    invalid events are silently dropped with ignored=true.
    """
    from flask import request as flask_request
    try:
        body = flask_request.get_json(silent=True) or {}
    except Exception:
        body = {}

    surface = str(body.get('surface') or '').strip()[:80]
    mode = str(body.get('mode') or '').strip()
    edit_ratio = body.get('editRatio')
    if not surface or mode not in ('verbatim', 'blended', 'rejected'):
        return jsonify({'success': True, 'ignored': True, 'reason': 'malformed'})

    # Reuse AICallLog to avoid adding a separate table. The endpoint tag
    # encodes the producer surface so the existing rollup groups events.
    try:
        log = AICallLog(
            endpoint=f'ai-quality/{surface}',
            success=True,
            user_id=current_user.id if current_user.is_authenticated else None,
            duration_ms=int(body.get('latencyMs') or 0) or None,
            tokens_out=int(body.get('finalWords') or 0) or None,
            error_code=mode,
            error_message=(
                f"editRatio={edit_ratio} "
                f"editDistanceWords={body.get('editDistanceWords')} "
                f"language={body.get('language') or 'n/a'}"
            )[:500],
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        logger.warning('ai-quality log failed: %s', e)
        db.session.rollback()
        return jsonify({'success': True, 'ignored': True, 'reason': 'log_failed'})

    return jsonify({'success': True})


@ai_quality_bp.route('/false-confidence', methods=['POST'])
@login_required
def api_ai_false_confidence():
    """Record a false-confidence event: AI was accepted verbatim but later
    corrected by a recipient (donor / reviewer / OB / system).

    This is the metric guardrail introduced in the Phase 98 design review:
    without it, the team optimises AI acceptance and ships confidently-wrong
    output. Pairs with /quality above.
    """
    from flask import request as flask_request
    try:
        body = flask_request.get_json(silent=True) or {}
    except Exception:
        body = {}

    surface = str(body.get('surface') or '').strip()[:80]
    item_id = str(body.get('itemId') or '').strip()[:64]
    corrected_by = str(body.get('correctedBy') or '').strip()
    if not surface or corrected_by not in ('donor', 'reviewer', 'ob', 'system'):
        return jsonify({'success': True, 'ignored': True, 'reason': 'malformed'})

    try:
        log = AICallLog(
            endpoint=f'ai-quality/{surface}/false-confidence',
            success=False,
            user_id=current_user.id if current_user.is_authenticated else None,
            error_code=corrected_by,
            error_message=f'item={item_id} corrected_by={corrected_by}'[:500],
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        logger.warning('ai-false-confidence log failed: %s', e)
        db.session.rollback()
        return jsonify({'success': True, 'ignored': True, 'reason': 'log_failed'})

    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Phase 99 — AI quality rollup (admin) — companion to the producer endpoints
# above. Surfaces the per-surface edit-ratio, mode-distribution, and
# false-confidence rate the team needs to identify weak prompts before they
# burn user trust.
# ---------------------------------------------------------------------------

def _parse_quality_event(row):
    """Extract editRatio + language from the producer-side log shape.

    The producer (ai_quality_bp.api_ai_quality) stuffs editRatio + language
    into the error_message string ("editRatio=0.42 editDistanceWords=12
    language=en"). We pull them back out here so the rollup can compute
    medians + per-language cuts without a schema change.
    """
    import re
    msg = row.error_message or ''
    ratio = None
    m = re.search(r'editRatio=([-\d.]+)', msg)
    if m:
        try:
            v = float(m.group(1))
            if 0 <= v <= 1:
                ratio = v
        except ValueError:
            pass
    lang = 'unknown'
    m = re.search(r'language=(\w+)', msg)
    if m:
        lang = m.group(1)
    return ratio, lang


def _median(values):
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    if n % 2:
        return s[n // 2]
    return (s[n // 2 - 1] + s[n // 2]) / 2


@ai_telemetry_bp.route('/ai-quality-rollup', methods=['GET'])
@login_required
def api_ai_quality_rollup():
    """Per-surface AI quality rollup.

    Query:
      hours = window size (default 168 = 7 days; clamp 1..720)

    Returns: {
      success, window_hours,
      surfaces: [
        {
          surface,
          total_events,
          median_edit_ratio,
          mode_distribution: { verbatim, blended, rejected },
          false_confidence_count,
          false_confidence_rate_pct,   # % of accepted-verbatim later corrected
          by_language: [ { language, count, median_edit_ratio } ]
        }
      ],
      overall: {
        total_surfaces, total_events,
        median_edit_ratio_overall,
        false_confidence_rate_pct_overall,
      }
    }
    """
    from collections import defaultdict
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        hours = int(request.args.get('hours', 168))
        hours = max(1, min(720, hours))
    except ValueError:
        hours = 168

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (
        AICallLog.query
        .filter(AICallLog.created_at >= cutoff)
        .filter(AICallLog.endpoint.like('ai-quality/%'))
        .all()
    )

    # Group by surface (the token after ai-quality/ and before /false-confidence)
    by_surface = defaultdict(lambda: {
        'verbatim_events': [],
        'blended_events': [],
        'rejected_events': [],
        'false_confidence_events': [],
    })
    for r in rows:
        ep = r.endpoint or ''
        # Strip the "ai-quality/" prefix and any "/false-confidence" suffix
        # so we group both signals under one surface key.
        tail = ep[len('ai-quality/'):]
        is_fc = tail.endswith('/false-confidence')
        surface = tail[:-len('/false-confidence')] if is_fc else tail
        if not surface:
            continue
        bucket = by_surface[surface]
        if is_fc:
            bucket['false_confidence_events'].append(r)
        else:
            mode = (r.error_code or '').lower()
            if mode in ('verbatim', 'blended', 'rejected'):
                bucket[f'{mode}_events'].append(r)

    surfaces = []
    all_ratios = []
    total_verbatim = 0
    total_fc = 0
    for surface, b in sorted(by_surface.items()):
        verbatim = len(b['verbatim_events'])
        blended = len(b['blended_events'])
        rejected = len(b['rejected_events'])
        fc = len(b['false_confidence_events'])
        total_verbatim += verbatim
        total_fc += fc
        total_events = verbatim + blended + rejected

        # Edit ratios — pulled from the message blob.
        ratios = []
        by_lang_ratios = defaultdict(list)
        for evt in b['verbatim_events'] + b['blended_events'] + b['rejected_events']:
            ratio, lang = _parse_quality_event(evt)
            if ratio is not None:
                ratios.append(ratio)
                by_lang_ratios[lang].append(ratio)
        all_ratios.extend(ratios)

        by_language = []
        for lang, lang_ratios in by_lang_ratios.items():
            by_language.append({
                'language': lang,
                'count': len(lang_ratios),
                'median_edit_ratio': round(_median(lang_ratios), 3) if lang_ratios else None,
            })
        by_language.sort(key=lambda x: -x['count'])

        # FC rate: % of verbatim acceptances that were later corrected.
        fc_rate = round(100 * fc / verbatim, 1) if verbatim else 0.0
        med_ratio = round(_median(ratios), 3) if ratios else None

        surfaces.append({
            'surface': surface,
            'total_events': total_events,
            'median_edit_ratio': med_ratio,
            'mode_distribution': {
                'verbatim': verbatim,
                'blended': blended,
                'rejected': rejected,
            },
            'false_confidence_count': fc,
            'false_confidence_rate_pct': fc_rate,
            'by_language': by_language,
        })

    return jsonify({
        'success': True,
        'window_hours': hours,
        'surfaces': surfaces,
        'overall': {
            'total_surfaces': len(surfaces),
            'total_events': sum(s['total_events'] for s in surfaces),
            'median_edit_ratio_overall': round(_median(all_ratios), 3) if all_ratios else None,
            'false_confidence_rate_pct_overall':
                round(100 * total_fc / total_verbatim, 1) if total_verbatim else 0.0,
        },
    })


# ---------------------------------------------------------------------------
# Phase 99 — Per-tenant AI cost meter (admin)
# ---------------------------------------------------------------------------

@ai_telemetry_bp.route('/ai-cost-by-tenant', methods=['GET'])
@login_required
def api_ai_cost_by_tenant():
    """Per-tenant AI cost rollup over a configurable window.

    Joins AICallLog → User → Organization to attribute every call to a
    tenant. Anything with no user (cron jobs, anonymous probes) gets
    bucketed under '__platform__'.

    Query:
      days = window size in days (default 30; clamp 1..90)

    Returns: {
      success, window_days,
      pricing_note,
      total_usd,
      by_tenant: [{
        org_id, org_name, calls, tokens_in, tokens_out, usd,
        share_pct
      }]
    }
    """
    from collections import defaultdict
    from app.models.user import User
    from app.models.organization import Organization
    # Reuse the pricing dict from admin_health (single source of truth).
    from app.routes.admin_health import _PRICING

    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        days = int(request.args.get('days', 30))
        days = max(1, min(90, days))
    except ValueError:
        days = 30

    sonnet = _PRICING['claude-sonnet-4-6']
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Fetch the relevant logs + user → org map in batches.
    rows = (
        AICallLog.query
        .filter(AICallLog.created_at >= cutoff)
        .all()
    )
    user_ids = {r.user_id for r in rows if r.user_id is not None}
    user_org = {}
    if user_ids:
        for u in User.query.filter(User.id.in_(user_ids)).all():
            user_org[u.id] = u.org_id
    org_ids = {oid for oid in user_org.values() if oid is not None}
    org_names = {}
    if org_ids:
        for o in Organization.query.filter(Organization.id.in_(org_ids)).all():
            org_names[o.id] = o.name

    # Aggregate per tenant.
    bucket = defaultdict(lambda: {'calls': 0, 'tokens_in': 0, 'tokens_out': 0})
    for r in rows:
        org_id = user_org.get(r.user_id) if r.user_id is not None else None
        key = org_id if org_id is not None else '__platform__'
        bucket[key]['calls'] += 1
        bucket[key]['tokens_in'] += (r.tokens_in or 0)
        bucket[key]['tokens_out'] += (r.tokens_out or 0)

    total_usd = 0.0
    by_tenant = []
    for key, agg in bucket.items():
        usd = (
            (agg['tokens_in'] / 1_000_000) * sonnet['input']
            + (agg['tokens_out'] / 1_000_000) * sonnet['output']
        )
        total_usd += usd
        by_tenant.append({
            'org_id': key if key != '__platform__' else None,
            'org_name': (
                org_names.get(key) if isinstance(key, int) else 'Platform (no tenant)'
            ),
            'calls': agg['calls'],
            'tokens_in': agg['tokens_in'],
            'tokens_out': agg['tokens_out'],
            'usd': round(usd, 4),
        })
    by_tenant.sort(key=lambda x: -x['usd'])
    for t in by_tenant:
        t['share_pct'] = round(100 * t['usd'] / total_usd, 1) if total_usd else 0.0

    return jsonify({
        'success': True,
        'window_days': days,
        'pricing_note': (
            'Sonnet pricing: $3/M input, $15/M output. Update _PRICING in '
            'app/routes/admin_health.py when Anthropic prices change.'
        ),
        'total_usd': round(total_usd, 4),
        'by_tenant': by_tenant,
    })


@ai_telemetry_bp.route('/feature-usage', methods=['GET'])
@login_required
def api_feature_usage():
    """Phase 250 — Top-N event_name counts over a configurable window.

    Reads UserEvent rows in the window, groups by event_name + role,
    returns top 30 events by count. Admin-only.

    Query: ?days=N (1..90, default 30)
    """
    from collections import defaultdict
    from app.models.user_event import UserEvent

    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        days = int(request.args.get('days', 30))
        days = max(1, min(90, days))
    except ValueError:
        days = 30

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        UserEvent.query
        .filter(UserEvent.occurred_at >= cutoff)
        .all()
    )
    by_event = defaultdict(int)
    for r in rows:
        by_event[r.event_name] += 1
    out = sorted(
        [{'event_name': k, 'count': v} for k, v in by_event.items()],
        key=lambda x: -x['count'],
    )[:30]
    return jsonify({
        'success': True,
        'window_days': days,
        'total_events': len(rows),
        'top_events': out,
    })


@ai_telemetry_bp.route('/ai-cost-by-user', methods=['GET'])
@login_required
def api_ai_cost_by_user():
    """Phase 231 — top-N AI cost rollup per user.

    Same data source as ai-cost-by-tenant, attributed by user instead.
    Returns top 20 users by USD spent. Admin-only.

    Query: ?days=N (1..90, default 30) ?limit=N (1..50, default 20)
    """
    from collections import defaultdict
    from app.models.user import User
    from app.routes.admin_health import _PRICING

    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        days = int(request.args.get('days', 30))
        days = max(1, min(90, days))
    except ValueError:
        days = 30
    try:
        limit = int(request.args.get('limit', 20))
        limit = max(1, min(50, limit))
    except ValueError:
        limit = 20

    sonnet = _PRICING['claude-sonnet-4-6']
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    rows = (
        AICallLog.query
        .filter(AICallLog.created_at >= cutoff, AICallLog.user_id.isnot(None))
        .all()
    )

    bucket = defaultdict(lambda: {'calls': 0, 'tokens_in': 0, 'tokens_out': 0})
    for r in rows:
        bucket[r.user_id]['calls'] += 1
        bucket[r.user_id]['tokens_in'] += (r.tokens_in or 0)
        bucket[r.user_id]['tokens_out'] += (r.tokens_out or 0)

    user_ids = list(bucket.keys())
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    by_user = []
    for uid, agg in bucket.items():
        usd = (
            (agg['tokens_in'] / 1_000_000) * sonnet['input']
            + (agg['tokens_out'] / 1_000_000) * sonnet['output']
        )
        u = users.get(uid)
        by_user.append({
            'user_id': uid,
            'user_name': u.name if u else None,
            'user_email': u.email if u else None,
            'role': u.role if u else None,
            'calls': agg['calls'],
            'tokens_in': agg['tokens_in'],
            'tokens_out': agg['tokens_out'],
            'usd': round(usd, 4),
        })
    by_user.sort(key=lambda x: -x['usd'])

    return jsonify({
        'success': True,
        'window_days': days,
        'by_user': by_user[:limit],
    })

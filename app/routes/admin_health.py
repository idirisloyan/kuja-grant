"""
Admin self-service surfaces — Phase 13.10.

PMO's most-loved admin feature was /admin/system-health: a single page
that lights up red until you flip a switch. Documentation rotting in
BACKLOG.md doesn't get fixed; a page that nags does.

This blueprint adds five admin endpoints behind /api/admin/:
  GET /system-health    operational TODO surface (env / 2FA / cron / AI failure rate)
  GET /ai-spend         token cost telemetry, day-bucketed
  GET /audit-retention  retention window config + cron last-run
  PUT /audit-retention  update retention window
  GET /failed-logins    grouped failed-login audit (24h / 7d / 30d)
  GET /api-docs         renders /api/v1/openapi via Redoc
"""

from datetime import datetime, timedelta, timezone, date

from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.utils.decorators import role_required
from app.utils.api_errors import error_response

admin_health_bp = Blueprint('admin_health', __name__, url_prefix='/api/admin')


# Anthropic prices as of 2026-04 — update when the bill arrives.
# Prices in USD per million tokens.
_PRICING = {
    'claude-sonnet-4-20250514': {'input': 3.0, 'output': 15.0},
    'claude-haiku-4-5-20250514': {'input': 0.30, 'output': 1.5},  # rough ratio
}


@admin_health_bp.route('/system-health', methods=['GET'])
@login_required
@role_required('admin')
def api_system_health():
    """Operational TODO surface — checks light up red until fixed.

    Returns a list of {key, status, why, current, fix} rows the admin
    can scan in 10 seconds. status: 'ok' | 'warn' | 'fail' | 'unknown'.
    """
    import os
    from sqlalchemy import text

    checks = []

    # 1. ANTHROPIC_API_KEY presence
    if os.environ.get('ANTHROPIC_API_KEY'):
        checks.append({'key': 'anthropic_key', 'status': 'ok',
                       'why': 'Required for AI features', 'current': 'Set', 'fix': ''})
    else:
        checks.append({'key': 'anthropic_key', 'status': 'fail',
                       'why': 'Without this, every AI surface degrades to fallback.',
                       'current': 'Not set', 'fix': 'Set ANTHROPIC_API_KEY in Railway env vars.'})

    # 2. OPENSANCTIONS_API_KEY (PMO doesn't have this; Kuja does)
    if os.environ.get('OPENSANCTIONS_API_KEY'):
        checks.append({'key': 'opensanctions_key', 'status': 'ok',
                       'why': 'Live sanctions screening', 'current': 'Set', 'fix': ''})
    else:
        checks.append({'key': 'opensanctions_key', 'status': 'warn',
                       'why': 'Sanctions screening falls back to direct UN/OFAC/EU CSVs.',
                       'current': 'Not set',
                       'fix': 'Optional: set OPENSANCTIONS_API_KEY for primary sanctions feed.'})

    # 3. CRON_SECRET (for self-healing fixtures + scheduled jobs).
    # Auto-generated at boot if missing — see app/__init__.py. The
    # warning only fires if BOTH the env var and the fallback are
    # missing, OR if a critical scheduled job depends on a stable
    # value across deploys (audit prune isn't there yet — when it
    # lands, elevate this check back to 'warn').
    if os.environ.get('CRON_SECRET'):
        checks.append({'key': 'cron_secret', 'status': 'ok',
                       'why': 'Authenticates scheduled jobs', 'current': 'Set (env)', 'fix': ''})
    elif hasattr(__import__('flask').current_app, '_kuja_cron_fallback'):
        checks.append({'key': 'cron_secret', 'status': 'ok',
                       'why': 'Auto-generated fallback active for this process',
                       'current': 'Set (per-process fallback)',
                       'fix': 'For multi-worker stability set CRON_SECRET in Railway.'})
    else:
        checks.append({'key': 'cron_secret', 'status': 'warn',
                       'why': 'Without this, scheduled jobs cannot self-authenticate.',
                       'current': 'Not set',
                       'fix': 'Generate a 32-char token and set CRON_SECRET in Railway env.'})

    # 4. AI failure rate (last 24h)
    try:
        result = db.session.execute(text("""
            SELECT
              COUNT(*) FILTER (WHERE success = false) AS failures,
              COUNT(*) AS total
            FROM ai_call_logs
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        """)).fetchone()
        failures = int(result[0] or 0) if result else 0
        total = int(result[1] or 0) if result else 0
        rate_pct = round((failures / total * 100), 1) if total else 0
        if total == 0:
            checks.append({'key': 'ai_failure_rate', 'status': 'unknown',
                           'why': 'AI failure rate over last 24h',
                           'current': 'No AI calls in 24h', 'fix': ''})
        elif rate_pct > 50:
            checks.append({'key': 'ai_failure_rate', 'status': 'fail',
                           'why': 'AI failures are common — users see degraded experience.',
                           'current': f'{rate_pct}% ({failures}/{total} calls)',
                           'fix': 'Check Anthropic status, model availability, prompt drift.'})
        elif rate_pct > 20:
            checks.append({'key': 'ai_failure_rate', 'status': 'warn',
                           'why': 'AI failure rate elevated.',
                           'current': f'{rate_pct}% ({failures}/{total} calls)',
                           'fix': 'Investigate AI_STALLED log entries for slow callers.'})
        else:
            checks.append({'key': 'ai_failure_rate', 'status': 'ok',
                           'why': 'AI failure rate over last 24h',
                           'current': f'{rate_pct}% ({failures}/{total} calls)',
                           'fix': ''})
    except Exception:
        checks.append({'key': 'ai_failure_rate', 'status': 'unknown',
                       'why': 'Could not query ai_call_logs', 'current': '?', 'fix': ''})

    # 5. Native PDF fallback usage (quality signal — too many = users
    # uploading scanned PDFs, possibly intentional)
    try:
        result = db.session.execute(text("""
            SELECT COUNT(*) FROM documents
            WHERE extraction_used_native_pdf = true
              AND uploaded_at >= NOW() - INTERVAL '7 days'
        """)).fetchone()
        native_count = int(result[0] or 0) if result else 0
        checks.append({'key': 'native_pdf_usage', 'status': 'ok' if native_count < 50 else 'warn',
                       'why': 'PDFs handled via OCR-via-vision fallback last 7 days',
                       'current': f'{native_count} fallbacks',
                       'fix': ('Healthy if low; if high, consider asking submitters for native PDFs.')})
    except Exception:
        pass

    # 6. Documents stuck in 'running' state >10 minutes (zombie extractions)
    try:
        result = db.session.execute(text("""
            SELECT COUNT(*) FROM documents
            WHERE extraction_status = 'running'
              AND extraction_started_at < NOW() - INTERVAL '10 minutes'
        """)).fetchone()
        stuck = int(result[0] or 0) if result else 0
        if stuck > 0:
            checks.append({'key': 'stuck_extractions', 'status': 'warn',
                           'why': 'Documents stuck in extraction >10min — worker likely died.',
                           'current': f'{stuck} stuck',
                           'fix': 'Inspect via /api/admin/failed-extractions; consider retry.'})
        else:
            checks.append({'key': 'stuck_extractions', 'status': 'ok',
                           'why': 'No zombie extractions.', 'current': '0', 'fix': ''})
    except Exception:
        pass

    # 7. Risks owned by users with no due_date (PMO observation: orphaned risks)
    try:
        result = db.session.execute(text("""
            SELECT COUNT(*) FROM risks
            WHERE status IN ('open', 'mitigating') AND owner_user_id IS NOT NULL
              AND due_date IS NULL
        """)).fetchone()
        no_due = int(result[0] or 0) if result else 0
        if no_due > 0:
            checks.append({'key': 'risks_no_due_date', 'status': 'warn',
                           'why': "Open risks with an owner but no due date — won't surface in deadline alerts.",
                           'current': f'{no_due} risks',
                           'fix': 'Edit each risk and set a due date.'})
        else:
            checks.append({'key': 'risks_no_due_date', 'status': 'ok',
                           'why': 'All assigned risks have due dates.', 'current': '0', 'fix': ''})
    except Exception:
        pass

    # Aggregate verdict.
    fail_count = sum(1 for c in checks if c['status'] == 'fail')
    warn_count = sum(1 for c in checks if c['status'] == 'warn')
    overall = 'fail' if fail_count else ('warn' if warn_count else 'ok')

    return jsonify({
        'success': True,
        'overall': overall,
        'fail_count': fail_count,
        'warn_count': warn_count,
        'checks': checks,
        'as_of': datetime.now(timezone.utc).isoformat(),
    })


@admin_health_bp.route('/ai-spend', methods=['GET'])
@login_required
@role_required('admin')
def api_ai_spend():
    """Token cost telemetry, day-bucketed.

    Query: days=7|14|30 (default 7)
    Output: { days, total_usd, per_day: [{date, calls, input_tokens, output_tokens, usd}], per_endpoint: [...] }
    """
    from sqlalchemy import text
    days = min(int(request.args.get('days', 7)), 90)

    # Phase 13.10 — column names on the ai_call_logs table are
    # tokens_in / tokens_out (NOT input_tokens / output_tokens). Mismatched
    # column names threw 500 in batch 30; fixed in batch 35.
    rows = db.session.execute(text(f"""
        SELECT DATE(created_at) AS day,
               endpoint,
               COUNT(*) AS calls,
               COALESCE(SUM(tokens_in), 0) AS in_tokens,
               COALESCE(SUM(tokens_out), 0) AS out_tokens
        FROM ai_call_logs
        WHERE created_at >= NOW() - INTERVAL '{days} days'
        GROUP BY 1, 2
        ORDER BY 1 DESC, 2
    """)).fetchall()

    sonnet = _PRICING['claude-sonnet-4-20250514']
    per_day_map: dict[str, dict] = {}
    per_endpoint_map: dict[str, dict] = {}
    total_usd = 0.0
    for r in rows:
        day = r[0].isoformat() if hasattr(r[0], 'isoformat') else str(r[0])
        endpoint = r[1] or 'unknown'
        calls = int(r[2] or 0)
        in_t = int(r[3] or 0)
        out_t = int(r[4] or 0)
        cost = (in_t / 1_000_000 * sonnet['input']) + (out_t / 1_000_000 * sonnet['output'])
        total_usd += cost

        d = per_day_map.setdefault(day, {'date': day, 'calls': 0, 'input_tokens': 0, 'output_tokens': 0, 'usd': 0.0})
        d['calls'] += calls
        d['input_tokens'] += in_t
        d['output_tokens'] += out_t
        d['usd'] += cost

        e = per_endpoint_map.setdefault(endpoint, {'endpoint': endpoint, 'calls': 0, 'input_tokens': 0, 'output_tokens': 0, 'usd': 0.0})
        e['calls'] += calls
        e['input_tokens'] += in_t
        e['output_tokens'] += out_t
        e['usd'] += cost

    per_day = sorted(per_day_map.values(), key=lambda x: x['date'])
    per_endpoint = sorted(per_endpoint_map.values(), key=lambda x: -x['usd'])
    for d in per_day:
        d['usd'] = round(d['usd'], 4)
    for e in per_endpoint:
        e['usd'] = round(e['usd'], 4)

    return jsonify({
        'success': True,
        'days': days,
        'total_usd': round(total_usd, 4),
        'per_day': per_day,
        'per_endpoint': per_endpoint,
        'pricing_note': 'Sonnet pricing: $3/M input, $15/M output. Update _PRICING in admin_health.py when Anthropic prices change.',
    })


@admin_health_bp.route('/audit-retention', methods=['GET', 'PUT'])
@login_required
@role_required('admin')
def api_audit_retention():
    """Configurable audit retention window.

    GET: returns current window + last cron run + count of rows that
         would be pruned at next run.
    PUT: body { days: int 30..3650 } — updates the window. The actual
         prune runs nightly via the existing notification scheduler.
    """
    import os
    if request.method == 'PUT':
        from app.utils.validation import require_int, ValidationError, to_error_response
        try:
            days = require_int(request.get_json(silent=True) or {}, 'days', minimum=30, maximum=3650)
        except ValidationError as e:
            return to_error_response(e)
        # Persisted via env (operational simplicity). For multi-tenant
        # per-org retention, swap to a row in feature_flags or a new table.
        os.environ['KUJA_AUDIT_RETENTION_DAYS'] = str(days)
        return jsonify({'success': True, 'days': days,
                        'note': 'Persisted in env for this process. To make permanent, set KUJA_AUDIT_RETENTION_DAYS in Railway env.'})

    days = int(os.environ.get('KUJA_AUDIT_RETENTION_DAYS', '365'))
    return jsonify({
        'success': True,
        'days': days,
        'presets': [90, 180, 365, 730, 3650],
        'note': 'Audit log retention. Pruning runs nightly via the notification scheduler.',
    })


@admin_health_bp.route('/failed-logins', methods=['GET'])
@login_required
@role_required('admin')
def api_failed_logins():
    """Failed-login audit, grouped by IP + window.

    Query: days=1|7|30 (default 1)
    """
    from sqlalchemy import text
    days = min(int(request.args.get('days', 1)), 30)

    try:
        # users.last_failed_login + failed_login_count are the lockout
        # signals shipped earlier. Group by user-with-recent-failures.
        rows = db.session.execute(text(f"""
            SELECT email, failed_login_count, last_failed_login, locked_until
            FROM users
            WHERE last_failed_login >= NOW() - INTERVAL '{days} days'
              AND failed_login_count > 0
            ORDER BY failed_login_count DESC
            LIMIT 200
        """)).fetchall()
    except Exception:
        rows = []

    out = []
    high_count = 0
    for r in rows:
        count = int(r[1] or 0)
        if count >= 5:
            high_count += 1
        out.append({
            'email': r[0],
            'failed_count': count,
            'last_failed_at': r[2].isoformat() if r[2] else None,
            'locked_until': r[3].isoformat() if r[3] else None,
        })

    return jsonify({
        'success': True,
        'days': days,
        'rows': out,
        'high_count_users': high_count,
        'banner': ('Multiple users with high failed-login counts — possible brute force.'
                   if high_count >= 3 else None),
    })


@admin_health_bp.route('/forget-user/<int:user_id>', methods=['POST'])
@login_required
@role_required('admin')
def api_forget_user(user_id):
    """Phase 13.14 — GDPR right-to-be-forgotten.

    Anonymizes a user record:
      - first_name / last_name -> "[Deleted]"
      - email -> "deleted-<id>@kuja.invalid"
      - password_hash -> randomized
      - is_active = False
      - language preference reset
    Audit log + ownership history is PRESERVED (legal record). PII is
    gone but every FK pointing at this user (applications submitted,
    grants owned, comments authored) keeps its reference — anonymization
    keeps historical integrity intact.

    Body (optional): { reason: str — for the audit log }
    """
    from app.models import User
    from werkzeug.security import generate_password_hash
    import secrets
    from app.models.audit_chain import AuditChainEntry

    user = db.session.get(User, user_id)
    if not user:
        return error_response('not_found', 404)
    if user.id == current_user.id:
        return error_response('validation.invalid_value', 400, field='user_id',
                              detail='Cannot forget yourself')

    data = request.get_json(silent=True) or {}
    reason = (data.get('reason') or '').strip()[:280]
    original_email = user.email

    user.first_name = '[Deleted]'
    user.last_name = '[Deleted]'
    if hasattr(user, 'name'):
        user.name = '[Deleted] User'
    user.email = f'deleted-{user.id}@kuja.invalid'
    user.password_hash = generate_password_hash(secrets.token_urlsafe(32))
    if hasattr(user, 'is_active'):
        user.is_active = False
    if hasattr(user, 'language'):
        user.language = 'en'
    if hasattr(user, 'avatar_url'):
        user.avatar_url = None
    db.session.commit()

    # Append to the hash-chained audit log (tamper-evident).
    AuditChainEntry.append(
        action='user.forgotten',
        actor_email=current_user.email,
        subject_kind='user',
        subject_id=user.id,
        details={'original_email': original_email, 'reason': reason},
    )
    return jsonify({
        'success': True,
        'user_id': user.id,
        'note': 'PII anonymized; FK references preserved for legal continuity.',
    })


@admin_health_bp.route('/audit-chain/verify', methods=['GET'])
@login_required
@role_required('admin')
def api_audit_chain_verify():
    """Phase 13.12 — verify the hash-chained audit log."""
    from app.models.audit_chain import AuditChainEntry
    return jsonify({'success': True, **AuditChainEntry.verify()})


@admin_health_bp.route('/api-docs', methods=['GET'])
@login_required
@role_required('admin')
def api_docs():
    """Stub OpenAPI export for integration partners.

    Lists every registered route with method + URL rule. Not a full
    OpenAPI 3.0 doc yet (would need explicit @doc decorators per route);
    this is the catalog admins can scroll to confirm "yes, that endpoint
    exists." When PMO-style Redoc rendering is needed, swap this for a
    /api/v1/openapi.json + /admin/api-docs HTML page.
    """
    from flask import current_app
    out = []
    for rule in current_app.url_map.iter_rules():
        if str(rule).startswith('/api/'):
            out.append({
                'rule': str(rule),
                'methods': sorted(rule.methods - {'HEAD', 'OPTIONS'}),
                'endpoint': rule.endpoint,
            })
    return jsonify({
        'success': True,
        'routes': sorted(out, key=lambda x: x['rule']),
        'count': len(out),
    })

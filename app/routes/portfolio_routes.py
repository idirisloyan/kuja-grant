"""
Donor portfolio routes — Phase 13 (May 2026).

Blueprint prefix: /api

Routes:
  GET  /api/portfolio/bundle                - assemble portfolio bundle JSON
  GET  /api/portfolio/bundle.pdf            - download portfolio bundle PDF
  GET  /api/portfolio/audit-timeline        - audit chain entries scoped to donor's grants

These are donor-facing aggregations that consolidate every grantee's
report bundles + the audit chain across the donor's portfolio. Used to
produce board-ready review packs in one click.
"""

import io
import logging
import re

from flask import Blueprint, jsonify, request, send_file
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Grant, Report
from app.services.portfolio_bundle_service import (
    PortfolioBundleService, build_portfolio_pdf,
)
from app.services.ngo_portfolio_service import (
    NGOPortfolioService, build_ngo_portfolio_pdf,
)
from app.utils.cache import _dashboard_cache
from app.utils.decorators import role_required

logger = logging.getLogger('kuja')

portfolio_bp = Blueprint('portfolio', __name__, url_prefix='/api/portfolio')


def _resolve_donor_org_id():
    """Donor uses their own org; admin can pass ?donor_org_id=N."""
    if current_user.role == 'admin':
        raw = request.args.get('donor_org_id')
        if raw:
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None
        return current_user.org_id
    return current_user.org_id


@portfolio_bp.route('/bundle', methods=['GET'])
@login_required
@role_required('donor', 'admin')
def api_portfolio_bundle():
    """Assemble portfolio bundle JSON. Cached 60s per (donor, lookback)."""
    donor_org_id = _resolve_donor_org_id()
    if not donor_org_id:
        return jsonify({'success': False, 'error': 'Donor org required'}), 400

    try:
        lookback = max(7, min(365, int(request.args.get('days', 90))))
    except (TypeError, ValueError):
        lookback = 90

    cache_key = f'portfolio_bundle_{donor_org_id}_{lookback}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, 'portfolio': cached})

    portfolio = PortfolioBundleService.assemble(
        donor_org_id=donor_org_id, lookback_days=lookback,
    )
    if not portfolio:
        return jsonify({'success': False, 'error': 'Could not assemble portfolio'}), 500

    _dashboard_cache.set(cache_key, portfolio)
    return jsonify({'success': True, 'portfolio': portfolio})


@portfolio_bp.route('/bundle.pdf', methods=['GET'])
@login_required
@role_required('donor', 'admin')
def api_portfolio_bundle_pdf():
    """Render the portfolio as a single PDF. Writes an audit-chain
    receipt (portfolio.download_pdf) so the donor's downloads are
    tamper-evident."""
    donor_org_id = _resolve_donor_org_id()
    if not donor_org_id:
        return jsonify({'success': False, 'error': 'Donor org required'}), 400

    try:
        lookback = max(7, min(365, int(request.args.get('days', 90))))
    except (TypeError, ValueError):
        lookback = 90

    cache_key = f'portfolio_bundle_{donor_org_id}_{lookback}'
    portfolio = _dashboard_cache.get(cache_key)
    if portfolio is None:
        portfolio = PortfolioBundleService.assemble(
            donor_org_id=donor_org_id, lookback_days=lookback,
        )
        if portfolio:
            _dashboard_cache.set(cache_key, portfolio)
    if not portfolio:
        return jsonify({'success': False, 'error': 'Could not assemble portfolio'}), 500

    try:
        pdf_bytes = build_portfolio_pdf(portfolio)
    except Exception as e:
        logger.exception(f'Portfolio PDF render failed: {e}')
        return jsonify({'success': False, 'error': 'PDF render failed'}), 500

    donor_name = portfolio.get('donor_org_name') or 'donor'
    slug = re.sub(r'[^a-z0-9]+', '-', donor_name.lower()).strip('-')[:60] or 'donor'
    period_safe = re.sub(r'[^a-z0-9]+', '-', (portfolio.get('period_label') or '').lower()).strip('-')[:30]
    filename = f'kuja-portfolio-{slug}-{period_safe or "current"}.pdf'

    # Audit-chain receipt — donor/admin downloads are recorded so the
    # NGO + admins can see who downloaded what portfolio review when.
    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action='portfolio.download_pdf',
            actor_email=getattr(current_user, 'email', None),
            subject_kind='org',
            subject_id=donor_org_id,
            details={
                'donor_org_name': donor_name,
                'lookback_days': lookback,
                'report_count': portfolio.get('report_count'),
                'grantee_count': portfolio.get('grantee_count'),
                'pdf_bytes': len(pdf_bytes),
                'filename': filename,
            },
        )
    except Exception as e:
        logger.warning(f'Portfolio PDF audit receipt failed: {e}')

    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename,
    )


@portfolio_bp.route('/audit-timeline', methods=['GET'])
@login_required
@role_required('donor', 'admin')
def api_portfolio_audit_timeline():
    """Audit-chain entries scoped to this donor's grants + their reports.

    Returns the most recent N entries (default 50) so the donor sees the
    full review loop on one dashboard: publish → verify → download.

    Scoping:
      - subject_kind='org' AND subject_id=donor_org_id (portfolio events)
      - subject_kind='report' AND subject_id in (their grants' reports)
      - subject_kind='grant' AND subject_id in (their grants)
      - subject_kind='application' AND subject_id in (their grants' apps)
    """
    from app.models import AuditChainEntry, Application

    donor_org_id = _resolve_donor_org_id()
    if not donor_org_id:
        return jsonify({'success': False, 'error': 'Donor org required'}), 400

    try:
        limit = max(10, min(200, int(request.args.get('limit', 50))))
    except (TypeError, ValueError):
        limit = 50

    cache_key = f'portfolio_audit_timeline_{donor_org_id}_{limit}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, 'entries': cached})

    grant_ids = [
        g.id for g in Grant.query.filter(Grant.donor_org_id == donor_org_id)
        .with_entities(Grant.id).all()
    ]
    report_ids = []
    application_ids = []
    if grant_ids:
        report_ids = [
            r.id for r in Report.query.filter(Report.grant_id.in_(grant_ids))
            .with_entities(Report.id).all()
        ]
        application_ids = [
            a.id for a in Application.query.filter(Application.grant_id.in_(grant_ids))
            .with_entities(Application.id).all()
        ]

    from sqlalchemy import and_, or_

    conditions = [
        and_(AuditChainEntry.subject_kind == 'org',
             AuditChainEntry.subject_id == donor_org_id),
    ]
    if grant_ids:
        conditions.append(and_(
            AuditChainEntry.subject_kind == 'grant',
            AuditChainEntry.subject_id.in_(grant_ids),
        ))
    if report_ids:
        conditions.append(and_(
            AuditChainEntry.subject_kind == 'report',
            AuditChainEntry.subject_id.in_(report_ids),
        ))
    if application_ids:
        conditions.append(and_(
            AuditChainEntry.subject_kind == 'application',
            AuditChainEntry.subject_id.in_(application_ids),
        ))

    rows = (
        AuditChainEntry.query
        .filter(or_(*conditions))
        .order_by(AuditChainEntry.id.desc())
        .limit(limit)
        .all()
    )

    import json as _json
    entries = []
    for e in rows:
        try:
            details = _json.loads(e.details_json) if e.details_json else {}
        except Exception:
            details = {}
        entries.append({
            'id': e.id,
            'seq': e.seq,
            'created_at': e.created_at.isoformat() if e.created_at else None,
            'action': e.action,
            'actor_email': e.actor_email,
            'subject_kind': e.subject_kind,
            'subject_id': e.subject_id,
            'details': details,
            'payload_hash': (e.payload_hash or '')[:16],
        })

    _dashboard_cache.set(cache_key, entries)
    return jsonify({'success': True, 'entries': entries})


# ----------------------------------------------------------------------
# Phase 14 — NGO-side portfolio bundle (analog of donor's). One PDF
# covering everything the NGO delivered this period across all donors.
# ----------------------------------------------------------------------

def _resolve_ngo_org_id():
    if current_user.role == 'admin':
        raw = request.args.get('ngo_org_id')
        if raw:
            try:
                return int(raw)
            except (TypeError, ValueError):
                return None
        return current_user.org_id
    return current_user.org_id


@portfolio_bp.route('/ngo/bundle', methods=['GET'])
@login_required
@role_required('ngo', 'admin')
def api_ngo_portfolio_bundle():
    ngo_org_id = _resolve_ngo_org_id()
    if not ngo_org_id:
        return jsonify({'success': False, 'error': 'NGO org required'}), 400

    try:
        lookback = max(7, min(365, int(request.args.get('days', 90))))
    except (TypeError, ValueError):
        lookback = 90

    cache_key = f'ngo_portfolio_bundle_{ngo_org_id}_{lookback}'
    cached = _dashboard_cache.get(cache_key)
    if cached is not None:
        return jsonify({'success': True, 'cached': True, 'portfolio': cached})

    portfolio = NGOPortfolioService.assemble(
        ngo_org_id=ngo_org_id, lookback_days=lookback,
    )
    if not portfolio:
        return jsonify({'success': False, 'error': 'Could not assemble portfolio'}), 500

    _dashboard_cache.set(cache_key, portfolio)
    return jsonify({'success': True, 'portfolio': portfolio})


@portfolio_bp.route('/ngo/bundle.pdf', methods=['GET'])
@login_required
@role_required('ngo', 'admin')
def api_ngo_portfolio_bundle_pdf():
    """NGO delivery-report PDF. Audit-chain receipt fires so the donor
    side has visibility that the NGO produced a board pack for the
    period (transparency goes both directions)."""
    ngo_org_id = _resolve_ngo_org_id()
    if not ngo_org_id:
        return jsonify({'success': False, 'error': 'NGO org required'}), 400

    try:
        lookback = max(7, min(365, int(request.args.get('days', 90))))
    except (TypeError, ValueError):
        lookback = 90

    cache_key = f'ngo_portfolio_bundle_{ngo_org_id}_{lookback}'
    portfolio = _dashboard_cache.get(cache_key)
    if portfolio is None:
        portfolio = NGOPortfolioService.assemble(
            ngo_org_id=ngo_org_id, lookback_days=lookback,
        )
        if portfolio:
            _dashboard_cache.set(cache_key, portfolio)
    if not portfolio:
        return jsonify({'success': False, 'error': 'Could not assemble portfolio'}), 500

    try:
        pdf_bytes = build_ngo_portfolio_pdf(portfolio)
    except Exception as e:
        logger.exception(f'NGO portfolio PDF render failed: {e}')
        return jsonify({'success': False, 'error': 'PDF render failed'}), 500

    ngo_name = portfolio.get('ngo_org_name') or 'ngo'
    slug = re.sub(r'[^a-z0-9]+', '-', ngo_name.lower()).strip('-')[:60] or 'ngo'
    period_safe = re.sub(r'[^a-z0-9]+', '-', (portfolio.get('period_label') or '').lower()).strip('-')[:30]
    filename = f'kuja-ngo-portfolio-{slug}-{period_safe or "current"}.pdf'

    try:
        from app.models import AuditChainEntry
        AuditChainEntry.append(
            action='ngo_portfolio.download_pdf',
            actor_email=getattr(current_user, 'email', None),
            subject_kind='org',
            subject_id=ngo_org_id,
            details={
                'ngo_org_name': ngo_name,
                'lookback_days': lookback,
                'report_count': portfolio.get('report_count'),
                'donor_count': portfolio.get('donor_count'),
                'pdf_bytes': len(pdf_bytes),
                'filename': filename,
            },
        )
    except Exception as e:
        logger.warning(f'NGO portfolio PDF audit receipt failed: {e}')

    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype='application/pdf',
        as_attachment=True,
        download_name=filename,
    )

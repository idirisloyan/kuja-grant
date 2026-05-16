"""
Scheduled-task entry points — Phase 15D.

Blueprint prefix: /api/cron

All endpoints accept EITHER:
  - Authorization: Bearer $CRON_SECRET   (production scheduler)
  - An authenticated admin session       (manual run for debugging)

Routes here are idempotent and safe to call repeatedly. They surface
their work via the response payload so monitoring can alert on drift.
"""

import logging
import os

from flask import Blueprint, jsonify, request
from flask_login import current_user

logger = logging.getLogger('kuja')

cron_bp = Blueprint('cron', __name__, url_prefix='/api/cron')


def _is_authorized() -> bool:
    """CRON_SECRET via Bearer header OR an admin session."""
    auth_header = request.headers.get('Authorization', '')
    secret = os.getenv('CRON_SECRET') or ''
    if secret and auth_header == f'Bearer {secret}':
        return True
    if current_user.is_authenticated and getattr(current_user, 'role', None) == 'admin':
        return True
    return False


@cron_bp.route('/compliance-rerun', methods=['POST'])
def api_cron_compliance_rerun():
    """Phase 22C — re-screen NGOs whose adverse-media screening is stale.

    Caps MAX_PER_RUN per tick. Structured drift report so monitoring can
    alert if backlog grows (skipped_capacity > 0 for multiple days in a row).
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403
    try:
        from app.services.compliance_rerun_service import ComplianceRerunService
        result = ComplianceRerunService.run()
        logger.info(f'compliance rerun cron: {result}')
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'compliance rerun cron failed: {e}')
        return jsonify({'success': False, 'error': str(e)[:200]}), 500


@cron_bp.route('/uat-fixtures', methods=['POST'])
def api_cron_uat_fixtures():
    """Daily-runnable: ensure demo/UAT state stays meaningful.

    Specifically ensures:
      - each donor has at least 1 open grant (flips draft → open if needed)
      - each donor has at least 1 awarded + 1 rejected app with a debrief
      - at least one report bundle is published (so audit chain has content)

    Returns a structured summary so the cron caller can log + alert on
    drift (e.g. 'no_candidate' counts >0 means demo data is too thin).
    """
    if not _is_authorized():
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    try:
        from app.services.uat_fixture_service import UATFixtureService
        result = UATFixtureService.run()
        logger.info(f'UAT fixture cron: {result}')
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        logger.exception(f'UAT fixture cron failed: {e}')
        return jsonify({'success': False, 'error': str(e)[:200]}), 500

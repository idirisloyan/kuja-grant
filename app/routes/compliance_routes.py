"""
Kuja Grant Management System - Compliance & Verification Routes
================================================================
Extracted from server.py sections 17 and 17b (lines ~4094-4405).
Handles sanctions screening and government registry verification.

Blueprint prefix: /api
Routes served:
  /api/compliance/<org_id>       GET   - get compliance checks
  /api/compliance/screen         POST  - run sanctions screening
  /api/verification/registries   GET   - list supported registries
  /api/verification/<org_id>     GET   - get org verification status
  /api/verification/all          GET   - all org verifications (donor/admin)
  /api/verification/verify       POST  - run AI verification
  /api/verification/<id>/update  PUT   - manual verification update
"""

import os
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Organization, ComplianceCheck, RegistrationVerification, Document, Grant
from app.services.compliance_service import ComplianceService
from app.services.registry_service import RegistryService
from app.services.ai_service import AIService
from app.utils.helpers import get_request_json

logger = logging.getLogger('kuja')

compliance_bp = Blueprint('compliance', __name__, url_prefix='/api')


# =============================================================================
# COMPLIANCE SCREENING
# =============================================================================

@compliance_bp.route('/compliance/<int:org_id>', methods=['GET'])
@login_required
def api_get_compliance(org_id):
    """Get all compliance checks for an organization."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    checks = ComplianceCheck.query.filter_by(org_id=org_id) \
        .order_by(ComplianceCheck.checked_at.desc()).all()

    # Determine overall compliance status
    statuses = [c.status for c in checks]
    if 'flagged' in statuses:
        overall_status = 'flagged'
    elif 'error' in statuses:
        overall_status = 'error'
    elif 'pending' in statuses:
        overall_status = 'pending'
    elif checks:
        overall_status = 'clear'
    else:
        overall_status = 'not_screened'

    return jsonify({
        'org_id': org_id,
        'org_name': org.name,
        'overall_status': overall_status,
        'checks': [c.to_dict() for c in checks],
        'last_checked': checks[0].checked_at.isoformat() if checks else None,
    })


@compliance_bp.route('/compliance/screen', methods=['POST'])
@login_required
def api_compliance_screen():
    """Run compliance screening on an organization."""
    # Only donors, admins, and reviewers can run compliance screening
    if current_user.role not in ('donor', 'admin', 'reviewer'):
        return jsonify({'error': 'Insufficient permissions', 'success': False}), 403

    data = get_request_json()
    org_name = data.get('org_name', '').strip()
    country = data.get('country', '').strip()
    personnel = data.get('personnel', [])
    org_id = data.get('org_id')

    if not org_name:
        return jsonify({'error': 'org_name is required', 'success': False}), 400

    # Run screening
    check_results = ComplianceService.screen_organization(
        org_name, country, personnel, org_id
    )

    # Save to database if org_id is provided
    saved_checks = []
    if org_id:
        org = db.session.get(Organization, org_id)
        if org:
            # Remove old checks for this org
            ComplianceCheck.query.filter_by(org_id=org_id).delete()
            saved_checks = ComplianceService.save_checks(org_id, check_results)

    # Determine overall status
    statuses = [c['status'] for c in check_results]
    overall_status = 'flagged' if 'flagged' in statuses else 'clear'

    return jsonify({
        'success': True,
        'overall_status': overall_status,
        'checks': check_results,
        'saved_count': len(saved_checks),
    })


# =============================================================================
# REGISTRATION VERIFICATION
# =============================================================================

@compliance_bp.route('/verification/registries', methods=['GET'])
@login_required
def api_get_registries():
    """Get government registry directory for all supported countries."""
    registries = {}
    for country, info in AIService.GOVERNMENT_REGISTRIES.items():
        registries[country] = {
            'authority': info.get('authority'),
            'url': info.get('url'),
            'search_url': info.get('search_url'),
            'expected_format': info.get('format'),
            'notes': info.get('notes'),
        }
    return jsonify({'success': True, 'registries': registries})


@compliance_bp.route('/verification/<int:org_id>', methods=['GET'])
@login_required
def api_get_verification(org_id):
    """Get verification status for an organization."""
    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found'}), 404

    verifications = RegistrationVerification.query.filter_by(org_id=org_id) \
        .order_by(RegistrationVerification.updated_at.desc()).all()

    # Get registry info for this org's country
    registry = AIService.GOVERNMENT_REGISTRIES.get(org.country or '', {})
    registry_info = {
        'authority': registry.get('authority'),
        'url': registry.get('url'),
        'search_url': registry.get('search_url'),
        'expected_format': registry.get('format'),
        'notes': registry.get('notes'),
    } if registry else None

    # Determine overall status
    if verifications:
        latest = verifications[0]
        overall_status = latest.status
    else:
        overall_status = 'unverified'

    return jsonify({
        'success': True,
        'org_id': org_id,
        'org_name': org.name,
        'org_country': org.country,
        'registration_number': org.registration_number,
        'registration_status': org.registration_status,
        'overall_status': overall_status,
        'verifications': [v.to_dict() for v in verifications],
        'registry_info': registry_info,
    })


@compliance_bp.route('/verification/all', methods=['GET'])
@login_required
def api_get_all_verifications():
    """Get verification status for all NGO organizations (donor/admin view)."""
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'Only donors and admins can view all verifications'}), 403

    # Get all NGO-type organizations (ngo, cbo, ingo, network - everything except donor/reviewer)
    ngos = Organization.query.filter(
        ~Organization.org_type.in_(['donor', 'reviewer'])
    ).all()

    results = []
    for org in ngos:
        latest_v = RegistrationVerification.query.filter_by(org_id=org.id) \
            .order_by(RegistrationVerification.updated_at.desc()).first()

        registry = AIService.GOVERNMENT_REGISTRIES.get(org.country or '', {})

        results.append({
            'org_id': org.id,
            'org_name': org.name,
            'country': org.country,
            'registration_number': org.registration_number,
            'registration_status': org.registration_status,
            'verified': org.verified,
            'verification_status': latest_v.status if latest_v else 'unverified',
            'ai_confidence': latest_v.ai_confidence if latest_v else None,
            'verified_at': latest_v.verified_at.isoformat() if latest_v and latest_v.verified_at else None,
            'verified_by': latest_v.verified_by.name if latest_v and latest_v.verified_by else None,
            'registry_authority': registry.get('authority') if registry else None,
            'registry_url': registry.get('url') if registry else None,
            'registry_search_url': registry.get('search_url') if registry else None,
        })

    return jsonify({'success': True, 'organizations': results})


@compliance_bp.route('/verification/verify', methods=['POST'])
@login_required
def api_verify_registration():
    """Run AI verification on an organization's registration.
    Can verify using existing uploaded document or registration number."""
    data = get_request_json()
    org_id = data.get('org_id')

    if not org_id:
        return jsonify({'error': 'org_id is required', 'success': False}), 400

    org = db.session.get(Organization, org_id)
    if not org:
        return jsonify({'error': 'Organization not found', 'success': False}), 404

    # Find registration document if available
    doc_id = data.get('document_id')
    document = None
    file_path = None
    if doc_id:
        document = db.session.get(Document, doc_id)
        if document:
            file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], document.stored_filename)
            if not os.path.exists(file_path):
                file_path = None

    # Run AI verification
    ai_result = AIService.verify_registration(
        filename=document.original_filename if document else 'registration_certificate',
        doc_type='registration_certificate',
        file_size=document.file_size if document else 0,
        file_path=file_path,
        org_name=org.name,
        org_country=org.country,
        reg_number=org.registration_number,
    )

    # Run live registry check
    registry_check = RegistryService.verify_online(
        org.country, org.registration_number, org.name
    )
    ai_result['registry_check'] = registry_check

    # If registry confirms, boost confidence and add finding
    if registry_check.get('verified') is True:
        ai_result['status'] = 'ai_reviewed'
        ai_result['confidence'] = max(ai_result.get('confidence', 0), 85)
        ai_result.setdefault('findings', []).append(
            f'Registration confirmed via {org.country} government registry ({registry_check.get("source", "online")})'
        )
    elif registry_check.get('source') == 'not_available':
        ai_result.setdefault('findings', []).append(
            f'{registry_check.get("details", "No online registry available for this country.")}'
        )

    # Create or update verification record
    verification = RegistrationVerification(
        org_id=org_id,
        status=ai_result.get('status', 'pending'),
        registration_number=ai_result.get('extracted_data', {}).get('registration_number') or org.registration_number,
        registration_authority=ai_result.get('extracted_data', {}).get('registration_authority'),
        country=org.country,
        ai_confidence=ai_result.get('confidence', 0),
        document_id=doc_id,
    )

    # Store registry check result
    verification.set_registry_check_result(registry_check)

    # Parse dates
    ext_data = ai_result.get('extracted_data', {})
    if ext_data.get('registration_date'):
        try:
            verification.registration_date = datetime.strptime(ext_data['registration_date'], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass
    if ext_data.get('expiry_date'):
        try:
            verification.expiry_date = datetime.strptime(ext_data['expiry_date'], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            pass

    # Store registry URL if available
    registry_url = registry_check.get('registry_url') or ''
    if not registry_url:
        registry = AIService.GOVERNMENT_REGISTRIES.get(org.country or '', {})
        if registry:
            registry_url = registry.get('search_url') or registry.get('url')
    verification.registry_url = registry_url

    verification.set_ai_analysis(ai_result)
    db.session.add(verification)
    db.session.commit()

    return jsonify({
        'success': True,
        'verification': verification.to_dict(),
        'ai_result': ai_result,
    })


@compliance_bp.route('/verification/<int:verification_id>/update', methods=['PUT'])
@login_required
def api_update_verification(verification_id):
    """Update verification status (donor/admin manually verifies or flags)."""
    if current_user.role not in ('donor', 'admin'):
        return jsonify({'error': 'Only donors and admins can update verification', 'success': False}), 403

    verification = db.session.get(RegistrationVerification, verification_id)
    if not verification:
        return jsonify({'error': 'Verification not found', 'success': False}), 404

    data = get_request_json()
    new_status = data.get('status')

    if new_status not in ('verified', 'flagged', 'pending', 'expired'):
        return jsonify({'error': 'Invalid status. Use: verified, flagged, pending, expired', 'success': False}), 400

    verification.status = new_status
    verification.notes = data.get('notes', verification.notes)
    verification.verified_by_user_id = current_user.id
    verification.verified_at = datetime.now(timezone.utc)
    verification.updated_at = datetime.now(timezone.utc)

    # Also update the org's verified field
    org = verification.organization
    if org:
        org.verified = (new_status == 'verified')
        if new_status == 'verified':
            org.registration_status = 'registered'

    db.session.commit()

    return jsonify({
        'success': True,
        'verification': verification.to_dict(),
    })

"""
Phase 100 — Verifiable Credentials endpoints.

Public surface:

  GET  /.well-known/did.json                       — Kuja issuer DID doc
  GET  /.well-known/kuja-vc-context.jsonld         — JSON-LD context for
                                                     Kuja-specific terms
  GET  /api/passport/<id>/vc                       — download a VC for a
                                                     published passport
                                                     (NGO owner + admin)
  GET  /api/credentials/status-list/2021           — StatusList2021 cred,
                                                     public, read-only
  POST /api/credentials/verify                     — verify any
                                                     Kuja-issued VC,
                                                     public + cors-safe
  GET  /api/credentials/verifier-howto             — human-readable
                                                     instructions for a
                                                     third-party verifier
                                                     to validate offline.

The `.well-known` endpoints are mounted on the Flask app at the root,
not under /api/, because did:web resolution looks them up at
`https://<host>/.well-known/...`. Per the did:web spec.

Auth model:
  - DID document + status list + verifier-howto + verify endpoint are
    PUBLIC (anyone needs to read these to verify).
  - The VC download endpoint requires the credential's owning NGO
    (the org that owns the passport) OR an admin.
"""

from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request, Response, current_app
from flask_login import login_required, current_user

from app.extensions import db
from app.models.capacity_passport import CapacityPassport
from app.services.vc_service import VCService, canonical_json

logger = logging.getLogger('kuja')

# /api/credentials/* — protected + verifier-facing endpoints
credentials_bp = Blueprint('credentials', __name__, url_prefix='/api/credentials')

# /api/passport/<id>/vc — VC download endpoint sits alongside the existing
# /api/passport routes for consistency. We use a sibling blueprint that
# attaches at /api/passport.
passport_vc_bp = Blueprint('passport_vc', __name__, url_prefix='/api/passport')

# /.well-known/* — DID resolution endpoints. Mounted at root.
well_known_bp = Blueprint('well_known', __name__, url_prefix='/.well-known')


# ---------------------------------------------------------------------------
# DID document + JSON-LD context (public, served at /.well-known/*)
# ---------------------------------------------------------------------------

@well_known_bp.route('/did.json', methods=['GET'])
def did_document():
    """did:web resolution endpoint.

    A verifier resolving `did:web:<host>` follows the did:web spec to
    `https://<host>/.well-known/did.json`. This returns the issuer's
    public key in `Ed25519VerificationKey2020` shape — the same
    multibase string is referenced in every VC's `proof.verificationMethod`.
    """
    doc = VCService.did_document()
    # did:web docs are typically served with application/did+json,
    # but application/json is widely accepted by tooling.
    return jsonify(doc)


@well_known_bp.route('/kuja-vc-context.jsonld', methods=['GET'])
def kuja_vc_context():
    """JSON-LD context for the Kuja-specific VC fields.

    Verifiers parsing the VC need this to resolve terms like
    `KujaCapacityPassportCredential`, `compositeScore`, etc.
    """
    ctx = {
        '@context': {
            '@version': 1.1,
            '@protected': True,
            'kuja': 'https://kuja.org/vc/v1#',
            'KujaCapacityPassportCredential': 'kuja:KujaCapacityPassportCredential',
            'organizationName':    {'@id': 'kuja:organizationName',    '@type': 'http://www.w3.org/2001/XMLSchema#string'},
            'organizationCountry': {'@id': 'kuja:organizationCountry', '@type': 'http://www.w3.org/2001/XMLSchema#string'},
            'organizationType':    {'@id': 'kuja:organizationType',    '@type': 'http://www.w3.org/2001/XMLSchema#string'},
            'capacityScore':       {'@id': 'kuja:capacityScore',       '@type': 'http://www.w3.org/2001/XMLSchema#decimal'},
            'diligenceScore':      {'@id': 'kuja:diligenceScore',      '@type': 'http://www.w3.org/2001/XMLSchema#decimal'},
            'compositeScore':      {'@id': 'kuja:compositeScore',      '@type': 'http://www.w3.org/2001/XMLSchema#decimal'},
            'pillars':             {'@id': 'kuja:pillars',             '@container': '@index'},
            'snapshotHash':        {'@id': 'kuja:snapshotHash',        '@type': 'http://www.w3.org/2001/XMLSchema#string'},
        },
    }
    return jsonify(ctx)


# ---------------------------------------------------------------------------
# VC download (owning NGO + admin)
# ---------------------------------------------------------------------------

@passport_vc_bp.route('/<int:passport_id>/vc', methods=['GET'])
@login_required
def passport_vc(passport_id):
    """Issue a fresh VC for a published passport. Auth: owning NGO + admin.

    Query:
      format = 'json' (default) | 'download'

    Note: we re-sign on every call. The proof.created timestamp moves
    forward each time, but the underlying credentialSubject is stable
    (it's derived from the frozen snapshot). Third parties caching the
    VC will see different proof bytes but identical subject data — which
    is correct VC behaviour.
    """
    passport = CapacityPassport.query.filter_by(id=passport_id).first()
    if passport is None:
        return jsonify({'success': False, 'error': 'passport.not_found'}), 404

    is_owner = (current_user.role == 'ngo' and current_user.org_id == passport.org_id)
    is_admin = current_user.role == 'admin'
    if not (is_owner or is_admin):
        return jsonify({'success': False, 'error': 'forbidden'}), 403

    if passport.status != 'active':
        return jsonify({
            'success': False,
            'error': 'passport.not_active',
            'status': passport.status,
            'message': 'VCs can only be issued for active passports. Publish or refresh first.',
        }), 409

    try:
        vc = VCService.issue_passport_credential(passport)
    except Exception as e:
        logger.exception('VC issuance failed')
        return jsonify({'success': False, 'error': str(e)}), 500

    fmt = request.args.get('format', 'json')
    if fmt == 'download':
        body = canonical_json(vc).decode('utf-8')
        filename = f"kuja-capacity-passport-{passport.id}.vc.json"
        return Response(
            body,
            mimetype='application/vc+ld+json',
            headers={'Content-Disposition': f'attachment; filename="{filename}"'},
        )
    return jsonify(vc)


# ---------------------------------------------------------------------------
# StatusList2021 — public, read-only
# ---------------------------------------------------------------------------

@credentials_bp.route('/status-list/2021', methods=['GET'])
def status_list_2021():
    """StatusList2021Credential listing the revocation status of every
    Kuja-issued capacity passport credential. Public — anyone who has a
    Kuja VC needs to be able to read this to check if it's still valid.
    """
    return jsonify(VCService.status_list_2021())


# ---------------------------------------------------------------------------
# Verify endpoint — public
# ---------------------------------------------------------------------------

@credentials_bp.route('/verify', methods=['POST', 'OPTIONS'])
def verify_credential():
    """Accept a Kuja-issued VC and return a structured verification
    report.

    Body: { credential: <VC JSON-LD> }
       OR (raw VC body as the request JSON).

    Returns: { success, result: { valid, issuer_matches,
      verification_method_matches, signature_valid, status_active,
      expired, errors[] }, verifier_did, canonicalization }
    """
    # CORS preflight — verify is the one endpoint we explicitly invite
    # third-party origins to call from a browser.
    if request.method == 'OPTIONS':
        return _verify_cors_response()

    body = request.get_json(silent=True) or {}
    vc = body.get('credential') if isinstance(body.get('credential'), dict) else body
    if not isinstance(vc, dict) or not vc:
        return jsonify({'success': False, 'error': 'Missing credential body.'}), 400

    result = VCService.verify_credential(vc)
    resp = jsonify({
        'success': True,
        'result': result,
        'verifier_did': VCService.issuer_did(),
        'canonicalization': 'json-sorted-keys-rfc8259 (json.dumps(..., sort_keys=True, separators=(",", ":"), ensure_ascii=False))',
        'verifier_howto': f'{VCService._public_base_url()}/api/credentials/verifier-howto',
    })
    # Add CORS so an off-platform verifier UI can call this from a browser.
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp


def _verify_cors_response():
    resp = Response('', status=204)
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


# ---------------------------------------------------------------------------
# Verifier instructions (public)
# ---------------------------------------------------------------------------

@credentials_bp.route('/verifier-howto', methods=['GET'])
def verifier_howto():
    """Human-readable instructions for a third-party verifier to validate
    a Kuja-issued VC OFFLINE — without trusting our verify endpoint.

    The whole point of the VC is portability; you should be able to do
    this with just the VC, the issuer DID document, and an Ed25519
    library.
    """
    did = VCService.issuer_did()
    did_doc_url = f'{VCService._public_base_url()}/.well-known/did.json'
    status_url = f'{VCService._public_base_url()}/api/credentials/status-list/2021'
    instructions = {
        'issuer_did': did,
        'did_document_url': did_doc_url,
        'status_list_url': status_url,
        'cryptosuite': 'Ed25519Signature2020',
        'canonicalization': (
            'Strip the `proof` field, serialise with '
            'json.dumps(vc, sort_keys=True, separators=(",", ":"), '
            'ensure_ascii=False), encode UTF-8, then SHA-256 the bytes. '
            'Sign / verify over the SHA-256 digest.'
        ),
        'steps': [
            '1. Fetch the DID document from did_document_url. Pull the '
            'Ed25519VerificationKey2020 publicKeyMultibase value.',
            '2. Decode the multibase: strip the leading "z", base58btc '
            'decode, then strip the 2-byte multicodec prefix 0xED 0x01. '
            'You now have the 32-byte Ed25519 public key.',
            '3. Reconstruct the signing digest: stripped = {k:v for k,v '
            'in vc.items() if k != "proof"}; compute canonical_json(stripped).',
            '4. SHA-256 the canonical JSON bytes. The proof.proofValue is '
            'multibase-encoded (z-prefix + base58btc) over the raw Ed25519 '
            'signature of THIS digest.',
            '5. Verify the signature with the Ed25519 public key from step 2.',
            '6. (Recommended) Fetch status_list_url, base64-decode and '
            'gzip-decompress credentialSubject.encodedList. Confirm bit '
            'credentialStatus.statusListIndex of the resulting bytestring '
            'is 0 (active), not 1 (revoked).',
            '7. (Recommended) Confirm vc.expirationDate is in the future.',
        ],
        'reference_implementation': 'See app/services/vc_service.py:verify_credential().',
    }
    return jsonify(instructions)

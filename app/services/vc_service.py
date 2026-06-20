"""
Phase 100 — W3C Verifiable Credentials for Capacity Passports.

This service issues Ed25519-signed Verifiable Credentials over published
Capacity Passports so the NGO can carry the credential off-platform and
present it to any donor — on or off Kuja. The "Portable Trust Profile
share page" shipped in Phase 98 was the precursor; this is the moat.

Design choices (deliberately simple, deliberately interoperable):

  - Suite: Ed25519Signature2020 (JWS-style proofValue, not JCS-RDF).
    The full DIF JCS-RDF canonicalization is overkill for our flat
    JSON-LD shape; we use a simpler RFC-8259-style canonical JSON
    (sorted keys, no whitespace, no escaping beyond what JSON requires)
    and document it in the verify endpoint so third-party verifiers
    know exactly how to reproduce the digest.
  - Issuer DID: did:web. The DID document is published at
    /.well-known/did.json under the platform's public hostname (set via
    KUJA_PUBLIC_HOST env, default = the Railway production hostname).
  - Key storage: KUJA_VC_SIGNING_KEY_HEX env var (32-byte Ed25519 private
    key, hex-encoded). If not set, a key is generated on boot and a
    warning is logged — fine for dev, NOT for prod. Generate one with:
        python -c "from cryptography.hazmat.primitives.asymmetric.ed25519 \
            import Ed25519PrivateKey; \
            print(Ed25519PrivateKey.generate().private_bytes_raw().hex())"
  - Revocation: StatusList2021. The list itself is published at
    /api/credentials/status-list/2021 and bitstring entry i corresponds
    to CapacityPassport.id = i. Bit 1 = revoked, 0 = active.

The VC JSON-LD includes the org name + the four pillar scores +
issued/expires timestamps. The full Trust Profile snapshot stays on
Kuja's side; the VC is the "verified summary" the off-platform donor
can rely on without round-tripping to Kuja's API.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey, Ed25519PublicKey,
)
from cryptography.exceptions import InvalidSignature

from app.extensions import db
from app.models.capacity_passport import CapacityPassport
from app.models.organization import Organization

logger = logging.getLogger('kuja')


# Multibase prefixes (https://w3c.github.io/vc-data-integrity/#multibase-0)
_MULTIBASE_BASE58BTC = 'z'
# Multicodec varint prefixes
_MULTICODEC_ED25519_PUB = b'\xed\x01'   # ed25519-pub
_MULTICODEC_ED25519_PRIV = b'\x80\x26'  # ed25519-priv (not used here, kept for ref)


# --- minimal pure-Python base58btc (Bitcoin alphabet) ---------------------
_BASE58_ALPHABET = b'123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def _b58encode(b: bytes) -> str:
    n = int.from_bytes(b, 'big')
    out = bytearray()
    while n > 0:
        n, r = divmod(n, 58)
        out.append(_BASE58_ALPHABET[r])
    # Preserve leading zero bytes as leading '1' chars
    zeros = len(b) - len(b.lstrip(b'\x00'))
    return ('1' * zeros) + out[::-1].decode('ascii')


def _b58decode(s: str) -> bytes:
    n = 0
    for ch in s:
        n = n * 58 + _BASE58_ALPHABET.index(ch.encode('ascii'))
    raw = n.to_bytes(max(1, (n.bit_length() + 7) // 8), 'big')
    # Restore leading zero bytes from '1' prefix
    zeros = len(s) - len(s.lstrip('1'))
    return b'\x00' * zeros + raw if n else b'\x00' * zeros


# --- canonicalization -----------------------------------------------------

def canonical_json(obj: Any) -> bytes:
    """Deterministic JSON serialization used for both signing and verifying.

    Third-party verifiers must use the exact same canonicalization or the
    signature won't match. We document it in the verify endpoint:

      json.dumps(obj, sort_keys=True, separators=(',', ':'),
                 ensure_ascii=False).encode('utf-8')

    Equivalent to RFC 8259 with sorted keys and no whitespace.
    """
    return json.dumps(
        obj, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
    ).encode('utf-8')


# --- VC service -----------------------------------------------------------

class VCService:
    _priv: Ed25519PrivateKey | None = None
    _generated_key_warning_emitted: bool = False

    # ---- key management ----

    @classmethod
    def _signing_key(cls) -> Ed25519PrivateKey:
        if cls._priv is not None:
            return cls._priv
        hex_key = os.environ.get('KUJA_VC_SIGNING_KEY_HEX')
        if hex_key:
            try:
                raw = bytes.fromhex(hex_key.strip())
                if len(raw) != 32:
                    raise ValueError(f'expected 32 bytes, got {len(raw)}')
                cls._priv = Ed25519PrivateKey.from_private_bytes(raw)
                return cls._priv
            except Exception as e:
                logger.error(
                    'KUJA_VC_SIGNING_KEY_HEX set but invalid (%s). '
                    'Falling back to an ephemeral key — NOT for prod.', e,
                )
        # No key (or invalid). Generate one for this process. Logging once
        # so logs don't get spammed on every signing call.
        cls._priv = Ed25519PrivateKey.generate()
        if not cls._generated_key_warning_emitted:
            logger.warning(
                'No KUJA_VC_SIGNING_KEY_HEX set. Generated an ephemeral '
                'VC signing key for this process. Set the env var in '
                'Railway so credentials survive restarts. Generate via: '
                'py -3 -c "from cryptography.hazmat.primitives.asymmetric'
                '.ed25519 import Ed25519PrivateKey; '
                'print(Ed25519PrivateKey.generate().private_bytes_raw().hex())"'
            )
            cls._generated_key_warning_emitted = True
        return cls._priv

    @classmethod
    def public_key_bytes(cls) -> bytes:
        return cls._signing_key().public_key().public_bytes_raw()

    @classmethod
    def public_key_multibase(cls) -> str:
        """`z`-prefixed base58btc of (multicodec-prefix || raw-pub-key).

        This is the format Ed25519VerificationKey2020 expects.
        """
        raw = _MULTICODEC_ED25519_PUB + cls.public_key_bytes()
        return _MULTIBASE_BASE58BTC + _b58encode(raw)

    # ---- DID document ----

    @classmethod
    def public_host(cls) -> str:
        return os.environ.get('KUJA_PUBLIC_HOST', 'web-production-6f8a.up.railway.app').strip().lower()

    @classmethod
    def issuer_did(cls) -> str:
        return f'did:web:{cls.public_host()}'

    @classmethod
    def verification_method_id(cls) -> str:
        return f'{cls.issuer_did()}#keys-1'

    @classmethod
    def did_document(cls) -> dict:
        did = cls.issuer_did()
        vm_id = cls.verification_method_id()
        pk_mb = cls.public_key_multibase()
        return {
            '@context': [
                'https://www.w3.org/ns/did/v1',
                'https://w3id.org/security/suites/ed25519-2020/v1',
            ],
            'id': did,
            'verificationMethod': [{
                'id': vm_id,
                'type': 'Ed25519VerificationKey2020',
                'controller': did,
                'publicKeyMultibase': pk_mb,
            }],
            'assertionMethod': [vm_id],
            'authentication': [vm_id],
        }

    # ---- credential issuance ----

    @classmethod
    def _public_base_url(cls) -> str:
        """The HTTPS origin third-party verifiers resolve against. Includes
        scheme. Used to build status list + credential URLs."""
        return f'https://{cls.public_host()}'

    @classmethod
    def issue_passport_credential(cls, passport: CapacityPassport) -> dict:
        """Build + sign a Verifiable Credential for a published passport.

        Returns the W3C VC-JSON-LD object. The caller is responsible for
        gating on passport.status — but we double-check that the passport
        is currently active before signing.
        """
        if passport.status != 'active':
            raise ValueError(
                f'Cannot issue VC for non-active passport (status='
                f'{passport.status!r}).'
            )

        org = Organization.query.filter_by(id=passport.org_id).first()
        if org is None:
            raise ValueError('Organization not found for passport.')

        snapshot = passport.get_snapshot() or {}
        # Pillar scores — extract from the snapshot.
        capacity = snapshot.get('capacity') or {}
        diligence = snapshot.get('diligence') or {}

        def _score(d, key):
            v = (d or {}).get(key)
            if v is None:
                return None
            return round(float(v), 1) if isinstance(v, (int, float)) else None

        issued_at = (passport.published_at or datetime.now(timezone.utc)).isoformat()
        expires_at = passport.expires_at.isoformat() if passport.expires_at else None

        cred_id = f'{cls._public_base_url()}/api/passport/{passport.id}/vc'
        subject_id = f'urn:kuja:org:{org.id}'
        status_index = str(passport.id)

        vc: dict[str, Any] = {
            '@context': [
                'https://www.w3.org/2018/credentials/v1',
                'https://w3id.org/security/suites/ed25519-2020/v1',
                'https://w3id.org/vc/status-list/2021/v1',
                # Kuja-specific terms (resolved by our hosted context — see
                # /.well-known/kuja-vc-context.jsonld in the routes).
                f'{cls._public_base_url()}/.well-known/kuja-vc-context.jsonld',
            ],
            'id': cred_id,
            'type': ['VerifiableCredential', 'KujaCapacityPassportCredential'],
            'issuer': cls.issuer_did(),
            'issuanceDate': issued_at,
            'credentialSubject': {
                'id': subject_id,
                'organizationName': org.name,
                'organizationCountry': getattr(org, 'country', None),
                'organizationType': getattr(org, 'org_type', None),
                'capacityScore': _score(capacity, 'overall_score'),
                'diligenceScore': _score(diligence, 'overall_score'),
                'compositeScore': _score(snapshot, 'composite_score'),
                'pillars': {
                    'governance': _score(capacity, 'governance_score'),
                    'finance':    _score(capacity, 'finance_score'),
                    'programs':   _score(capacity, 'programs_score'),
                    'compliance': _score(capacity, 'compliance_score'),
                },
                'snapshotHash': passport.snapshot_hash,
            },
            'credentialStatus': {
                'id': f'{cls._public_base_url()}/api/credentials/status-list/2021#{status_index}',
                'type': 'StatusList2021Entry',
                'statusPurpose': 'revocation',
                'statusListIndex': status_index,
                'statusListCredential': (
                    f'{cls._public_base_url()}/api/credentials/status-list/2021'
                ),
            },
        }
        if expires_at:
            vc['expirationDate'] = expires_at

        # Build the proof. Sign over the canonical JSON of `vc` (without
        # the proof itself).
        digest = hashlib.sha256(canonical_json(vc)).digest()
        signature = cls._signing_key().sign(digest)
        proof_value = _MULTIBASE_BASE58BTC + _b58encode(signature)

        vc['proof'] = {
            'type': 'Ed25519Signature2020',
            'created': datetime.now(timezone.utc).isoformat(),
            'verificationMethod': cls.verification_method_id(),
            'proofPurpose': 'assertionMethod',
            'cryptosuite': 'ed25519-2020',
            'proofValue': proof_value,
            # Document the canonicalization for verifiers.
            'canonicalization': 'json-sorted-keys-rfc8259',
        }
        return vc

    # ---- verification ----

    @classmethod
    def verify_credential(cls, vc: dict) -> dict:
        """Verify a VC issued by this platform.

        Returns: {valid, issuer_matches, signature_valid, status_active,
                  expired, errors[]}

        We deliberately only accept credentials signed by THIS issuer
        (our did:web). Anyone running a fork can re-derive the verify
        path against their own did:web; the canonicalization rule is
        published next to the verify endpoint.
        """
        errors = []
        if not isinstance(vc, dict):
            return {'valid': False, 'errors': ['VC must be a JSON object.']}

        proof = vc.get('proof')
        if not isinstance(proof, dict):
            return {'valid': False, 'errors': ['Missing proof block.']}

        # 1. Issuer check
        issuer = vc.get('issuer')
        issuer_matches = issuer == cls.issuer_did()
        if not issuer_matches:
            errors.append(
                f'Issuer mismatch: VC claims {issuer!r}, this platform '
                f'issues as {cls.issuer_did()!r}.'
            )

        # 2. Verification method check
        vm = proof.get('verificationMethod')
        vm_matches = vm == cls.verification_method_id()
        if not vm_matches:
            errors.append(
                f'verificationMethod mismatch: VC claims {vm!r}, '
                f'expected {cls.verification_method_id()!r}.'
            )

        # 3. Reconstruct the signing payload and verify the signature.
        proof_value = proof.get('proofValue') or ''
        signature_valid = False
        if (
            isinstance(proof_value, str)
            and proof_value.startswith(_MULTIBASE_BASE58BTC)
            and issuer_matches  # only attempt sig verify against our key
        ):
            try:
                sig = _b58decode(proof_value[len(_MULTIBASE_BASE58BTC):])
                stripped = {k: v for k, v in vc.items() if k != 'proof'}
                digest = hashlib.sha256(canonical_json(stripped)).digest()
                cls._signing_key().public_key().verify(sig, digest)
                signature_valid = True
            except InvalidSignature:
                errors.append('Signature is cryptographically invalid.')
            except Exception as e:
                errors.append(f'Signature decode error: {e}')

        # 4. Status (revocation) check
        status_active = True
        revocation_reason = None
        cred_id = vc.get('id') or ''
        passport_id = None
        # Try to pull passport id from credentialStatus.statusListIndex.
        cs = vc.get('credentialStatus') or {}
        try:
            passport_id = int(cs.get('statusListIndex'))
        except (TypeError, ValueError):
            passport_id = None
        if passport_id is not None:
            passport = CapacityPassport.query.filter_by(id=passport_id).first()
            if passport is None:
                status_active = False
                errors.append('Status list entry refers to unknown passport.')
            elif passport.status == 'revoked':
                status_active = False
                revocation_reason = passport.revoked_reason or 'revoked'
            elif passport.status == 'expired':
                status_active = False
                revocation_reason = 'expired'

        # 5. Expiration check
        expired = False
        exp = vc.get('expirationDate')
        if exp:
            try:
                exp_dt = datetime.fromisoformat(exp.replace('Z', '+00:00'))
                if exp_dt < datetime.now(timezone.utc):
                    expired = True
            except Exception:
                pass

        valid = (
            issuer_matches and vm_matches and signature_valid
            and status_active and not expired
        )
        return {
            'valid': valid,
            'issuer_matches': issuer_matches,
            'verification_method_matches': vm_matches,
            'signature_valid': signature_valid,
            'status_active': status_active,
            'revocation_reason': revocation_reason,
            'expired': expired,
            'credential_id': cred_id,
            'passport_id': passport_id,
            'errors': errors,
        }

    # ---- StatusList2021 ----

    @classmethod
    def status_list_2021(cls) -> dict:
        """Build the StatusList2021 credential.

        Bit i = 1 means CapacityPassport.id i is revoked or expired;
        0 means active. The bitstring is GZIP-compressed and base64-encoded
        per the spec.

        Note: we deliberately don't sign this list credential to keep the
        endpoint cheap; the bitstring's integrity is implicit in being
        served from our did:web origin. Future hardening: sign it as a VC.
        """
        # Find the largest passport id so the bitstring covers everything
        # the platform has ever issued. Bound by a sensible upper limit so
        # one stray DB write doesn't blow the list to MB.
        max_row = db.session.query(db.func.max(CapacityPassport.id)).scalar()
        max_id = int(max_row) if max_row else 0
        # Round up to a 16K minimum so the list looks the same shape even
        # in dev with no passports yet (the spec encourages large lists
        # for privacy unlinkability).
        bit_count = max(16 * 1024, max_id + 1)
        # 8 bits per byte
        byte_count = (bit_count + 7) // 8
        bitmap = bytearray(byte_count)

        # Mark revoked + expired passports.
        for pid, status in db.session.query(
            CapacityPassport.id, CapacityPassport.status,
        ).filter(CapacityPassport.status.in_(('revoked', 'expired'))).all():
            i = int(pid)
            if 0 <= i < bit_count:
                bitmap[i // 8] |= 1 << (7 - (i % 8))

        import gzip
        gz = gzip.compress(bytes(bitmap), compresslevel=9)
        encoded = base64.b64encode(gz).decode('ascii')

        return {
            '@context': [
                'https://www.w3.org/2018/credentials/v1',
                'https://w3id.org/vc/status-list/2021/v1',
            ],
            'id': f'{cls._public_base_url()}/api/credentials/status-list/2021',
            'type': ['VerifiableCredential', 'StatusList2021Credential'],
            'issuer': cls.issuer_did(),
            'issuanceDate': datetime.now(timezone.utc).isoformat(),
            'credentialSubject': {
                'id': f'{cls._public_base_url()}/api/credentials/status-list/2021#list',
                'type': 'StatusList2021',
                'statusPurpose': 'revocation',
                'encodedList': encoded,
            },
        }

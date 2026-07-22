"""
Kuja Grant Management System - S3/R2-compatible object storage adapter
=======================================================================
Phase 719 (Proximate backlog) — evidence files on Cloudflare R2.

Env-gated on S3_ENDPOINT / S3_ACCESS_KEY / S3_SECRET_KEY / S3_BUCKET /
S3_REGION. With NONE of those set the whole module is inert: every entry
point returns success=False with a machine-readable `reason`, nothing
touches the network, and the rest of the app keeps serving files off the
local UPLOAD_FOLDER exactly as it does today.

Two things a reader will otherwise mistake for bugs:

1. We sign requests by hand (AWS Signature V4) instead of using boto3.
   boto3 is NOT in requirements.txt and adding a dependency was out of
   scope for the wave that wrote this file. `requests` is already a
   dependency, and SigV4 over requests is ~80 lines. If boto3 is ever
   vendored, this module is the only thing that needs to change.

2. `migrate_to_object_storage()` UPLOADS but never DELETES the local
   original. That is deliberate, not an unfinished thought — see the
   long comment on that function.

Storage is addressed path-style (`{endpoint}/{bucket}/{key}`) rather than
virtual-host style, because R2 and MinIO both accept path-style and
custom endpoints frequently have no wildcard DNS.
"""

import hashlib
import hmac
import logging
import mimetypes
import os
import urllib.parse
from datetime import datetime, timezone

import requests

logger = logging.getLogger('kuja')

# Single-PUT ceiling. The S3 API caps a non-multipart PUT at 5 GiB; we
# refuse a little below that rather than let the remote return a confusing
# EntityTooLarge. Multipart upload is not implemented (nothing in the
# pilot comes close — evidence files are photos and PDFs).
MAX_SINGLE_PUT_BYTES = 4_500_000_000

# Read the file in chunks when hashing so a large pg_dump doesn't have to
# sit in memory twice.
_HASH_CHUNK = 1024 * 1024

_EMPTY_SHA256 = hashlib.sha256(b'').hexdigest()


class ObjectStorageService:
    """S3-compatible object storage (Cloudflare R2, AWS S3, MinIO).

    Every public method returns a dict carrying `success` plus, on
    failure, a `reason` string. Nothing here raises for an operational
    problem — an unreachable bucket must never take down an upload path
    that has a working local fallback. Programming errors (bad argument
    types) still raise.

    IMPORTANT (learned the hard way twice in this codebase — EmailService
    and MessagingService._send_log both once returned success while
    silently discarding the payload): a degraded path here returns
    success=False and says why. There is no "pretend it worked" branch.
    """

    # --- Configuration -------------------------------------------------

    @staticmethod
    def _env():
        """Read config fresh on each call rather than caching at import.

        Tests and the migrate/backup callables flip these vars at runtime;
        a module-level snapshot would make the adapter stick to whatever
        the environment looked like when Flask first imported it.
        """
        return {
            'endpoint': (os.getenv('S3_ENDPOINT') or '').strip().rstrip('/'),
            'access_key': (os.getenv('S3_ACCESS_KEY') or '').strip(),
            'secret_key': (os.getenv('S3_SECRET_KEY') or '').strip(),
            'bucket': (os.getenv('S3_BUCKET') or '').strip(),
            # R2 wants the literal string 'auto'; AWS wants a real region.
            'region': (os.getenv('S3_REGION') or 'auto').strip(),
        }

    @classmethod
    def is_configured(cls):
        """True only when every required var is present. Partial config is
        treated as unconfigured — a half-set bucket is an ops mistake we
        want surfaced by config_status(), not a runtime 403 storm."""
        env = cls._env()
        return all(env[k] for k in
                   ('endpoint', 'access_key', 'secret_key', 'bucket'))

    @classmethod
    def config_status(cls):
        """Ops-facing description of what is and isn't set. Never returns
        secret VALUES — only which names are missing."""
        env = cls._env()
        required = ('endpoint', 'access_key', 'secret_key', 'bucket')
        missing = [f'S3_{k.upper()}' for k in required if not env[k]]
        return {
            'configured': not missing,
            'missing_env': missing,
            # Safe to echo: endpoint and bucket are not secrets, and ops
            # needs them to tell staging from prod at a glance.
            'endpoint': env['endpoint'] or None,
            'bucket': env['bucket'] or None,
            'region': env['region'],
        }

    # --- SigV4 ---------------------------------------------------------

    @staticmethod
    def _sign(key, msg):
        return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

    @classmethod
    def _signing_key(cls, secret_key, date_stamp, region, service='s3'):
        """Derive the SigV4 scoped signing key (AWS4 -> date -> region ->
        service -> aws4_request)."""
        k_date = cls._sign(f'AWS4{secret_key}'.encode('utf-8'), date_stamp)
        k_region = cls._sign(k_date, region)
        k_service = cls._sign(k_region, service)
        return cls._sign(k_service, 'aws4_request')

    @classmethod
    def _signed_headers(cls, method, key, *, payload_sha256,
                        extra_headers=None, content_length=None):
        """Build the full header set (including Authorization) for one
        request against `key`. Returns (url, headers) or raises ValueError
        if unconfigured — callers check is_configured() first.
        """
        env = cls._env()
        if not cls.is_configured():
            raise ValueError('object storage not configured')

        endpoint = env['endpoint']
        if not endpoint.startswith(('http://', 'https://')):
            endpoint = f'https://{endpoint}'
        parsed = urllib.parse.urlparse(endpoint)
        host = parsed.netloc

        # Path-style addressing. Each segment is percent-encoded per
        # RFC3986; '/' stays literal so the key's folder structure
        # survives into the canonical URI.
        canonical_uri = '/' + urllib.parse.quote(
            f"{env['bucket']}/{key.lstrip('/')}", safe='/')
        url = f'{parsed.scheme}://{host}{canonical_uri}'

        now = datetime.now(timezone.utc)
        amz_date = now.strftime('%Y%m%dT%H%M%SZ')
        date_stamp = now.strftime('%Y%m%d')

        headers = {
            'host': host,
            'x-amz-content-sha256': payload_sha256,
            'x-amz-date': amz_date,
        }
        if content_length is not None:
            headers['content-length'] = str(content_length)
        for k, v in (extra_headers or {}).items():
            headers[k.lower()] = v

        # Canonical headers must be sorted by name, values trimmed.
        signed_names = sorted(headers)
        canonical_headers = ''.join(
            f'{n}:{str(headers[n]).strip()}\n' for n in signed_names)
        signed_headers = ';'.join(signed_names)

        canonical_request = '\n'.join([
            method,
            canonical_uri,
            '',                      # no query string on any call we make
            canonical_headers,
            signed_headers,
            payload_sha256,
        ])

        scope = f"{date_stamp}/{env['region']}/s3/aws4_request"
        string_to_sign = '\n'.join([
            'AWS4-HMAC-SHA256',
            amz_date,
            scope,
            hashlib.sha256(canonical_request.encode('utf-8')).hexdigest(),
        ])

        signature = hmac.new(
            cls._signing_key(env['secret_key'], date_stamp, env['region']),
            string_to_sign.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()

        headers['Authorization'] = (
            f"AWS4-HMAC-SHA256 Credential={env['access_key']}/{scope}, "
            f'SignedHeaders={signed_headers}, Signature={signature}'
        )
        return url, headers

    # --- Keys ----------------------------------------------------------

    @staticmethod
    def evidence_key(document):
        """Deterministic object key for a Document row.

        Deterministic on purpose: the Document model has no `storage_key`
        column (adding one needs a migration this wave did not own), so
        re-running the migration recomputes the same key and a HEAD tells
        us whether the object is already there. That is what makes
        migrate_to_object_storage() safe to re-run without schema change.
        """
        stored = (document.stored_filename or '').lstrip('/')
        return f'evidence/{document.id}/{stored}'

    # --- Operations ----------------------------------------------------

    @classmethod
    def put_bytes(cls, key, data, *, content_type=None):
        """Upload an in-memory payload. Returns {'success': bool, ...}."""
        if not cls.is_configured():
            return {'success': False, 'reason': 'not_configured',
                    'detail': cls.config_status()}
        if len(data) > MAX_SINGLE_PUT_BYTES:
            return {'success': False, 'reason': 'too_large',
                    'detail': f'{len(data)} bytes exceeds single-PUT ceiling'}

        payload_hash = hashlib.sha256(data).hexdigest()
        ctype = content_type or cls._guess_content_type(key)
        try:
            url, headers = cls._signed_headers(
                'PUT', key, payload_sha256=payload_hash,
                extra_headers={'content-type': ctype},
                content_length=len(data),
            )
            resp = requests.put(url, data=data, headers=headers, timeout=120)
        except Exception as e:
            logger.warning('object storage PUT failed for %s: %s', key, e)
            return {'success': False, 'reason': 'request_failed',
                    'detail': str(e)[:300]}
        return cls._interpret_write(resp, key, len(data))

    @classmethod
    def put_file(cls, key, file_path, *, content_type=None):
        """Upload from disk, streaming the body.

        The SHA-256 is computed by reading the file once in chunks, then
        the body is streamed from a second open handle. This keeps a large
        pg_dump off the heap — the naive read()-it-all version held the
        dump in memory twice (once to hash, once to send).
        """
        if not cls.is_configured():
            return {'success': False, 'reason': 'not_configured',
                    'detail': cls.config_status()}
        if not os.path.exists(file_path):
            return {'success': False, 'reason': 'local_file_missing',
                    'detail': file_path}

        size = os.path.getsize(file_path)
        if size > MAX_SINGLE_PUT_BYTES:
            return {'success': False, 'reason': 'too_large',
                    'detail': f'{size} bytes exceeds single-PUT ceiling'}

        digest = hashlib.sha256()
        try:
            with open(file_path, 'rb') as fh:
                for chunk in iter(lambda: fh.read(_HASH_CHUNK), b''):
                    digest.update(chunk)
        except Exception as e:
            return {'success': False, 'reason': 'local_read_failed',
                    'detail': str(e)[:300]}

        ctype = content_type or cls._guess_content_type(key)
        try:
            url, headers = cls._signed_headers(
                'PUT', key, payload_sha256=digest.hexdigest(),
                extra_headers={'content-type': ctype},
                content_length=size,
            )
            with open(file_path, 'rb') as fh:
                resp = requests.put(url, data=fh, headers=headers, timeout=600)
        except Exception as e:
            logger.warning('object storage PUT (file) failed for %s: %s', key, e)
            return {'success': False, 'reason': 'request_failed',
                    'detail': str(e)[:300]}
        return cls._interpret_write(resp, key, size)

    @classmethod
    def get_bytes(cls, key):
        """Download an object. Returns {'success': bool, 'data': bytes}."""
        if not cls.is_configured():
            return {'success': False, 'reason': 'not_configured',
                    'detail': cls.config_status()}
        try:
            url, headers = cls._signed_headers(
                'GET', key, payload_sha256=_EMPTY_SHA256)
            resp = requests.get(url, headers=headers, timeout=120)
        except Exception as e:
            logger.warning('object storage GET failed for %s: %s', key, e)
            return {'success': False, 'reason': 'request_failed',
                    'detail': str(e)[:300]}
        if resp.status_code == 404:
            return {'success': False, 'reason': 'not_found', 'key': key}
        if resp.status_code >= 400:
            return {'success': False, 'reason': 'http_error',
                    'status': resp.status_code, 'detail': resp.text[:300]}
        return {'success': True, 'key': key, 'data': resp.content,
                'size': len(resp.content)}

    @classmethod
    def head_object(cls, key):
        """Existence + size probe. `success` reports whether the PROBE
        ran, not whether the object exists — check `exists` for that.
        Conflating the two would make a network outage read as 'object
        absent' and cause the migration to re-upload everything."""
        if not cls.is_configured():
            return {'success': False, 'exists': False,
                    'reason': 'not_configured'}
        try:
            url, headers = cls._signed_headers(
                'HEAD', key, payload_sha256=_EMPTY_SHA256)
            resp = requests.head(url, headers=headers, timeout=30)
        except Exception as e:
            logger.warning('object storage HEAD failed for %s: %s', key, e)
            return {'success': False, 'exists': False,
                    'reason': 'request_failed', 'detail': str(e)[:300]}
        if resp.status_code == 404:
            return {'success': True, 'exists': False, 'key': key}
        if resp.status_code >= 400:
            return {'success': False, 'exists': False, 'reason': 'http_error',
                    'status': resp.status_code}
        try:
            size = int(resp.headers.get('Content-Length') or 0)
        except (TypeError, ValueError):
            size = 0
        return {'success': True, 'exists': True, 'key': key, 'size': size,
                'etag': (resp.headers.get('ETag') or '').strip('"')}

    # --- Internals -----------------------------------------------------

    @staticmethod
    def _guess_content_type(key):
        guessed, _ = mimetypes.guess_type(key)
        return guessed or 'application/octet-stream'

    @staticmethod
    def _interpret_write(resp, key, size):
        if resp.status_code >= 400:
            logger.warning('object storage PUT %s -> HTTP %s: %s',
                           key, resp.status_code, resp.text[:200])
            return {'success': False, 'reason': 'http_error',
                    'status': resp.status_code, 'detail': resp.text[:300]}
        return {'success': True, 'key': key, 'size': size,
                'etag': (resp.headers.get('ETag') or '').strip('"')}


# --- Migration ---------------------------------------------------------

def migrate_to_object_storage(*, limit=None, dry_run=False,
                              upload_folder=None):
    """Copy existing evidence Documents into object storage.

    Safe to re-run: for each Document we compute the deterministic
    `evidence_key`, HEAD it, and skip when an object of the same size is
    already present. A HEAD that FAILS (network/auth) is not treated as
    absent — the document is counted under `errors` and left for the next
    run rather than blindly re-uploaded.

    THIS FUNCTION DOES NOT DELETE THE LOCAL FILE, and that is deliberate.
    Every read path in the app today (documents.py, proximate_routes.py,
    compliance_routes.py, grants.py — see the UPLOAD_FOLDER call sites)
    still resolves bytes as os.path.join(UPLOAD_FOLDER, stored_filename).
    Until those readers learn to fall back to object storage, deleting the
    local original would turn every existing download into a 404. So this
    is a COPY that establishes the remote replica; flipping reads over and
    reclaiming local disk are separate, later steps.

    Returns a summary dict — never raises, so it is safe to wire into a
    cron or an admin button.
    """
    from flask import current_app

    summary = {
        'configured': ObjectStorageService.is_configured(),
        'dry_run': bool(dry_run),
        'considered': 0, 'uploaded': 0, 'skipped_present': 0,
        'missing_local': 0, 'errors': 0, 'error_detail': [],
    }
    if not summary['configured']:
        # Not an error — this is the default state of the app. Say so
        # plainly so a caller can't read the zero counts as "all done".
        summary['reason'] = 'not_configured'
        summary['detail'] = ObjectStorageService.config_status()
        return summary

    from app.models.document import Document

    folder = upload_folder or current_app.config.get('UPLOAD_FOLDER') or ''
    q = Document.query.order_by(Document.id.asc())
    if limit:
        q = q.limit(int(limit))

    for doc in q.all():
        summary['considered'] += 1
        key = ObjectStorageService.evidence_key(doc)
        local_path = os.path.join(folder, doc.stored_filename or '')

        if not doc.stored_filename or not os.path.exists(local_path):
            # Rows whose bytes are already gone (pruned, or uploaded on a
            # host whose disk didn't persist). Counted, not fatal.
            summary['missing_local'] += 1
            continue

        head = ObjectStorageService.head_object(key)
        if not head.get('success'):
            summary['errors'] += 1
            if len(summary['error_detail']) < 20:
                summary['error_detail'].append(
                    {'document_id': doc.id, 'stage': 'head',
                     'reason': head.get('reason')})
            continue

        local_size = os.path.getsize(local_path)
        if head.get('exists') and head.get('size') == local_size:
            summary['skipped_present'] += 1
            continue

        if dry_run:
            # Counted as "would upload" so a dry run reports real work.
            summary['uploaded'] += 1
            continue

        res = ObjectStorageService.put_file(
            key, local_path, content_type=doc.mime_type or None)
        if res.get('success'):
            summary['uploaded'] += 1
        else:
            summary['errors'] += 1
            if len(summary['error_detail']) < 20:
                summary['error_detail'].append(
                    {'document_id': doc.id, 'stage': 'put',
                     'reason': res.get('reason')})

    logger.info('evidence migration to object storage: %s',
                {k: v for k, v in summary.items() if k != 'error_detail'})
    return summary

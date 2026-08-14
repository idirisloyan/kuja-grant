"""
trust_client.py — HTTP client to the standalone Kuja Trust app.

Phase 3 of the Kuja Platform Integration (see docs/KUJA_PLATFORM_INTEGRATION.md):
the grant app stops maintaining its own fork of the due-diligence engine and
instead *calls* the standalone Kuja Trust service. This module is the outbound
half of that seam — the grant app talking to Trust over an authenticated
service channel.

CONTRACT (to be implemented on the Trust side next):
    GET  {base}/api/service/trust-profile?org=<org_ref>   -> two-pillar snapshot
    POST {base}/api/service/screening/run                 -> run live screening
    GET  {base}/api/health                                 -> liveness (public)

Auth is a shared service credential, NOT the public share token — systems talk
to each other with a bearer service token; the anonymous magic-link token is
reserved for external humans (see the spec's security model).

Configuration (env, all optional — unset => client is inert):
    KUJA_TRUST_BASE_URL       e.g. https://kuja-app-production.up.railway.app
    KUJA_TRUST_SERVICE_TOKEN  shared secret Trust validates on /api/service/*
    KUJA_TRUST_TIMEOUT        seconds, default 12

Failure policy: every call raises TrustUnavailable on any transport/HTTP error.
Callers (trust_engine) decide whether to fall back to the local fork — this
client never returns a partial or guessed result, and never raises a bare
requests exception up the stack.
"""

import os
import logging

import requests

logger = logging.getLogger('kuja')


class TrustUnavailable(Exception):
    """Raised when the Trust service can't be reached or returns an error.

    Carries no sensitive detail; the message is safe to log.
    """


def _env(name: str, default: str = '') -> str:
    return (os.environ.get(name, default) or '').strip()


class TrustClient:
    """Thin, timeout-guarded client for the standalone Kuja Trust service."""

    def __init__(self, base_url: str | None = None, token: str | None = None,
                 timeout: float | None = None):
        self.base_url = (base_url if base_url is not None else _env('KUJA_TRUST_BASE_URL')).rstrip('/')
        self._token = token if token is not None else _env('KUJA_TRUST_SERVICE_TOKEN')
        if timeout is not None:
            self.timeout = timeout
        else:
            try:
                self.timeout = float(_env('KUJA_TRUST_TIMEOUT', '12'))
            except ValueError:
                self.timeout = 12.0

    @property
    def configured(self) -> bool:
        """True only when both base URL and service token are set."""
        return bool(self.base_url and self._token)

    # -- internals ----------------------------------------------------------
    def _headers(self) -> dict:
        return {
            'Authorization': f'Bearer {self._token}',
            'X-Requested-With': 'kuja-grant',
            'Accept': 'application/json',
        }

    def _request(self, method: str, path: str, *, params=None, json=None) -> dict:
        if not self.configured:
            raise TrustUnavailable('Trust client not configured (base URL / token unset)')
        url = f'{self.base_url}{path}'
        try:
            resp = requests.request(
                method, url, params=params, json=json,
                headers=self._headers(), timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise TrustUnavailable(f'Trust request failed: {type(exc).__name__}') from exc
        if resp.status_code >= 400:
            raise TrustUnavailable(f'Trust returned HTTP {resp.status_code} for {path}')
        try:
            return resp.json()
        except ValueError as exc:
            raise TrustUnavailable('Trust returned a non-JSON body') from exc

    # -- public surface -----------------------------------------------------
    def health(self) -> bool:
        """Best-effort liveness check. Never raises."""
        if not self.base_url:
            return False
        try:
            resp = requests.get(f'{self.base_url}/api/health', timeout=self.timeout)
            return resp.status_code < 400
        except requests.RequestException:
            return False

    def get_trust_profile(self, org_ref: str) -> dict:
        """Fetch the org's two-pillar snapshot from Trust and normalise it to
        the grant app's Trust Profile shape. Raises TrustUnavailable on error.
        """
        raw = self._request('GET', '/api/service/trust-profile', params={'org': org_ref})
        return _normalize_profile(raw, org_ref)

    def run_screening(self, org_ref: str, name: str, country: str | None = None) -> dict:
        """Ask Trust to run live screening for the org. Returns the raw result."""
        return self._request('POST', '/api/service/screening/run', json={
            'org': org_ref, 'name': name, 'country': country,
        })


def _normalize_profile(raw: dict, org_ref: str) -> dict:
    """Map the Trust service snapshot onto the grant app's Trust Profile shape
    ({overall:{score,status}, capacity, diligence}) so downstream code is
    source-agnostic. Trust's field names differ slightly (composite / overallStatus),
    so we accept either and default missing pieces conservatively.
    """
    if not isinstance(raw, dict):
        raise TrustUnavailable('Trust profile payload was not an object')

    overall_in = raw.get('overall') or {}
    score = overall_in.get('score', raw.get('composite'))
    status = overall_in.get('status', raw.get('overallStatus'))

    return {
        'org_id': raw.get('org_id'),
        'org_ref': org_ref,
        'org_name': raw.get('org_name') or raw.get('orgName'),
        'country': raw.get('country'),
        'sector': raw.get('sector'),
        'verified_badge': raw.get('verified_badge'),
        'overall': {
            'score': score,
            'status': status,
            'computed_at': overall_in.get('computed_at') or raw.get('computedAt'),
        },
        'capacity': raw.get('capacity') or {},
        'diligence': raw.get('diligence') or {},
        'source': 'trust',   # provenance marker — this came from the shared engine
    }


# Module-level singleton for convenience; callers may also construct their own.
_default_client: TrustClient | None = None


def get_client() -> TrustClient:
    """Return a process-wide TrustClient built from the current environment."""
    global _default_client
    if _default_client is None:
        _default_client = TrustClient()
    return _default_client

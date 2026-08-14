"""
build_client.py — service-credential client to the operator's Kuja Build ERP.

Tenant-agnostic: the same client serves the Kuja tenant and the networked
tenants (Proximate / Saxansaxo). It pulls a SINGLE analytic account's financials
by ``build_ref`` and normalises them to the shared shape the donor view reads.

INERT until configured: with no ``KUJA_BUILD_BASE_URL`` / ``KUJA_BUILD_SERVICE_TOKEN``
set, ``configured`` is False and callers fall back to the manual/empty shape —
so shipping this changes nothing on prod. The one remaining integration point
(the concrete finance API call) is wired once the dev team provides the API
contract + a sample payload (see docs/KUJA_BUILD_NETWORKED_TENANTS_INTEGRATION.md,
"What we need from the dev team", items A + C).

Security: the feed is keyed off the grant's STORED ``build_ref`` (resolved
server-side), never a request-supplied id — isolation by record. Prefer a Build
service account scoped per analytic account, or a per-grant share token, so the
credential can only read the one account.
"""
import os


class BuildUnavailable(Exception):
    """Raised when the Build feed cannot serve a request. Callers should fall
    back to the manual/empty financial shape rather than error the page."""


class BuildClient:
    def __init__(self):
        self.base_url = os.getenv('KUJA_BUILD_BASE_URL', '').rstrip('/')
        self.token = os.getenv('KUJA_BUILD_SERVICE_TOKEN', '')
        # 'rest' | 'jsonrpc' | 'xmlrpc' — set once the dev team confirms the API.
        self.api = os.getenv('KUJA_BUILD_API', 'rest').strip().lower()
        try:
            self.timeout = int(os.getenv('KUJA_BUILD_TIMEOUT', '12'))
        except ValueError:
            self.timeout = 12

    @property
    def configured(self) -> bool:
        """True only when a base URL and a service credential are both set."""
        return bool(self.base_url and self.token)

    def get_financials(self, build_ref: str) -> dict:
        """Return normalised financials for one Build analytic account.

        Raises ``BuildUnavailable`` when the feed can't serve the request (no
        ref, not configured, or the API contract is not yet wired). Callers
        catch it and fall back to the manual/empty shape.
        """
        if not build_ref:
            raise BuildUnavailable('no_build_ref')
        if not self.configured:
            raise BuildUnavailable('build_not_configured')

        # --- INTEGRATION POINT (pending the dev-team API contract) ---------
        # Once the Build finance API + a sample payload are provided, issue the
        # scoped call here — keyed ONLY by build_ref — and hand the raw response
        # to normalize(). Example shape once wired:
        #     raw = self._get(f'/api/finance/analytic/{build_ref}')
        #     return self.normalize(raw, build_ref)
        # Until then, signal unavailable so the donor view uses the manual shape.
        raise BuildUnavailable('build_api_pending')

    @staticmethod
    def normalize(raw: dict, build_ref: str, currency: str = 'USD') -> dict:
        """Map a raw Build finance response → the shared normalised shape.

        Defensive: reads the expected keys and tolerates missing ones, so it is
        ready to lock against the dev team's sample payload without touching
        callers. The shape is the same one the Kuja Build seam uses.
        """
        raw = raw or {}
        return {
            'source': 'erp',
            'build_ref': build_ref,
            'currency': raw.get('currency') or currency,
            'budget_lines': list(raw.get('budget_lines') or []),   # {category, planned}
            'actuals': list(raw.get('actuals') or []),             # {category, spent, date, source}
            'disbursements': list(raw.get('disbursements') or []),  # {amount, date, payee_ref}
            'last_synced_at': raw.get('last_synced_at'),
        }


_client = None


def get_client() -> BuildClient:
    global _client
    if _client is None:
        _client = BuildClient()
    return _client

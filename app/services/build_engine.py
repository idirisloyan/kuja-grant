"""
build_engine.py — the `financial_source = erp | manual` abstraction.

Given a grant, returns its financials in one normalised shape regardless of
source, so the donor view (and compliance) reads the same thing whether the
numbers come from Kuja Build or from uploaded reports.

Selection:
  * financial_source != 'erp'            -> manual/empty shape (uploads render here)
  * financial_source == 'erp', no client -> erp shape, status 'erp_unconfigured' (inert)
  * financial_source == 'erp', client OK -> pull via BuildClient(build_ref)

Tenant-agnostic. Isolation is by record: we only ever pass the grant's STORED
build_ref, resolved server-side — never a request value.
"""


def _empty(grant, source: str) -> dict:
    return {
        'source': source,
        'build_ref': grant.build_ref if source == 'erp' else None,
        'currency': (getattr(grant, 'currency', None) or 'USD'),
        'budget_lines': [],
        'actuals': [],
        'disbursements': [],
        'last_synced_at': grant.financial_synced_at.isoformat() if getattr(grant, 'financial_synced_at', None) else None,
    }


def get_grant_financials(grant) -> dict:
    """Return `{...normalised, status}` for a grant. Never raises — a Build
    hiccup degrades to the manual/empty shape with an explanatory status."""
    source = grant.financial_source_value() if hasattr(grant, 'financial_source_value') else 'manual'

    if source != 'erp':
        return {**_empty(grant, 'manual'), 'status': 'manual'}

    # ERP source selected.
    from app.services.build_client import get_client, BuildUnavailable
    client = get_client()
    if not client.configured:
        # Mapped to Build but no feed configured yet — inert, show manual shape.
        return {**_empty(grant, 'erp'), 'status': 'erp_unconfigured'}
    try:
        data = client.get_financials(grant.build_ref)
        return {**data, 'status': 'erp'}
    except BuildUnavailable as exc:
        return {**_empty(grant, 'erp'), 'status': f'erp_unavailable:{exc}'}


def build_status() -> dict:
    """Diagnostics for admins: is the Build feed configured?"""
    from app.services.build_client import get_client
    c = get_client()
    return {'configured': c.configured, 'base_url_set': bool(c.base_url), 'api': c.api}

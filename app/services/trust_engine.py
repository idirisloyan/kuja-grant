"""
trust_engine.py — the seam between the grant app and the Kuja Trust engine.

Phase 3 of the Kuja Platform Integration. The grant app currently carries a
*fork* of the due-diligence engine (TrustProfileService, compliance_service,
vc_service). The target is for Trust to be the single engine. This module lets
us cut over safely, one surface at a time, behind an env flag:

    KUJA_TRUST_ENGINE = local  (default) | remote | shadow

  local   — use the grant app's own TrustProfileService (today's behaviour,
            zero external dependency). This is the default so production is
            unchanged until we deliberately switch.
  remote  — call the standalone Trust service; if it's unreachable, fall back
            to local so a grant surface never breaks because Trust is down.
  shadow  — compute BOTH: return local (authoritative for now) but also call
            Trust and log any divergence. This is how we validate parity
            before flipping 'remote' on — "run both in parallel to compare."

TENANT GUARD (multi-tenant safety): only the default Kuja network is wired to
the standalone Kuja Trust app — its NGOs authenticate through Kuja Link and
carry a shared res.partner identity. Every other tenant keeps its own local
engine and must NEVER reach remote Trust, whatever KUJA_TRUST_ENGINE says:
Proximate and Saxansaxo do *community-based* trust, and NEAR runs an admin-led
process. So remote/shadow only ever engage for the 'kuja' tenant; for any other
resolved tenant — or when no tenant is resolved (background jobs) — we fail safe
to local. This makes the engine flag safe to flip globally once identity
backfill lands, without leaking one tenant's delegation into another.

The Trust-Profile read surface (`trust_routes.py`) delegates to
`get_trust_profile()`, so THIS module is the live path for that read — running
in `local` mode by default, i.e. today's behaviour is unchanged. Only the
`remote`/`shadow` branches are inert (env-gated on KUJA_TRUST_ENGINE +
KUJA_TRUST_* creds, and Kuja-tenant-guarded). Other Trust consumers
(compliance, adverse-media, capacity passport, bank verification) still call the
local services directly; folding them behind this engine is future work.
"""

import os
import logging

logger = logging.getLogger('kuja')

_VALID_MODES = ('local', 'remote', 'shadow')


def _mode() -> str:
    """Read the engine mode at call time (so it can be toggled without a code
    change) and fail safe to 'local' for any unrecognised value."""
    mode = (os.environ.get('KUJA_TRUST_ENGINE', 'local') or 'local').strip().lower()
    return mode if mode in _VALID_MODES else 'local'


def _current_network_slug() -> str | None:
    """Slug of the tenant resolved for the current request (set on flask.g by
    the network-resolution middleware), or None when there is no request /
    network context — e.g. a background job. Never raises."""
    try:
        from flask import g
        net = getattr(g, 'network', None)
        if net is not None:
            return getattr(net, 'slug', None)
    except Exception:
        pass
    return None


def _tenant_allows_remote() -> bool:
    """Tenant guard for the Kuja Trust engine.

    True only for the default Kuja network — the sole tenant wired to the
    standalone Kuja Trust app. Proximate/Saxansaxo (community trust), NEAR
    (admin-led process), and any request without a resolved tenant all return
    False and stay on the local engine. Deny-by-default: unknown tenant => no
    remote delegation.
    """
    from app.models.network import DEFAULT_NETWORK_SLUG
    return _current_network_slug() == DEFAULT_NETWORK_SLUG


def _org_ref(org) -> str:
    """The key Trust identifies an org by. Prefer the shared platform identity
    (Odoo res.partner id) once it's populated; fall back to the local org id."""
    ref = getattr(org, 'kuja_partner_id', None)
    if ref:
        return str(ref)
    return str(getattr(org, 'id', '') or '')


def _local_profile(org_id: int):
    """Lazy import to avoid any import-time cycle with the model/service layer."""
    from app.services.trust_profile_service import TrustProfileService
    return TrustProfileService.build(org_id)


def get_trust_profile(org_id: int) -> dict | None:
    """Return the two-pillar Trust Profile for an org, from whichever engine the
    current mode selects. Always safe: on any remote failure we serve local.

    Return shape is the grant app's Trust Profile dict
    ({overall:{score,status}, capacity, diligence, ...}) regardless of source.
    """
    mode = _mode()

    if mode == 'local':
        return _local_profile(org_id)

    # Tenant guard — non-Kuja tenants never delegate to remote Trust, no matter
    # what KUJA_TRUST_ENGINE is set to. This keeps the engine flag safe to flip
    # globally: only the 'kuja' tenant is wired to the standalone Trust app.
    if not _tenant_allows_remote():
        logger.debug(
            'trust_engine: tenant=%s is not the Kuja network; serving local (mode=%s bypassed)',
            _current_network_slug(), mode)
        return _local_profile(org_id)

    # remote / shadow both need the org to resolve a ref
    from app.extensions import db
    from app.models import Organization
    org = db.session.get(Organization, org_id)
    if not org:
        return None

    if mode == 'remote':
        return _remote_or_fallback(org)

    # shadow: local is authoritative, remote is observed
    local = _local_profile(org_id)
    _shadow_compare(org, local)
    return local


def _remote_or_fallback(org) -> dict | None:
    from app.services.trust_client import get_client, TrustUnavailable
    client = get_client()
    if not client.configured:
        logger.warning('trust_engine: mode=remote but Trust client is not configured; serving local')
        return _local_profile(org.id)
    try:
        return client.get_trust_profile(_org_ref(org))
    except TrustUnavailable as exc:
        logger.warning('trust_engine: remote profile unavailable (%s); serving local for org %s',
                       exc, org.id)
        return _local_profile(org.id)


def _shadow_compare(org, local: dict | None) -> None:
    """Fetch the remote profile and log any divergence from local. Never raises,
    never changes the returned value — purely observational parity checking."""
    from app.services.trust_client import get_client, TrustUnavailable
    client = get_client()
    if not client.configured:
        return
    try:
        remote = client.get_trust_profile(_org_ref(org))
    except TrustUnavailable as exc:
        logger.info('trust_engine[shadow]: remote unavailable for org %s (%s)', org.id, exc)
        return

    lo = (local or {}).get('overall', {}) or {}
    ro = (remote or {}).get('overall', {}) or {}
    l_score, r_score = lo.get('score'), ro.get('score')
    l_status, r_status = lo.get('status'), ro.get('status')

    diverged = (l_status != r_status) or (
        isinstance(l_score, (int, float)) and isinstance(r_score, (int, float))
        and abs(l_score - r_score) > 1  # allow 1pt rounding drift
    )
    level = logger.warning if diverged else logger.info
    level('trust_engine[shadow] org=%s parity=%s local=%s/%s remote=%s/%s',
          org.id, 'DIVERGED' if diverged else 'match',
          l_score, l_status, r_score, r_status)


def engine_status() -> dict:
    """Small health surface for an admin/diagnostics view: which mode, is the
    remote configured, and is it reachable right now."""
    from app.services.trust_client import get_client
    client = get_client()
    reachable = client.health() if client.configured else False
    mode = _mode()
    tenant_slug = _current_network_slug()
    allows_remote = _tenant_allows_remote()
    # What this tenant would ACTUALLY use right now: the configured mode unless
    # the tenant guard forces it back to local.
    effective_mode = mode if (mode == 'local' or allows_remote) else 'local'
    return {
        'mode': mode,
        'effective_mode': effective_mode,
        'tenant_slug': tenant_slug,
        'tenant_allows_remote': allows_remote,
        'remote_configured': client.configured,
        'remote_reachable': reachable,
        'base_url_set': bool(client.base_url),
    }

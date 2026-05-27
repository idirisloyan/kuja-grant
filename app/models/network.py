"""Network model — Phase 32 (May 2026).

Top-level tenant in Kuja's multi-tenant model. A Network is the
operating identity of a grant-making body (Kuja Marketplace itself,
NEAR Network, Resilio Fund, future similar). Every other tenant-
scoped entity (Organization, Grant, Application, Fund, etc.) will
eventually carry a network_id; Phase 32 just creates the entity and
the default 'Kuja Marketplace' row so the rest can backfill safely.

Branding lives on the Network row: logo url, brand colour, name,
home url. The host-header middleware resolves the request to a
Network by matching the Host header against host_aliases (JSON
list of subdomains/custom domains) and attaches it to g.network for
the duration of the request.

Governance config also lives here: oversight_body_min_signers for
later emergency-declaration workflow (Phase 35), membership_review_days
for Phase 33 SLA tracking, default_assessment_framework for the
mandatory capacity-assessment gate at membership time.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


# The default network slug — used when no host header matches. Phase 32
# seeds this row via migration so the platform continues to work in
# 'single-tenant looking' mode for the existing Kuja marketplace.
DEFAULT_NETWORK_SLUG = "kuja"


class Network(db.Model):
    """Top-level tenant (Kuja Marketplace, NEAR Network, Resilio Fund, ...)."""

    __tablename__ = "networks"
    __table_args__ = (
        db.Index("ix_networks_slug", "slug", unique=True),
    )

    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(60), nullable=False, unique=True)
    name = db.Column(db.String(160), nullable=False)
    mission_short = db.Column(db.String(500), nullable=True)

    # Branding
    brand_logo_url = db.Column(db.String(500), nullable=True)
    brand_color_hex = db.Column(db.String(7), nullable=True)  # e.g. '#C2410C'
    default_language = db.Column(db.String(10), nullable=False, default="en")
    home_url = db.Column(db.String(500), nullable=True)

    # Routing — JSON list of host headers that resolve to this network.
    # Example: ['near.kuja.org', 'app.near.ngo'] for NEAR. The default
    # Kuja Marketplace network catches anything not matched.
    host_aliases = db.Column(db.Text, nullable=True)  # JSON list[str]

    # Governance + workflow defaults
    oversight_body_min_signers = db.Column(db.Integer, nullable=False, default=2)
    membership_review_days = db.Column(db.Integer, nullable=False, default=60)
    default_assessment_framework = db.Column(db.String(40), nullable=True)
    # Optional display override for the framework name on this network
    # (the framework key stays internally stable as 'kuja' so existing
    # data and tests don't break — only the display label varies).
    assessment_framework_display = db.Column(db.String(80), nullable=True)
    default_currency = db.Column(db.String(10), nullable=False, default="USD")

    # Feature toggles per-network (lets us roll features out without env vars)
    features = db.Column(db.Text, nullable=True)  # JSON dict

    # Phase 33 — membership configuration. Both stored as JSON to keep the
    # network table thin; helpers below decode + give sensible defaults.
    eligibility_questions_json = db.Column(db.Text, nullable=True)
    required_documents_config_json = db.Column(db.Text, nullable=True)
    # Periodic due-diligence cadence (months). 24 = re-assess every 2 years.
    assessment_refresh_months = db.Column(
        db.Integer, nullable=False, default=24,
    )

    is_default = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # --- JSON helpers ---
    def get_host_aliases(self) -> list[str]:
        val = _json_load(self.host_aliases)
        return val if isinstance(val, list) else []

    def set_host_aliases(self, value) -> None:
        self.host_aliases = _json_dump(value or [])

    def get_features(self) -> dict:
        val = _json_load(self.features)
        return val if isinstance(val, dict) else {}

    def set_features(self, value) -> None:
        self.features = _json_dump(value or {})

    def feature_enabled(self, key: str, *, default: bool = False) -> bool:
        return bool(self.get_features().get(key, default))

    # --- Membership configuration helpers ---
    # Defaults model NEAR's actual onboarding (5 yes/no questions + a fixed
    # required-document list). Networks can override per-row.
    DEFAULT_ELIGIBILITY_QUESTIONS = [
        {"key": "registered_nonprofit", "label": "Is your organisation a registered non-profit?", "required": True},
        {"key": "global_south_hq", "label": "Is your HQ in a non-OECD-DAC country?", "required": True},
        {"key": "locally_rooted", "label": "Is your governance + leadership locally rooted?", "required": True},
        {"key": "governance_docs", "label": "Do you have governance documents (bylaws, board minutes)?", "required": True},
        {"key": "code_of_conduct", "label": "Do you have a code of conduct or safeguarding policy?", "required": True},
    ]
    DEFAULT_REQUIRED_DOCUMENTS = [
        {"key": "registration_cert", "label": "Registration certificate", "required": True},
        {"key": "bylaws", "label": "Bylaws / governing instrument", "required": True},
        {"key": "board_list_passports", "label": "Board list with passport copies", "required": True},
        {"key": "code_of_conduct", "label": "Code of conduct", "required": True},
        {"key": "latest_audit", "label": "Latest audited financial statement", "required": True},
        {"key": "latest_annual_report", "label": "Latest annual report", "required": True},
        {"key": "reference_letter_1", "label": "Reference letter #1 (from donor/network/INGO/NEAR member)", "required": True},
        {"key": "reference_letter_2", "label": "Reference letter #2 (from donor/network/INGO/NEAR member)", "required": True},
    ]

    def get_eligibility_questions(self) -> list[dict]:
        val = _json_load(self.eligibility_questions_json)
        return val if isinstance(val, list) and val else list(self.DEFAULT_ELIGIBILITY_QUESTIONS)

    def set_eligibility_questions(self, value) -> None:
        self.eligibility_questions_json = _json_dump(value or [])

    def get_required_documents(self) -> list[dict]:
        val = _json_load(self.required_documents_config_json)
        return val if isinstance(val, list) and val else list(self.DEFAULT_REQUIRED_DOCUMENTS)

    def set_required_documents(self, value) -> None:
        self.required_documents_config_json = _json_dump(value or [])

    # --- Public dict ---
    def to_dict(self, *, include_governance: bool = False) -> dict:
        data = {
            "id": self.id,
            "slug": self.slug,
            "name": self.name,
            "mission_short": self.mission_short,
            "brand_logo_url": self.brand_logo_url,
            "brand_color_hex": self.brand_color_hex,
            "default_language": self.default_language,
            "home_url": self.home_url,
            "default_currency": self.default_currency,
            "is_default": self.is_default,
            "is_active": self.is_active,
            "assessment_framework_display": self.assessment_framework_display,
            "features": self.get_features(),
        }
        if include_governance:
            data.update({
                "oversight_body_min_signers": self.oversight_body_min_signers,
                "membership_review_days": self.membership_review_days,
                "default_assessment_framework": self.default_assessment_framework,
                "host_aliases": self.get_host_aliases(),
            })
        return data

    # --- Lookups ---
    @classmethod
    def get_default(cls):
        """Return the default network (slug = 'kuja'). Used when no host
        header matches. Cached in-process per request via g.network."""
        return cls.query.filter_by(slug=DEFAULT_NETWORK_SLUG).first()

    @classmethod
    def resolve_from_host(cls, host: str | None):
        """Match the request host header to a Network. Returns the
        default network if no match. Match strategy:
            1. Exact host_aliases match (case-insensitive)
            2. Subdomain prefix match (e.g. 'near' in 'near.kuja.org' → NEAR)
            3. Default network as fallback
        """
        if not host:
            return cls.get_default()

        host_lower = host.lower().split(":", 1)[0]  # strip port

        # Strategy 1 — exact host_aliases match.
        # We can't index a JSON-text column, so we scan; the network
        # count is small (< 50 even at scale) and the result is cached
        # per-request anyway.
        for net in cls.query.filter_by(is_active=True).all():
            if host_lower in [a.lower() for a in net.get_host_aliases()]:
                return net

        # Strategy 2 — subdomain prefix match against slug.
        # e.g. 'near.kuja.org' → first segment 'near' → Network.slug = 'near'
        first_segment = host_lower.split(".", 1)[0]
        net = cls.query.filter_by(slug=first_segment, is_active=True).first()
        if net:
            return net

        # Strategy 3 — default.
        return cls.get_default()

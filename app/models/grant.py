"""Grant model - Grant opportunities posted by donors."""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump, iso_utc


class Grant(db.Model):
    """Grant opportunities posted by donors."""
    __tablename__ = 'grants'
    __table_args__ = (
        db.Index('ix_grants_donor_status', 'donor_org_id', 'status'),
    )

    id = db.Column(db.Integer, primary_key=True)
    donor_org_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    title = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text, nullable=True)
    total_funding = db.Column(db.Numeric(12, 2), nullable=True)
    currency = db.Column(db.String(10), default='USD')
    deadline = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(50), default='draft', index=True)  # draft, open, review, closed, awarded
    sectors = db.Column(db.Text, nullable=True)          # JSON array
    countries = db.Column(db.Text, nullable=True)         # JSON array
    eligibility = db.Column(db.Text, nullable=True)       # JSON array of requirement objects
    criteria = db.Column(db.Text, nullable=True)          # JSON array of criterion objects
    doc_requirements = db.Column(db.Text, nullable=True)  # JSON array
    reporting_requirements = db.Column(db.Text, nullable=True)  # JSON array of reporting requirement objects
    grant_document = db.Column(db.String(500), nullable=True)  # stored filename of the actual grant document
    report_template = db.Column(db.Text, nullable=True)  # JSON - template structure for NGO reports
    reporting_frequency = db.Column(db.String(50), nullable=True)  # monthly, quarterly, semi-annual, annual, final_only
    # Phase 34 — optional link to the FundWindow this grant was issued
    # under (NEAR Change Fund / Emergency Response, etc.). Nullable so
    # marketplace grants (which don't belong to a fund window) keep
    # working unchanged.
    fund_window_id = db.Column(db.Integer, db.ForeignKey('fund_windows.id'), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))
    published_at = db.Column(db.DateTime, nullable=True)

    # --- Kuja Build financial-source binding (per grant) ------------------
    # Where this grant's financials come from. 'manual' (default) = uploaded
    # reports; 'erp' = pulled from the operator's Kuja Build via build_ref.
    # build_ref is the Build analytic-account / project id — the ONLY key the
    # feed queries, resolved server-side (isolation by record). Tenant-agnostic:
    # Kuja and the networked tenants (Proximate/Saxansaxo) share this contract.
    # Inert until a BuildClient is configured — 'erp' with no client just falls
    # back to the empty/manual shape. See docs/KUJA_BUILD_NETWORKED_TENANTS_INTEGRATION.md.
    financial_source = db.Column(db.String(16), default='manual')   # 'erp' | 'manual'
    build_ref = db.Column(db.String(128), nullable=True, index=True)
    financial_synced_at = db.Column(db.DateTime, nullable=True)

    # Relationships
    applications = db.relationship('Application', backref='grant', lazy='dynamic')

    def financial_source_value(self) -> str:
        """Normalised source, deny-nothing default of 'manual'."""
        v = (self.financial_source or 'manual').strip().lower()
        return v if v in ('erp', 'manual') else 'manual'

    # --- JSON helpers ---
    def get_sectors(self):
        return _json_load(self.sectors) or []

    def set_sectors(self, value):
        self.sectors = _json_dump(value)

    def get_countries(self):
        return _json_load(self.countries) or []

    def set_countries(self, value):
        self.countries = _json_dump(value)

    def get_eligibility(self):
        return _json_load(self.eligibility) or []

    def set_eligibility(self, value):
        self.eligibility = _json_dump(value)

    def get_criteria(self):
        # Normalize every criterion to carry a stable `key` (non-destructive,
        # on read). Historically criteria were stored with an `id` (e.g.
        # 'approach') and NO `key`, but the whole frontend — the apply wizard
        # (responses[c.key]) and the reviewer scorer (scores[c.key]) — indexes
        # by `key`. With `key` undefined, EVERY criterion collapsed to the same
        # slot: the manual per-criterion scorer coupled all scores into one,
        # and per-criterion responses/scores could not be told apart. Deriving
        # key := key or id or criterion_<i> gives each criterion a distinct,
        # stable handle that also matches the id-keyed data already on disk.
        raw = _json_load(self.criteria) or []
        out = []
        for i, c in enumerate(raw):
            if isinstance(c, dict) and not c.get('key'):
                c = {**c, 'key': c.get('id') or f'criterion_{i}'}
            out.append(c)
        return out

    def set_criteria(self, value):
        self.criteria = _json_dump(value)

    def get_doc_requirements(self):
        return _json_load(self.doc_requirements) or []

    def set_doc_requirements(self, value):
        self.doc_requirements = _json_dump(value)

    def get_reporting_requirements(self):
        return _json_load(self.reporting_requirements) or []

    def set_reporting_requirements(self, value):
        self.reporting_requirements = _json_dump(value)

    def get_report_template(self):
        return _json_load(self.report_template) or {}

    def set_report_template(self, value):
        self.report_template = _json_dump(value)

    def to_dict(self, summary=False):
        data = {
            'id': self.id,
            'donor_org_id': self.donor_org_id,
            'title': self.title,
            'description': self.description,
            'total_funding': float(self.total_funding) if self.total_funding else None,
            'currency': self.currency,
            'deadline': self.deadline.isoformat() if self.deadline else None,
            'status': self.status,
            'financial_source': self.financial_source_value(),
            'build_ref': self.build_ref,
            'financial_synced_at': iso_utc(self.financial_synced_at),
            'sectors': self.get_sectors(),
            'countries': self.get_countries(),
            'created_at': iso_utc(self.created_at),
            'published_at': iso_utc(self.published_at),
            'updated_at': iso_utc(self.updated_at),
        }
        if not summary:
            data['eligibility'] = self.get_eligibility()
            data['criteria'] = self.get_criteria()
            data['doc_requirements'] = self.get_doc_requirements()
            data['reporting_requirements'] = self.get_reporting_requirements()
            data['grant_document'] = self.grant_document
            data['report_template'] = self.get_report_template()
            data['reporting_frequency'] = self.reporting_frequency
        # Include donor org name if loaded
        if self.donor_org:
            data['donor_org_name'] = self.donor_org.name
        return data

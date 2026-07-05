"""Proximate FSP registry — Phase 639 (June 2026).

The Sudan pilot's design doc §3 makes hawala and mobile money
first-class disbursement vehicles alongside conventional banks. In
active conflict, the banking network is often the LAST place that
works — hawala (informal value transfer through brokerage networks)
and mobile money (SDG-denominated wallets) reach areas where banks
have evacuated or never operated.

Two tables:

  FinancialServiceProvider — a registered FSP, scoped to the
    Proximate network. Has a kind (bank / hawala / mobile_money),
    name, country, locality. The OB maintains this list.

  PartnerDisbursementMethod — a (partner, FSP) pair with the
    identifier that route a disbursement through. Shape of the
    identifier depends on FSP kind:
      bank          → account_holder_name + account_number
      hawala        → broker_office (FSP locality) + recipient_phone
      mobile_money  → msisdn (E.164 phone number) + holder_name
    Stored loosely as JSON to keep the schema tight; the model has
    typed helpers.

Disbursement workflow not in scope here; this is just the registry.
The intervention/suspend flow on the partner already gates whether
the partner can receive a disbursement at all.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


FSP_KINDS = ("bank", "hawala", "mobile_money")
METHOD_STATUSES = ("active", "inactive", "verified", "unverified")


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---- FinancialServiceProvider ----------------------------------------

class FinancialServiceProvider(db.Model):
    """A registered FSP. The OB curates this list per Proximate
    network — Sudan starts with a handful of trusted hawala brokers
    and the 2 major MNO mobile-money operators (Sudani, Zain)."""

    __tablename__ = 'proximate_fsps'
    __table_args__ = (
        db.Index('ix_proximate_fsps_network_kind', 'network_id', 'kind'),
        db.UniqueConstraint(
            'network_id', 'name',
            name='uq_proximate_fsp_name_per_network',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'),
        nullable=False, index=True,
    )

    name = db.Column(db.String(160), nullable=False)
    name_ar = db.Column(db.String(160), nullable=True)
    kind = db.Column(db.String(40), nullable=False)
    country = db.Column(db.String(80), nullable=False, default='SD')
    locality = db.Column(db.String(120), nullable=True)

    # Free-form metadata — hawala brokers may have a contact phone /
    # operating-hours window; MNOs may have a settlement window etc.
    notes = db.Column(db.Text, nullable=True)

    # Phase 716 DD sweep — hawala brokers and MNOs are screened against
    # sanctions lists at registration, same as partners.
    sanctions_flag = db.Column(db.Boolean, nullable=True, default=False)
    sanctions_checked_at = db.Column(db.DateTime, nullable=True)
    sanctions_summary_json = db.Column(db.Text, nullable=True)

    is_active = db.Column(db.Boolean, nullable=False, default=True)

    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'network_id': self.network_id,
            'name': self.name,
            'name_ar': self.name_ar,
            'kind': self.kind,
            'country': self.country,
            'locality': self.locality,
            'notes': self.notes,
            'is_active': self.is_active,
        }


# ---- PartnerDisbursementMethod ---------------------------------------

class PartnerDisbursementMethod(db.Model):
    """Link table — (partner × FSP) with the identifier that routes a
    disbursement. Schema-light; the identifier JSON shape depends on
    the FSP kind. Helpers normalise display + sanity checks."""

    __tablename__ = 'proximate_partner_disbursement_methods'
    __table_args__ = (
        db.Index(
            'ix_proximate_disbursement_partner',
            'partner_id', 'status',
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    partner_id = db.Column(
        db.Integer, db.ForeignKey('proximate_partners.id'),
        nullable=False, index=True,
    )
    fsp_id = db.Column(
        db.Integer, db.ForeignKey('proximate_fsps.id'),
        nullable=False, index=True,
    )

    # JSON identifier per FSP kind. Examples:
    #   bank         {"account_holder_name": "Halawa Relief Block",
    #                 "account_number": "SD123456789"}
    #   hawala       {"broker_office": "Gedaref Souq #4",
    #                 "recipient_phone": "+249912345678",
    #                 "recipient_name": "Fatima Ali"}
    #   mobile_money {"msisdn": "+249911223344",
    #                 "holder_name": "Halawa Relief Block"}
    identifier_json = db.Column(db.Text, nullable=True)

    status = db.Column(
        db.String(40), nullable=False, default='unverified', index=True,
    )

    # Char-for-char verification flag for bank kinds (mirrors the
    # ProximatePartner.bank_verified_at logic — but now per method).
    verified_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    def get_identifier(self) -> dict:
        val = _json_load(self.identifier_json)
        return val if isinstance(val, dict) else {}

    def set_identifier(self, value) -> None:
        self.identifier_json = _json_dump(value or {})

    def display_identifier(self) -> str:
        """Short human-readable label for the method, e.g.
        'Halawa Relief Block — Bank of Khartoum • SD123456789'."""
        ident = self.get_identifier()
        fsp = FinancialServiceProvider.query.get(self.fsp_id)
        if not fsp:
            return '(orphan)'
        if fsp.kind == 'bank':
            holder = ident.get('account_holder_name', '?')
            acct = ident.get('account_number', '?')
            return f'{holder} — {fsp.name} • {acct}'
        if fsp.kind == 'hawala':
            office = ident.get('broker_office') or fsp.locality or fsp.name
            phone = ident.get('recipient_phone', '?')
            return f'{fsp.name} @ {office} • {phone}'
        if fsp.kind == 'mobile_money':
            msisdn = ident.get('msisdn', '?')
            return f'{fsp.name} • {msisdn}'
        return f'{fsp.name} ({fsp.kind})'

    def to_dict(self) -> dict:
        fsp = FinancialServiceProvider.query.get(self.fsp_id)
        return {
            'id': self.id,
            'partner_id': self.partner_id,
            'fsp': fsp.to_dict() if fsp else None,
            'identifier': self.get_identifier(),
            'display': self.display_identifier(),
            'status': self.status,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
        }

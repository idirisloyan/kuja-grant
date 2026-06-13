"""Emergency Declaration models — Phase 36 (May 2026).

The big workflow that ties Phases 32-35 together:

  Network (32) → Fund (34) → FundWindow (34) → EmergencyDeclaration
                                                    ├── DeclarationSignature × N
                                                    └── DeclarationDocument × N

State machine:
  draft        → in_review  (drafter submits for signature)
  in_review    → signed_active   (threshold of signatures reached, no rejections)
  in_review    → cancelled  (any signer rejects, OR drafter withdraws)
  signed_active → closed    (all grants under the declaration complete)

Multi-signature rules:
  - Network.oversight_body_min_signers signers required.
  - Each signer must affirm declared_no_coi=True at sign time (NEAR governance).
  - Recusals (declared_no_coi=False) DON'T count toward threshold but
    don't block either; the chain continues.
  - Any signer's reject() flips the whole declaration to cancelled.

SLA tracking (per NEAR's IKEA-concept 72hr / 6-day commitment):
  declared_at < applications_open_at < applications_close_at (≤72h later)
  decision_at ≤ declared_at + 6 days

Audit chain: every transition + every signature attempt is anchored.
The signed_active_audit_id pins the activation moment immutably.
"""

from datetime import datetime, timezone

from app.extensions import db
from app.utils.helpers import _json_load, _json_dump


DECLARATION_STATUSES = (
    "draft",          # being drafted; no signatures yet
    "in_review",      # signature chain in progress
    "signed_active",  # threshold reached; grants created
    "cancelled",      # withdrawn or rejected by a signer
    "closed",         # all grants under it complete
)

SIGNATURE_STATUSES = (
    "pending",        # not yet acted
    "signed",         # affirmed (no COI)
    "recused",        # opted out (COI declared)
    "rejected",       # actively rejected the declaration
)

SIGNATURE_METHODS = ("totp", "webauthn", "manual_admin")

DOCUMENT_KINDS = (
    "situation_report",
    "needs_assessment",
    "government_declaration",
    "partner_intel",
    "other",
)


# ===============================================================
# EmergencyDeclaration
# ===============================================================

class EmergencyDeclaration(db.Model):
    """A network's emergency declaration. Multi-sig + audit-anchored."""

    __tablename__ = "emergency_declarations"
    __table_args__ = (
        db.Index(
            "ix_emergency_decl_network_status",
            "network_id", "status",
        ),
        db.Index(
            "ix_emergency_decl_window",
            "window_id",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(db.Integer, db.ForeignKey("networks.id"), nullable=False)
    fund_id = db.Column(db.Integer, db.ForeignKey("funds.id"), nullable=False)
    window_id = db.Column(
        db.Integer, db.ForeignKey("fund_windows.id"), nullable=False,
    )
    evidence_row_id = db.Column(
        db.Integer, db.ForeignKey("crisis_monitoring_rows.id"),
        nullable=True,
    )
    evidence_report_id = db.Column(
        db.Integer, db.ForeignKey("crisis_monitoring_reports.id"),
        nullable=True,
    )

    title = db.Column(db.String(300), nullable=False)
    crisis_type = db.Column(db.String(80), nullable=True)
    region = db.Column(db.String(120), nullable=True)
    country = db.Column(db.String(3), nullable=True)
    severity = db.Column(db.String(40), nullable=True)
    summary_md = db.Column(db.Text, nullable=True)
    proposed_total_amount = db.Column(db.Numeric(14, 2), nullable=True)
    shortlisted_org_ids_json = db.Column(db.Text, nullable=True)

    status = db.Column(db.String(40), nullable=False, default="draft")
    status_reason = db.Column(db.String(500), nullable=True)

    # SLA timestamps
    declared_at = db.Column(db.DateTime, nullable=True)
    applications_open_at = db.Column(db.DateTime, nullable=True)
    applications_close_at = db.Column(db.DateTime, nullable=True)
    decision_at = db.Column(db.DateTime, nullable=True)
    applicants_notified_at = db.Column(db.DateTime, nullable=True)

    signed_active_audit_id = db.Column(db.Integer, nullable=True)

    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    signatures = db.relationship(
        "DeclarationSignature",
        backref="declaration",
        order_by="DeclarationSignature.required_order.asc()",
        cascade="all, delete-orphan",
    )
    documents = db.relationship(
        "DeclarationDocument",
        backref="declaration",
        order_by="DeclarationDocument.created_at.asc()",
        cascade="all, delete-orphan",
    )

    # --- JSON helpers ---
    def get_shortlisted_org_ids(self) -> list[int]:
        val = _json_load(self.shortlisted_org_ids_json)
        return [int(x) for x in val] if isinstance(val, list) else []

    def set_shortlisted_org_ids(self, value) -> None:
        ids = [int(x) for x in (value or []) if str(x).isdigit() or isinstance(x, int)]
        self.shortlisted_org_ids_json = _json_dump(ids)

    # --- Helpers ---
    def signed_count(self) -> int:
        return sum(1 for s in self.signatures if s.status == "signed")

    def rejected_count(self) -> int:
        return sum(1 for s in self.signatures if s.status == "rejected")

    def recused_count(self) -> int:
        return sum(1 for s in self.signatures if s.status == "recused")

    def required_signer_count(self) -> int:
        """Pull the threshold from the parent network."""
        try:
            from app.models import Network
            net = Network.query.get(self.network_id)
            return (net.oversight_body_min_signers or 2) if net else 2
        except Exception:
            return 2

    # --- Audit helper ---
    def _anchor(self, *, action: str, actor_email: str | None,
                details: dict | None = None) -> int | None:
        try:
            from app.models import AuditChainEntry
            entry = AuditChainEntry.append(
                action=action,
                actor_email=actor_email,
                subject_kind="emergency_declaration",
                subject_id=self.id,
                details=details or {},
            )
            return entry.id if entry else None
        except Exception:
            return None

    # --- State-machine transitions ---
    def submit_for_signature(self, *, actor_email: str | None = None) -> bool:
        """draft → in_review. Must have at least required_signer_count
        DeclarationSignature rows already pre-created."""
        if self.status != "draft":
            return False
        if len(self.signatures) < self.required_signer_count():
            return False
        self.status = "in_review"
        self.declared_at = self.declared_at or datetime.now(timezone.utc)
        db.session.flush()
        self._anchor(
            action="emergency.declaration.submitted_for_signature",
            actor_email=actor_email,
            details={
                "network_id": self.network_id,
                "window_id": self.window_id,
                "signer_count": len(self.signatures),
                "required": self.required_signer_count(),
            },
        )
        return True

    def maybe_activate(self, *, actor_email: str | None = None) -> bool:
        """If signed_count >= threshold AND no rejections, transition to
        signed_active. Anchors the activation moment immutably.

        Caller should invoke this after every signature update. Returns
        True iff the declaration actually transitioned this call.
        """
        if self.status != "in_review":
            return False
        if self.rejected_count() > 0:
            return False
        if self.signed_count() < self.required_signer_count():
            return False
        self.status = "signed_active"
        if not self.applications_open_at:
            self.applications_open_at = datetime.now(timezone.utc)
            # Default 72h application window per NEAR's SLA
            from datetime import timedelta
            self.applications_close_at = self.applications_open_at + timedelta(hours=72)
        db.session.flush()
        anchor_id = self._anchor(
            action="emergency.declaration.signed_active",
            actor_email=actor_email,
            details={
                "network_id": self.network_id,
                "window_id": self.window_id,
                "fund_id": self.fund_id,
                "title": self.title,
                "evidence_row_id": self.evidence_row_id,
                "evidence_report_id": self.evidence_report_id,
                "signers": [
                    {"user_id": s.signer_user_id,
                     "method": s.signature_method,
                     "signed_at": s.signed_at.isoformat() if s.signed_at else None}
                    for s in self.signatures if s.status == "signed"
                ],
                "recused": [
                    {"user_id": s.signer_user_id, "reason": s.recusal_reason}
                    for s in self.signatures if s.status == "recused"
                ],
                "documents": [
                    {"id": d.id, "kind": d.kind, "document_id": d.document_id}
                    for d in self.documents
                ],
            },
        )
        if anchor_id:
            self.signed_active_audit_id = anchor_id
        return True

    def cancel(self, *, by_user_id: int, reason: str,
               actor_email: str | None = None) -> bool:
        if self.status not in ("draft", "in_review"):
            return False
        self.status = "cancelled"
        self.status_reason = (reason or "")[:500]
        db.session.flush()
        self._anchor(
            action="emergency.declaration.cancelled",
            actor_email=actor_email,
            details={"reason": self.status_reason, "by_user_id": by_user_id},
        )
        return True

    def close(self, *, actor_email: str | None = None) -> bool:
        if self.status != "signed_active":
            return False
        self.status = "closed"
        db.session.flush()
        self._anchor(
            action="emergency.declaration.closed",
            actor_email=actor_email,
            details={"network_id": self.network_id, "window_id": self.window_id},
        )
        return True

    def to_dict(self, *, include_children: bool = False) -> dict:
        d = {
            "id": self.id,
            "network_id": self.network_id,
            "fund_id": self.fund_id,
            "window_id": self.window_id,
            "evidence_row_id": self.evidence_row_id,
            "evidence_report_id": self.evidence_report_id,
            "title": self.title,
            "crisis_type": self.crisis_type,
            "region": self.region,
            "country": self.country,
            "severity": self.severity,
            "summary_md": self.summary_md,
            "proposed_total_amount": (
                float(self.proposed_total_amount)
                if self.proposed_total_amount is not None else None
            ),
            "shortlisted_org_ids": self.get_shortlisted_org_ids(),
            "status": self.status,
            "status_reason": self.status_reason,
            "declared_at": self.declared_at.isoformat() if self.declared_at else None,
            "applications_open_at": self.applications_open_at.isoformat() if self.applications_open_at else None,
            "applications_close_at": self.applications_close_at.isoformat() if self.applications_close_at else None,
            "decision_at": self.decision_at.isoformat() if self.decision_at else None,
            "applicants_notified_at": self.applicants_notified_at.isoformat() if self.applicants_notified_at else None,
            "signed_active_audit_id": self.signed_active_audit_id,
            "created_by_user_id": self.created_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "signed_count": self.signed_count(),
            "rejected_count": self.rejected_count(),
            "recused_count": self.recused_count(),
            "required_signer_count": self.required_signer_count(),
        }
        if include_children:
            d["signatures"] = [s.to_dict() for s in self.signatures]
            d["documents"] = [doc.to_dict() for doc in self.documents]
        return d


# ===============================================================
# DeclarationSignature
# ===============================================================

class DeclarationSignature(db.Model):
    """One signer's slot on a declaration. COI-aware."""

    __tablename__ = "declaration_signatures"
    __table_args__ = (
        db.UniqueConstraint(
            "declaration_id", "signer_user_id",
            name="uq_one_signature_per_signer_per_declaration",
        ),
        db.Index(
            "ix_decl_signatures_declaration_status",
            "declaration_id", "status",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    declaration_id = db.Column(
        db.Integer, db.ForeignKey("emergency_declarations.id"),
        nullable=False,
    )
    signer_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=False,
    )
    required_order = db.Column(db.Integer, nullable=False, default=0)
    status = db.Column(db.String(40), nullable=False, default="pending")
    signature_method = db.Column(db.String(20), nullable=True)
    declared_no_coi = db.Column(db.Boolean, nullable=True)
    recusal_reason = db.Column(db.String(500), nullable=True)
    rejection_reason = db.Column(db.String(500), nullable=True)
    signed_at = db.Column(db.DateTime, nullable=True)
    auth_token_hint = db.Column(db.String(40), nullable=True)

    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def sign(self, *, method: str, declared_no_coi: bool,
             token_hint: str | None = None) -> bool:
        """Record a signature. Method MUST be one of SIGNATURE_METHODS.
        Phase 36a accepts the method name + token hint; full TOTP/WebAuthn
        verification will be enforced at the route layer.

        If declared_no_coi is False, this transitions to 'recused' instead
        of 'signed' — caller must provide recusal_reason separately.
        """
        if self.status != "pending":
            return False
        if method not in SIGNATURE_METHODS:
            return False
        if not declared_no_coi:
            return False  # use recuse() instead
        self.status = "signed"
        self.signature_method = method
        self.declared_no_coi = True
        self.signed_at = datetime.now(timezone.utc)
        self.auth_token_hint = (token_hint or "")[:40] or None
        db.session.flush()
        return True

    def recuse(self, *, reason: str) -> bool:
        if self.status != "pending":
            return False
        if not reason or not reason.strip():
            return False
        self.status = "recused"
        self.declared_no_coi = False
        self.recusal_reason = reason.strip()[:500]
        self.signed_at = datetime.now(timezone.utc)
        db.session.flush()
        return True

    def reject(self, *, reason: str) -> bool:
        if self.status != "pending":
            return False
        if not reason or not reason.strip():
            return False
        self.status = "rejected"
        self.rejection_reason = reason.strip()[:500]
        self.signed_at = datetime.now(timezone.utc)
        db.session.flush()
        return True

    def to_dict(self) -> dict:
        # Resolve signer name + org for the UI. Best-effort; falls back
        # to 'User #N' if the user row is missing (deleted, etc).
        signer_name = None
        signer_email = None
        signer_org_name = None
        try:
            from app.models import User, Organization
            u = User.query.get(self.signer_user_id) if self.signer_user_id else None
            if u:
                signer_name = u.name
                signer_email = u.email
                if u.org_id:
                    o = Organization.query.get(u.org_id)
                    if o:
                        signer_org_name = o.name
        except Exception:
            pass
        return {
            "id": self.id,
            "declaration_id": self.declaration_id,
            "signer_user_id": self.signer_user_id,
            "signer_name": signer_name,
            "signer_email": signer_email,
            "signer_org_name": signer_org_name,
            "required_order": self.required_order,
            "status": self.status,
            "signature_method": self.signature_method,
            "declared_no_coi": self.declared_no_coi,
            "recusal_reason": self.recusal_reason,
            "rejection_reason": self.rejection_reason,
            "signed_at": self.signed_at.isoformat() if self.signed_at else None,
        }


# ===============================================================
# DeclarationDocument
# ===============================================================

class DeclarationDocument(db.Model):
    """Supporting document attached to a declaration."""

    __tablename__ = "declaration_documents"
    __table_args__ = (
        db.Index("ix_decl_docs_declaration", "declaration_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    declaration_id = db.Column(
        db.Integer, db.ForeignKey("emergency_declarations.id"),
        nullable=False,
    )
    document_id = db.Column(
        db.Integer, db.ForeignKey("documents.id"), nullable=True,
    )
    kind = db.Column(db.String(40), nullable=False, default="other")
    note = db.Column(db.String(500), nullable=True)
    uploaded_by_user_id = db.Column(
        db.Integer, db.ForeignKey("users.id"), nullable=True,
    )
    created_at = db.Column(
        db.DateTime, nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "declaration_id": self.declaration_id,
            "document_id": self.document_id,
            "kind": self.kind,
            "note": self.note,
            "uploaded_by_user_id": self.uploaded_by_user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

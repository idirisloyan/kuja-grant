"""Proximate due-diligence evidence models — Blue Nile round intake
(July 2026).

The first real funding round arrived as a OneDrive folder: ~31 Partner
Information Forms (Arabic + English Word/PDF), one sam.gov screenshot
per organization, a media-verification table, a candidate panel roster,
and a situation-analysis evidence pack (needs assessment, IDP site
factsheets, cluster alert). These models give each of those artifacts a
first-class home so the system — not the folder — is the round's system
of record:

  ProximateAttachment        any evidence file, linked to a partner,
                             round, or crisis signal (SAM screenshots,
                             PIF originals, situation-analysis PDFs)
  ProximateMediaVerification the social-footprint check the field team
                             actually performs (links, follower counts,
                             activity evidence, verdict) — distinct from
                             AdverseMediaScreening, which hunts negative
                             press and is org-scoped to the Kuja tenant
  ProximatePanelCandidate    the per-round panel roster (name, contact,
                             rationale, location) with a small vetting
                             state machine, so panelist PII stops
                             circulating in Word tables
"""

import json
from datetime import datetime, timezone

from app.extensions import db

ATTACHMENT_SUBJECT_KINDS = ('partner', 'round', 'crisis_signal',
                            'panel_candidate', 'disbursement')
ATTACHMENT_KINDS = (
    'pif_original', 'screening_evidence', 'media_evidence',
    'situation_analysis', 'cv', 'payment_confirmation', 'other',
)
MEDIA_VERDICTS = ('positive', 'negative', 'no_footprint', 'inconclusive')
PANEL_STATUSES = ('candidate', 'vetted', 'appointed', 'declined')


class ProximateAttachment(db.Model):
    __tablename__ = 'proximate_attachments'
    __table_args__ = (
        db.Index('ix_prox_attach_subject', 'subject_kind', 'subject_id'),
    )

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )
    subject_kind = db.Column(db.String(20), nullable=False)
    subject_id = db.Column(db.Integer, nullable=False)
    document_id = db.Column(
        db.Integer, db.ForeignKey('documents.id'), nullable=False,
    )
    kind = db.Column(db.String(30), nullable=False, default='other')
    label = db.Column(db.String(300), nullable=True)
    uploaded_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    document = db.relationship('Document', lazy='joined')

    def to_dict(self):
        doc = self.document
        return {
            'id': self.id,
            'subject_kind': self.subject_kind,
            'subject_id': self.subject_id,
            'kind': self.kind,
            'label': self.label,
            'document_id': self.document_id,
            'filename': doc.original_filename if doc else None,
            'file_size': doc.file_size if doc else None,
            'mime_type': doc.mime_type if doc else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class ProximateMediaVerification(db.Model):
    __tablename__ = 'proximate_media_verifications'

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey('proximate_partners.id'),
        nullable=False, index=True,
    )
    links_json = db.Column(db.Text, nullable=True)     # JSON list of URLs
    interaction_summary = db.Column(db.Text, nullable=True)
    external_mention = db.Column(db.String(300), nullable=True)
    responsible_individual_mention = db.Column(db.String(300), nullable=True)
    overall_verdict = db.Column(
        db.String(20), nullable=False, default='no_footprint',
    )
    notes = db.Column(db.Text, nullable=True)
    source = db.Column(db.String(30), nullable=False, default='manual')
    reviewed_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    reviewed_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False,
    )

    def get_links(self):
        try:
            return json.loads(self.links_json or '[]')
        except Exception:
            return []

    def to_dict(self):
        return {
            'id': self.id,
            'partner_id': self.partner_id,
            'links': self.get_links(),
            'interaction_summary': self.interaction_summary,
            'external_mention': self.external_mention,
            'responsible_individual_mention': self.responsible_individual_mention,
            'overall_verdict': self.overall_verdict,
            'notes': self.notes,
            'source': self.source,
            'reviewed_at': self.reviewed_at.isoformat() if self.reviewed_at else None,
        }


# Panel member lifecycle. The table is still called
# `proximate_panel_candidates` because renaming a populated production
# table buys nothing, but the concept is "panel member" throughout the
# UI and the statuses below are the real ones.
PANEL_MEMBER_STATUSES = (
    'candidate',      # proposed, nothing checked yet
    'dd_in_progress',
    'dd_passed',
    'dd_failed',
    'confirmed',      # on the panel; token minted; can endorse partners
    'stood_down',     # left the panel
)


class ProximatePanelCandidate(db.Model):
    """A panel member — someone who endorses partners and votes on awards.

    Named "candidate" for historical reasons. There is no separate
    "endorser" role at Proximate: endorsement is a step in the process
    and panel members are the people who perform it.
    """

    __tablename__ = 'proximate_panel_candidates'

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey('proximate_rounds.id'),
        nullable=True, index=True,
    )
    name = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(40), nullable=True)
    email = db.Column(db.String(320), nullable=True)
    rationale = db.Column(db.Text, nullable=True)
    location = db.Column(db.String(160), nullable=True)
    status = db.Column(db.String(20), nullable=False, default='candidate')
    notes = db.Column(db.Text, nullable=True)

    # ---- Panel member profile (2026-07-24) -----------------------------
    # A panel member is picked for local knowledge and credibility, and
    # the panel as a whole is meant to be diverse across localities and
    # networks. Recording what each person represents is what makes that
    # checkable rather than asserted.
    expertise = db.Column(db.String(300), nullable=True)
    network_represented = db.Column(db.String(200), nullable=True)
    recommended_by = db.Column(db.String(200), nullable=True)
    language = db.Column(db.String(8), nullable=True, default='ar')
    cv_doc_id = db.Column(
        db.Integer, db.ForeignKey('documents.id'), nullable=True,
    )

    # ---- Due diligence ON THE PANEL MEMBER ------------------------------
    # The secretariat vets panel members before they vet anyone else.
    # Same three checks the partners get, plus a free-form slot because
    # the useful signal in Sudan is often something that fits no schema:
    # a local reference, a WhatsApp group, a radio interview.
    sanctions_status = db.Column(db.String(20), nullable=True)
    sanctions_checked_at = db.Column(db.DateTime, nullable=True)
    media_status = db.Column(db.String(20), nullable=True)
    media_checked_at = db.Column(db.DateTime, nullable=True)
    social_status = db.Column(db.String(20), nullable=True)
    social_checked_at = db.Column(db.DateTime, nullable=True)
    social_links_json = db.Column(db.Text, nullable=True)
    # JSON list of {label, result, note, checked_at, checked_by} — the
    # "and any other relevant info" the secretariat asked for.
    other_checks_json = db.Column(db.Text, nullable=True)

    dd_verdict = db.Column(db.String(20), nullable=True)   # clear/low/medium/high/rejected
    dd_notes = db.Column(db.Text, nullable=True)
    dd_completed_at = db.Column(db.DateTime, nullable=True)
    dd_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )

    reference_check_at = db.Column(db.DateTime, nullable=True)
    independent_validation_at = db.Column(db.DateTime, nullable=True)

    # ---- Governance -----------------------------------------------------
    tor_accepted_at = db.Column(db.DateTime, nullable=True)
    coi_declared_at = db.Column(db.DateTime, nullable=True)
    confidentiality_accepted_at = db.Column(db.DateTime, nullable=True)

    # ---- No-login access ------------------------------------------------
    # Panel members work from a phone on a shared handset. They get the
    # same token link partners get: no account, no password, no app.
    # Minted when the member is confirmed onto the panel.
    public_token = db.Column(db.String(64), nullable=True, unique=True, index=True)
    token_issued_at = db.Column(db.DateTime, nullable=True)
    # Shadow Endorser row. Endorsement is a STEP performed by panel
    # members, not a separate role — but the endorsement machinery
    # (COI checks, voice answers, the token portal) is already built
    # against Endorser. Rather than fork it, confirming a panel member
    # mints a linked Endorser row and the UI never mentions the word.
    endorser_id = db.Column(
        db.Integer, db.ForeignKey('proximate_endorsers.id', ondelete='SET NULL'),
        nullable=True, index=True,
    )
    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    created_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False,
    )
    updated_at = db.Column(
        db.DateTime, default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

    # ---- derived --------------------------------------------------------

    @property
    def dd_complete(self) -> bool:
        """Have the three standard checks been run and a verdict recorded?"""
        return bool(
            self.sanctions_status
            and self.media_status
            and self.dd_verdict
        )

    @property
    def dd_passed(self) -> bool:
        return self.dd_verdict in ('clear', 'low', 'medium')

    @property
    def can_be_confirmed(self) -> bool:
        """Ready to sit on the panel and start endorsing partners.

        Due diligence must have PASSED, not merely been run. A member who
        came back 'high' or 'rejected' is deliberately not confirmable
        from the UI — that needs a human decision recorded somewhere it
        can be seen, not a checkbox nobody remembers ticking.
        """
        return self.dd_complete and self.dd_passed

    def other_checks(self) -> list:
        import json
        try:
            v = json.loads(self.other_checks_json) if self.other_checks_json else []
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def social_links(self) -> list:
        import json
        try:
            v = json.loads(self.social_links_json) if self.social_links_json else []
            return v if isinstance(v, list) else []
        except (ValueError, TypeError):
            return []

    def to_dict(self, include_contact=True):
        d = {
            'id': self.id,
            'round_id': self.round_id,
            'name': self.name,
            'rationale': self.rationale,
            'location': self.location,
            'status': self.status,
            'notes': self.notes,
            'expertise': self.expertise,
            'network_represented': self.network_represented,
            'recommended_by': self.recommended_by,
            'language': self.language or 'ar',
            'has_cv': bool(self.cv_doc_id),
            # Due diligence
            'sanctions_status': self.sanctions_status,
            'sanctions_checked_at': (
                self.sanctions_checked_at.isoformat()
                if self.sanctions_checked_at else None
            ),
            'media_status': self.media_status,
            'media_checked_at': (
                self.media_checked_at.isoformat()
                if self.media_checked_at else None
            ),
            'social_status': self.social_status,
            'social_links': self.social_links(),
            'other_checks': self.other_checks(),
            'dd_verdict': self.dd_verdict,
            'dd_notes': self.dd_notes,
            'dd_complete': self.dd_complete,
            'dd_passed': self.dd_passed,
            'can_be_confirmed': self.can_be_confirmed,
            'dd_completed_at': (
                self.dd_completed_at.isoformat() if self.dd_completed_at else None
            ),
            # Governance
            'tor_accepted': bool(self.tor_accepted_at),
            'coi_declared': bool(self.coi_declared_at),
            'confidentiality_accepted': bool(self.confidentiality_accepted_at),
            'reference_checked': bool(self.reference_check_at),
            'independently_validated': bool(self.independent_validation_at),
            'has_link': bool(self.public_token),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        # Contact PII is OB-surface-only; callers for any other audience
        # pass include_contact=False. The token is contact-grade too — it
        # IS the credential, so it never travels with a public payload.
        if include_contact:
            d['phone'] = self.phone
            d['email'] = self.email
            d['public_token'] = self.public_token
        return d

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


class ProximatePanelCandidate(db.Model):
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

    def to_dict(self, include_contact=True):
        d = {
            'id': self.id,
            'round_id': self.round_id,
            'name': self.name,
            'rationale': self.rationale,
            'location': self.location,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        # Contact PII is OB-surface-only; callers for any other audience
        # pass include_contact=False.
        if include_contact:
            d['phone'] = self.phone
            d['email'] = self.email
        return d

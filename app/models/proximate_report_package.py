"""Proximate partner report packages — July 2026.

The problem: the pilot's Microsoft-Forms reporting produced rich answers
but unusable data — free-text money, inverted dates, and (Forms can't
take attachments) all photos/receipts arriving loose over WhatsApp.
Donors got an Excel, not a report.

The model: one REPORT PACKAGE per partner per round, filled from a phone
over days via a reusable token link (same zero-login pattern as every
other Proximate token URL):

  - structured core stays SMALL and VALID: people reached +
    disaggregation as numbers, spend as numbers per approved budget
    line (compared against the ProximateApprovedActivity schedule);
  - the qualitative depth comes from per-question VOICE NOTES and
    captioned media items (photos, videos, receipts, docs) added to an
    evidence shelf as implementation happens;
  - every media item defaults to internal-only. During review the OB
    explicitly marks items donor-visible — a safeguarding gate, not an
    afterthought (beneficiary photos in a conflict zone);
  - AI compiles a bilingual narrative the OB edits; publish puts the
    package on the donor dashboard. draft -> submitted ->
    changes_requested -> published, every transition audit-chained.
"""

from datetime import datetime, timezone
import json
import secrets

from app.extensions import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_package_token() -> str:
    return secrets.token_hex(16)


# Budget lines mirroring the paper report the field team already uses.
DEFAULT_BUDGET_LINES = (
    'Personnel', 'Supplies & Materials', 'Transport & Logistics',
    'Direct Beneficiary Support', 'Admin / Overheads',
)

# The voice questions — carried over from the pilot's best form
# questions. Partners ANSWER BY SPEAKING; Whisper + the compiler turn
# transcripts into narrative. Keys are stable — UI + compiler share them.
VOICE_QUESTIONS = (
    ('what_happened', 'What did you do, and how?'),
    ('changes_observed', 'What difference did it make?'),
    ('challenges_adaptations', 'What challenges did you face and how did you adapt?'),
    ('community_voice', 'What did the community say — what worked, what worries them, what do they still need?'),
    ('lessons', 'What would you repeat, what would you change, and what support would help you?'),
)

PACKAGE_STATUSES = ('draft', 'submitted', 'changes_requested', 'published')
ITEM_KINDS = ('photo', 'video', 'voice', 'receipt', 'doc', 'other')


class ProximateApprovedActivity(db.Model):
    """One approved activity from the grant agreement — the reporting
    baseline (doc §7: name, description, target population, geography,
    period, budget by line)."""

    __tablename__ = 'proximate_approved_activities'

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey('proximate_rounds.id'),
        nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey('proximate_partners.id'),
        nullable=False, index=True,
    )
    name = db.Column(db.String(300), nullable=False)
    description = db.Column(db.Text, nullable=True)
    target_population = db.Column(db.String(300), nullable=True)
    geographic_area = db.Column(db.String(300), nullable=True)
    period_start = db.Column(db.Date, nullable=True)
    period_end = db.Column(db.Date, nullable=True)
    # [{"label": "Personnel", "amount": 1200}] — approved amounts, USD.
    budget_lines_json = db.Column(db.Text, nullable=False, default='[]')
    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    def get_budget_lines(self):
        try:
            return json.loads(self.budget_lines_json or '[]')
        except Exception:
            return []

    def to_dict(self):
        return {
            'id': self.id,
            'round_id': self.round_id,
            'partner_id': self.partner_id,
            'name': self.name,
            'description': self.description,
            'target_population': self.target_population,
            'geographic_area': self.geographic_area,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'budget_lines': self.get_budget_lines(),
        }


class ProximateReportPackage(db.Model):
    """One partner's report package for one round."""

    __tablename__ = 'proximate_report_packages'

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey('proximate_rounds.id'),
        nullable=False, index=True,
    )
    partner_id = db.Column(
        db.Integer, db.ForeignKey('proximate_partners.id'),
        nullable=False, index=True,
    )
    status = db.Column(db.String(20), nullable=False, default='draft')
    # Reusable (NOT one-shot) — partners add evidence over days/weeks.
    package_token = db.Column(
        db.String(64), unique=True, nullable=False, index=True,
        default=_make_package_token,
    )
    # Structured core, keyed by approved-activity id (or 'general'):
    # {"<activity_id>": {"people_reached": n, "unit": "individuals",
    #   "disaggregation": {"women": n, ...}, "status": "done",
    #   "spend": {"Personnel": n, ...}}, "period_from": iso, ...}
    answers_json = db.Column(db.Text, nullable=False, default='{}')
    spend_currency = db.Column(db.String(8), nullable=False, default='SDG')
    # AI-compiled narrative (OB-editable copies live beside the draft):
    # {"summary_en", "summary_ar", "sections": [{"title_en","title_ar",
    #   "body_en","body_ar"}], "compiled_at", "source"}
    narrative_json = db.Column(db.Text, nullable=True)
    ob_notes = db.Column(db.Text, nullable=True)   # request-changes message
    submitted_at = db.Column(db.DateTime, nullable=True)
    published_at = db.Column(db.DateTime, nullable=True)
    reviewed_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=False,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=_now, onupdate=_now,
    )

    items = db.relationship(
        'ProximateReportItem', backref='package',
        cascade='all, delete-orphan', lazy='selectin',
    )

    def get_answers(self):
        try:
            return json.loads(self.answers_json or '{}')
        except Exception:
            return {}

    def get_narrative(self):
        try:
            return json.loads(self.narrative_json) if self.narrative_json else None
        except Exception:
            return None

    def to_dict(self, include_token=False):
        d = {
            'id': self.id,
            'round_id': self.round_id,
            'partner_id': self.partner_id,
            'status': self.status,
            'answers': self.get_answers(),
            'spend_currency': self.spend_currency,
            'narrative': self.get_narrative(),
            'ob_notes': self.ob_notes,
            'submitted_at': self.submitted_at.isoformat() if self.submitted_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_token:
            d['package_token'] = self.package_token
        return d


class ProximateReportItem(db.Model):
    """One evidence item on the package shelf. donor_visible defaults to
    False — the OB approves each item before a donor ever sees it."""

    __tablename__ = 'proximate_report_items'

    id = db.Column(db.Integer, primary_key=True)
    package_id = db.Column(
        db.Integer,
        db.ForeignKey('proximate_report_packages.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    kind = db.Column(db.String(12), nullable=False, default='other')
    document_id = db.Column(
        db.Integer, db.ForeignKey('documents.id'), nullable=False,
    )
    caption = db.Column(db.String(500), nullable=True)
    # For kind='voice': which VOICE_QUESTIONS key this note answers.
    question_key = db.Column(db.String(40), nullable=True)
    transcript = db.Column(db.Text, nullable=True)
    donor_visible = db.Column(db.Boolean, nullable=False, default=False)
    uploaded_via = db.Column(db.String(12), nullable=False, default='token')
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    document = db.relationship('Document', lazy='joined')

    def to_dict(self):
        doc = self.document
        return {
            'id': self.id,
            'kind': self.kind,
            'caption': self.caption,
            'question_key': self.question_key,
            'transcript': self.transcript,
            'donor_visible': self.donor_visible,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'filename': doc.original_filename if doc else None,
            'mime_type': doc.mime_type if doc else None,
            'file_size': doc.file_size if doc else None,
        }

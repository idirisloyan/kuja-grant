"""Saxansaxo — SCLR micro-grants tenant (July 2026).

Saxansaxo implements Survivor and Community-Led Response (SCLR) in
Somalia: Resilio-funded micro-grants (~USD 5,000) to already-active,
self-organizing community groups, through an 8-step cycle:

    permission → inquiry → proposal → vetting → selected →
    disbursed (≤10 days) → reported → closed

Design posture (docs/Saxansaxo_Automation_Design_July2026.docx):
the system records the story of each DECISION — it never polices
spending. Post-disbursement misuse is a learning loss by SCLR doctrine,
so there are no compliance gates here: no cosign ladders, no receipt
verification, no outcome attestation enforcement. The two quiet
non-negotiables that remain are Adeso-level legal duties: a sanctions
screen on the receiving signatory, and a record of who was paid.

The group's `stage` is COMPUTED from its records (single source of
truth, mirroring the Proximate participant-stage pattern) — the
furthest step with evidence wins.
"""

import json
import secrets
from datetime import datetime, timezone

from app.extensions import db


SAX_STAGES = (
    'permission', 'inquiry', 'proposal', 'vetting', 'not_selected',
    'selected', 'disbursed', 'reported', 'closed',
)
SAX_OUTCOME_TAGS = ('delivered', 'partial', 'learning_loss')
SAX_DISBURSE_SLA_DAYS = 10


def _utcnow():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat() if dt else None


def _loads(raw):
    try:
        return json.loads(raw) if raw else {}
    except Exception:
        return {}


class SaxOpsMember(db.Model):
    """Who may operate the Saxansaxo console. Deny-by-default and
    network-explicit (the Batch-0 lesson from Proximate): platform
    admins do NOT auto-pass; a row here is the only key."""
    __tablename__ = 'sax_ops_members'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'),
                        nullable=False, unique=True)
    added_at = db.Column(db.DateTime, default=_utcnow)


class SaxFund(db.Model):
    """A funding envelope (e.g. Resilio 2026). Committed/disbursed are
    rolled up from grants so the envelope can never silently overspend."""
    __tablename__ = 'sax_funds'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    donor_name = db.Column(db.String(200), nullable=False, default='Resilio')
    total_usd = db.Column(db.Float, nullable=False, default=0.0)
    created_at = db.Column(db.DateTime, default=_utcnow)

    grants = db.relationship('SaxGrant', backref='fund', lazy='dynamic')

    def to_dict(self):
        committed = sum(g.amount_usd or 0 for g in self.grants)
        disbursed = sum(g.amount_usd or 0 for g in self.grants
                        if g.disbursed_at is not None)
        return {
            'id': self.id, 'name': self.name, 'donor_name': self.donor_name,
            'total_usd': self.total_usd, 'committed_usd': committed,
            'disbursed_usd': disbursed,
            'remaining_usd': round((self.total_usd or 0) - committed, 2),
            'created_at': _iso(self.created_at),
        }


class SaxGroup(db.Model):
    """A self-organizing community group. Created only once permission
    from the local gatekeeper is in hand — permission is the
    precondition for every subsequent step (SCLR step 1)."""
    __tablename__ = 'sax_groups'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    name_so = db.Column(db.String(255))
    locality = db.Column(db.String(255), nullable=False)
    region = db.Column(db.String(120))
    description = db.Column(db.Text)
    contact_name = db.Column(db.String(200))
    contact_phone = db.Column(db.String(60))
    contact_email = db.Column(db.String(200))
    created_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=_utcnow)

    permission = db.relationship('SaxPermission', backref='group',
                                 uselist=False, lazy='joined')
    inquiry = db.relationship('SaxInquiry', backref='group',
                              uselist=False, lazy='joined')
    proposal = db.relationship('SaxProposal', backref='group',
                               uselist=False, lazy='joined')
    vetting = db.relationship('SaxVetting', backref='group',
                              uselist=False, lazy='joined')
    grants = db.relationship('SaxGrant', backref='group', lazy='select',
                             order_by='SaxGrant.id')

    @property
    def stage(self):
        """Furthest completed step wins. Terminal branches: a
        not_selected vetting decision parks the group there (it can be
        re-vetted later — a new decision replaces the old stage)."""
        latest_grant = self.grants[-1] if self.grants else None
        if latest_grant is not None:
            if latest_grant.outcome_tag:
                return 'closed'
            if latest_grant.report is not None:
                return 'reported'
            if latest_grant.disbursed_at is not None:
                return 'disbursed'
            return 'selected'
        if self.vetting is not None:
            if self.vetting.decision == 'selected':
                return 'selected'
            if self.vetting.decision == 'not_selected':
                return 'not_selected'
            return 'vetting'
        if self.proposal is not None and self.proposal.submitted_at:
            return 'vetting'
        if self.proposal is not None:
            return 'proposal'
        if self.inquiry is not None:
            return 'inquiry'
        return 'permission'

    def to_dict(self, deep=False):
        d = {
            'id': self.id, 'name': self.name, 'name_so': self.name_so,
            'locality': self.locality, 'region': self.region,
            'description': self.description,
            'contact_name': self.contact_name,
            'contact_phone': self.contact_phone,
            'contact_email': self.contact_email,
            'stage': self.stage,
            'created_at': _iso(self.created_at),
        }
        if deep:
            d['permission'] = self.permission.to_dict() if self.permission else None
            d['inquiry'] = self.inquiry.to_dict() if self.inquiry else None
            d['proposal'] = self.proposal.to_dict() if self.proposal else None
            d['vetting'] = self.vetting.to_dict() if self.vetting else None
            d['grants'] = [g.to_dict(deep=True) for g in self.grants]
        return d


class SaxPermission(db.Model):
    """SCLR step 1 — the gatekeeper's agreement, recorded at the moment
    it is given. Nothing else can start without it (enforced by group
    creation requiring these fields)."""
    __tablename__ = 'sax_permissions'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('sax_groups.id'),
                         nullable=False, unique=True)
    granted_by_name = db.Column(db.String(200), nullable=False)
    granted_by_role = db.Column(db.String(120), nullable=False)  # chief / elder / leader
    note = db.Column(db.Text)
    granted_at = db.Column(db.DateTime, default=_utcnow)
    recorded_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    def to_dict(self):
        return {
            'id': self.id, 'granted_by_name': self.granted_by_name,
            'granted_by_role': self.granted_by_role, 'note': self.note,
            'granted_at': _iso(self.granted_at),
        }


class SaxInquiry(db.Model):
    """SCLR step 2 — what the community is already doing. The
    activity_90d_score (0–3) is the low-commitment filter: what has
    this group done in the last 90 days with its OWN resources?"""
    __tablename__ = 'sax_inquiries'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('sax_groups.id'),
                         nullable=False, unique=True)
    answers_json = db.Column(db.Text)          # inquiry-template answers
    activity_90d_score = db.Column(db.Integer)  # 0 none … 3 strong
    note = db.Column(db.Text)
    done_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    done_at = db.Column(db.DateTime, default=_utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'answers': _loads(self.answers_json),
            'activity_90d_score': self.activity_90d_score,
            'note': self.note, 'done_at': _iso(self.done_at),
        }


class SaxProposal(db.Model):
    """SCLR step 3 — the community's own proposal, filled via a no-login
    token link (shareable over WhatsApp). Ownership stays with the
    group; the token just removes the paperwork barrier."""
    __tablename__ = 'sax_proposals'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('sax_groups.id'),
                         nullable=False, unique=True)
    token = db.Column(db.String(64), unique=True, nullable=False,
                      default=lambda: secrets.token_urlsafe(24))
    answers_json = db.Column(db.Text)
    issued_at = db.Column(db.DateTime, default=_utcnow)
    submitted_at = db.Column(db.DateTime)

    def to_dict(self, include_token=False):
        d = {
            'id': self.id, 'answers': _loads(self.answers_json),
            'issued_at': _iso(self.issued_at),
            'submitted_at': _iso(self.submitted_at),
        }
        if include_token:
            d['token'] = self.token
        return d


class SaxVetting(db.Model):
    """SCLR step 4 — the virtual review against the SCLR selection
    criteria. The scored, dated decision record is also the shield when
    an office-holder asks why a group was not selected."""
    __tablename__ = 'sax_vettings'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('sax_groups.id'),
                         nullable=False, unique=True)
    scores_json = db.Column(db.Text)   # {criterion_key: score}
    decision = db.Column(db.String(20), nullable=False)  # selected / not_selected / deferred
    note = db.Column(db.Text)
    decided_by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    decided_at = db.Column(db.DateTime, default=_utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'scores': _loads(self.scores_json),
            'decision': self.decision, 'note': self.note,
            'decided_at': _iso(self.decided_at),
        }


class SaxGrant(db.Model):
    """SCLR steps 5–8 in one record: selection starts the visible
    10-day clock; disbursement stops it and issues the community report
    link; the outcome tag + lesson closes it. The sanctions screen on
    the signatory is the quiet legal-floor check — it records, it does
    not gate."""
    __tablename__ = 'sax_grants'

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('sax_groups.id'),
                         nullable=False)
    fund_id = db.Column(db.Integer, db.ForeignKey('sax_funds.id'),
                        nullable=False)
    amount_usd = db.Column(db.Float, nullable=False)
    signatory_name = db.Column(db.String(200), nullable=False)
    signatory_screening = db.Column(db.String(20), default='pending')  # clear / review / unavailable / pending
    selected_at = db.Column(db.DateTime, default=_utcnow)
    disbursed_at = db.Column(db.DateTime)
    report_token = db.Column(db.String(64), unique=True)
    outcome_tag = db.Column(db.String(20))   # delivered / partial / learning_loss
    outcome_lesson = db.Column(db.Text)
    co_contribution = db.Column(db.Text)     # what the community added itself
    outcome_at = db.Column(db.DateTime)

    report = db.relationship('SaxReport', backref='grant',
                             uselist=False, lazy='joined')

    @property
    def sla_days(self):
        """Days from selection to disbursement — the ONE metric. While
        undisbursed it is the running count; after disbursement it is
        frozen at the actual."""
        if not self.selected_at:
            return None
        start = self.selected_at
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        end = self.disbursed_at or _utcnow()
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return (end - start).days

    def to_dict(self, deep=False, include_token=False):
        d = {
            'id': self.id, 'group_id': self.group_id,
            'fund_id': self.fund_id, 'amount_usd': self.amount_usd,
            'signatory_name': self.signatory_name,
            'signatory_screening': self.signatory_screening,
            'selected_at': _iso(self.selected_at),
            'disbursed_at': _iso(self.disbursed_at),
            'sla_days': self.sla_days,
            'sla_breached': (self.sla_days is not None
                             and self.sla_days > SAX_DISBURSE_SLA_DAYS),
            'outcome_tag': self.outcome_tag,
            'outcome_lesson': self.outcome_lesson,
            'co_contribution': self.co_contribution,
            'outcome_at': _iso(self.outcome_at),
            'has_report': self.report is not None,
        }
        if include_token:
            d['report_token'] = self.report_token
        if deep and self.report is not None:
            d['report'] = self.report.to_dict()
        return d


class SaxReport(db.Model):
    """SCLR step 7 — the community's own words, submitted through the
    no-login report link. A few simple questions; deliberately NOT
    receipts. The co-contribution answer is counted, not mandated."""
    __tablename__ = 'sax_reports'

    id = db.Column(db.Integer, primary_key=True)
    grant_id = db.Column(db.Integer, db.ForeignKey('sax_grants.id'),
                         nullable=False, unique=True)
    answers_json = db.Column(db.Text)
    submitted_at = db.Column(db.DateTime, default=_utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'answers': _loads(self.answers_json),
            'submitted_at': _iso(self.submitted_at),
        }


class SaxAreaPause(db.Model):
    """Political-interference register. When an office-holder tries to
    steer selection, the team withdraws from that locality on principle;
    this records the withdrawal and its reason — useful history when the
    office-holder changes."""
    __tablename__ = 'sax_area_pauses'

    id = db.Column(db.Integer, primary_key=True)
    locality = db.Column(db.String(255), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    paused_at = db.Column(db.DateTime, default=_utcnow)
    lifted_at = db.Column(db.DateTime)
    by_user_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    def to_dict(self):
        return {
            'id': self.id, 'locality': self.locality, 'reason': self.reason,
            'paused_at': _iso(self.paused_at),
            'lifted_at': _iso(self.lifted_at),
            'active': self.lifted_at is None,
        }

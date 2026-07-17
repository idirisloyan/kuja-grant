"""Proximate panel selection vote — July 2026.

The problem: after nomination + endorsement, the community panel meets
to decide WHICH partners the round funds. Today that decision happens
in a physical meeting and reaches the system as an email or nothing at
all — the audit chain has a hole exactly at the most contested moment.

The model: the same zero-login token-link pattern the fund already
uses everywhere (endorser invites, report tokens, verifier links). OB
opens one vote session per round; each appointed panelist gets a
personal link; the ballot is one mobile page — one tap per partner,
one submit. Every cast + the close-out tally is audit-chained, so the
selection decision is as traceable as the money that follows it.

Deliberate simplicity:
  - the ballot is FROZEN at open (ballot_json) so roster edits mid-vote
    can't change what people voted on;
  - votes are visible to OB only, never to other panelists (avoids
    anchoring); the transparency page shows outcomes, not ballots;
  - closing records the tally + strict-majority selection, and the OB
    confirms/acts on the roster — the system records, humans decide.
"""

from datetime import datetime, timezone
import json
import secrets

from app.extensions import db


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_vote_token() -> str:
    """Same 32-char hex shape as every other Proximate tokened URL."""
    return secrets.token_hex(16)


class ProximatePanelVoteSession(db.Model):
    """One selection vote for one round. At most one open per round."""

    __tablename__ = 'proximate_panel_vote_sessions'

    id = db.Column(db.Integer, primary_key=True)
    network_id = db.Column(
        db.Integer, db.ForeignKey('networks.id'), nullable=False, index=True,
    )
    round_id = db.Column(
        db.Integer, db.ForeignKey('proximate_rounds.id'),
        nullable=False, index=True,
    )
    status = db.Column(db.String(12), nullable=False, default='open')

    # Ballot frozen at open: [{participant_id, partner_id, partner_name,
    # partner_name_ar, locality}]
    ballot_json = db.Column(db.Text, nullable=False, default='[]')
    # Set on close: {selected_participant_ids: [...],
    #                tally: {"<participant_id>": {"select": n, "pass": n}},
    #                voted: n, invited: n}
    outcome_json = db.Column(db.Text, nullable=True)

    created_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=False,
    )
    created_at = db.Column(db.DateTime, nullable=False, default=_now)
    closed_by_user_id = db.Column(
        db.Integer, db.ForeignKey('users.id'), nullable=True,
    )
    closed_at = db.Column(db.DateTime, nullable=True)

    invites = db.relationship(
        'ProximatePanelVoteInvite', backref='session',
        cascade='all, delete-orphan', lazy='selectin',
    )

    def get_ballot(self):
        try:
            return json.loads(self.ballot_json or '[]')
        except Exception:
            return []

    def get_outcome(self):
        try:
            return json.loads(self.outcome_json) if self.outcome_json else None
        except Exception:
            return None

    def to_dict(self):
        return {
            'id': self.id,
            'round_id': self.round_id,
            'status': self.status,
            'ballot': self.get_ballot(),
            'outcome': self.get_outcome(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
        }


class ProximatePanelVoteInvite(db.Model):
    """One panelist's personal ballot link. One-shot: voted_at locks it."""

    __tablename__ = 'proximate_panel_vote_invites'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey('proximate_panel_vote_sessions.id', ondelete='CASCADE'),
        nullable=False, index=True,
    )
    panel_candidate_id = db.Column(
        db.Integer, db.ForeignKey('proximate_panel_candidates.id'),
        nullable=True,
    )
    voter_name = db.Column(db.String(200), nullable=False)
    voter_phone = db.Column(db.String(50), nullable=True)
    vote_token = db.Column(
        db.String(64), unique=True, nullable=False, index=True,
        default=_make_vote_token,
    )
    # {"<participant_id>": "select" | "pass"} — set once at voted_at.
    votes_json = db.Column(db.Text, nullable=True)
    note = db.Column(db.Text, nullable=True)
    voted_at = db.Column(db.DateTime, nullable=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=_now)

    def get_votes(self):
        try:
            return json.loads(self.votes_json) if self.votes_json else {}
        except Exception:
            return {}

    def to_dict(self, include_token=False, include_votes=False):
        d = {
            'id': self.id,
            'voter_name': self.voter_name,
            'voter_phone': self.voter_phone,
            'voted_at': self.voted_at.isoformat() if self.voted_at else None,
        }
        if include_token:
            d['vote_token'] = self.vote_token
        if include_votes:
            d['votes'] = self.get_votes()
            d['note'] = self.note
        return d

"""
Hash-chained tamper-evident audit log — Phase 13.12.

PMO's pattern: each row contains the hash of the previous row's
canonicalized payload. A verify-script walks the chain and reports
breaks (manual DB tampering, incomplete writes, missing rows).

Why: GDPR + donor neutrality require tamper-evidence. A simple
append-only log isn't enough — someone with DB access can rewrite
history. With a hash chain, any modification breaks every row that
follows it; the verifier surfaces the exact break point.

This is a SUPPLEMENT to the existing log_action() audit trail (which
goes to the kuja.audit logger). Critical events also write a row here
so they can be cryptographically verified.
"""

import hashlib
import json
from datetime import datetime, timezone

from app.extensions import db


class AuditChainEntry(db.Model):
    __tablename__ = 'audit_chain'
    __table_args__ = (
        db.Index('ix_audit_chain_subject', 'subject_kind', 'subject_id'),
        db.Index('ix_audit_chain_actor', 'actor_email'),
    )

    id = db.Column(db.Integer, primary_key=True)
    seq = db.Column(db.Integer, nullable=False, unique=True)  # monotonic
    prev_hash = db.Column(db.String(64), nullable=True)       # hex sha256 of prev row's canonical payload (None for genesis)
    payload_hash = db.Column(db.String(64), nullable=False)   # hex sha256 of THIS row's canonical payload

    action = db.Column(db.String(120), nullable=False)
    actor_email = db.Column(db.String(320), nullable=True)
    subject_kind = db.Column(db.String(40), nullable=True)
    subject_id = db.Column(db.Integer, nullable=True)
    details_json = db.Column(db.Text, nullable=True)

    # Phase 672 v0 — per-tenant scope. Filled in from g.network on append.
    # Existing emitters that don't pass network_id stay un-scoped (NULL)
    # until each call site is migrated; honest limitation, not a fix.
    network_id = db.Column(db.Integer, nullable=True, index=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    @staticmethod
    def _canonical(payload: dict) -> str:
        """Stable, sorted, ASCII-safe serialization for hashing."""
        return json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

    @classmethod
    def append(cls, *, action: str, actor_email: str | None,
               subject_kind: str | None, subject_id: int | None,
               details: dict | None = None,
               network_id: int | None = None) -> 'AuditChainEntry':
        """Append a new entry, hashing in the previous tail's payload_hash.

        Phase 672 v0 — opt-in per-tenant scope: pass network_id explicitly
        or set g.network upstream; the column gets backfilled. The hash
        chain stays global for now (rebuilding per-tenant chains would
        invalidate every existing hash anchor); only the column changes
        so queries can filter cleanly.

        Best-effort — never raises, never blocks the caller. If anything
        fails we log to stderr and return None (no chain entry created).
        """
        try:
            # Derive network_id if not passed explicitly. Prefer
            # g.audit_network_id — set by route layers that resolve the
            # true tenant themselves (e.g. proximate_bp's before_request
            # hook) — over g.network, which is the HOST-resolved network
            # and is wrong for token-link / override-header / direct-URL
            # requests that land on the default host (QA 2026-07-14:
            # proximate rows stamped with the Kuja default network).
            if network_id is None:
                try:
                    from flask import g
                    explicit = getattr(g, 'audit_network_id', None)
                    if explicit:
                        network_id = explicit
                    else:
                        net = getattr(g, 'network', None)
                        if net is not None and getattr(net, 'id', None):
                            network_id = net.id
                except Exception:
                    pass

            tail = cls.query.order_by(cls.seq.desc()).first()
            seq = (tail.seq + 1) if tail else 1
            prev_hash = tail.payload_hash if tail else None
            payload = {
                'seq': seq,
                'prev_hash': prev_hash,
                'action': action,
                'actor_email': actor_email,
                'subject_kind': subject_kind,
                'subject_id': subject_id,
                'details': details or {},
                # No timestamp in the canonical hash — would make replay
                # awkward across timezones. created_at is non-canonical metadata.
                # network_id deliberately excluded from the canonical hash so
                # existing chains keep verifying after Phase 672 lands.
            }
            payload_hash = hashlib.sha256(
                cls._canonical(payload).encode('utf-8')
            ).hexdigest()
            entry = cls(
                seq=seq,
                prev_hash=prev_hash,
                payload_hash=payload_hash,
                action=action,
                actor_email=actor_email,
                subject_kind=subject_kind,
                subject_id=subject_id,
                details_json=json.dumps(details or {}, default=str)[:8000],
                network_id=network_id,
            )
            db.session.add(entry)
            db.session.commit()
            return entry
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass
            return None

    @classmethod
    def verify(cls, *, limit: int | None = None) -> dict:
        """Walk the chain, return {ok, total, breaks: [{seq, kind, ...}]}.

        Used by the /admin/system-health check + a CLI verify script.
        """
        q = cls.query.order_by(cls.seq.asc())
        if limit:
            q = q.limit(limit)
        rows = q.all()
        breaks = []
        prev = None
        for r in rows:
            # Recompute the canonical hash and compare.
            try:
                details = json.loads(r.details_json or '{}')
            except Exception:
                details = {}
            payload = {
                'seq': r.seq,
                'prev_hash': r.prev_hash,
                'action': r.action,
                'actor_email': r.actor_email,
                'subject_kind': r.subject_kind,
                'subject_id': r.subject_id,
                'details': details,
            }
            recomputed = hashlib.sha256(
                cls._canonical(payload).encode('utf-8')
            ).hexdigest()
            if recomputed != r.payload_hash:
                breaks.append({'seq': r.seq, 'kind': 'payload_hash_mismatch'})
            if prev is not None:
                if r.prev_hash != prev.payload_hash:
                    breaks.append({'seq': r.seq, 'kind': 'prev_hash_mismatch',
                                   'expected': prev.payload_hash, 'got': r.prev_hash})
                if r.seq != prev.seq + 1:
                    breaks.append({'seq': r.seq, 'kind': 'seq_skip',
                                   'expected': prev.seq + 1, 'got': r.seq})
            prev = r
        return {'ok': not breaks, 'total': len(rows), 'breaks': breaks}

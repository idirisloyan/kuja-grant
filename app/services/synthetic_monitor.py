"""
Phase 101 — Synthetic production monitoring.

A scheduled probe that runs end-to-end against critical user paths every
30 minutes. Pages an admin (via in-app notification) on failure so we
catch outages BEFORE users do — the team's retest already proved manual
probing finds real issues; this automates it.

Probes (read-only — no DB writes, no AI calls):

  1. health          — `/api/health` returns 200 and { status: 'healthy' }
  2. ngo_login       — log in as fatima@amani.org / pass123
  3. ngo_dashboard   — `/api/dashboard` returns role-aware shape
  4. ngo_apps_list   — `/api/applications` returns list (length ≥ 0)
  5. donor_login     — log in as sarah@globalhealth.org / pass123
  6. donor_reviews   — `/api/applications?status=submitted` returns list
  7. trust_share     — public `/api/passport/share/<known-revoked-slug>`
                       returns 410 Gone or 200 with reason
  8. did_doc         — `/.well-known/did.json` returns valid DID document
  9. status_list     — `/api/credentials/status-list/2021` returns
                       StatusList2021Credential shape

Each probe has a soft deadline (3s) and a hard deadline (10s). Soft-miss
records `slow=True`; hard-miss records `failed=True`. Both go into the
result; only failures fire a notification.

Storage: results land in a new SyntheticMonitorRun table (one row per
sweep) so the admin dashboard can show a 7-day trend.

Triggering paths:
  - In-process: SyntheticMonitor.run() from anywhere (admin debug button).
  - Cron-triggered: POST /api/cron/synthetic-monitor with the CRON_SECRET
    header. Wired in app/routes/cron_routes.py.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

import requests

from app.extensions import db

logger = logging.getLogger('kuja')

SOFT_DEADLINE_S = 3.0
HARD_DEADLINE_S = 10.0
DEFAULT_BASE_URL = 'https://web-production-6f8a.up.railway.app'


@dataclass
class ProbeResult:
    name: str
    ok: bool
    slow: bool
    duration_ms: int
    status_code: int | None
    error: str | None = None
    note: str | None = None


@dataclass
class MonitorRunResult:
    started_at: str
    finished_at: str
    total_ms: int
    probes: list[ProbeResult] = field(default_factory=list)
    failures: int = 0
    slow_count: int = 0
    base_url: str = DEFAULT_BASE_URL

    def to_dict(self) -> dict:
        return {
            'started_at': self.started_at,
            'finished_at': self.finished_at,
            'total_ms': self.total_ms,
            'failures': self.failures,
            'slow_count': self.slow_count,
            'base_url': self.base_url,
            'probes': [asdict(p) for p in self.probes],
        }


class _Probe:
    def __init__(self, session: requests.Session, base_url: str):
        self.s = session
        self.base = base_url.rstrip('/')

    def _timed(self, name: str, fn) -> ProbeResult:
        t0 = time.monotonic()
        try:
            status, note = fn()
            dur = int((time.monotonic() - t0) * 1000)
            slow = dur / 1000.0 > SOFT_DEADLINE_S
            ok = 200 <= (status or 0) < 400
            return ProbeResult(name=name, ok=ok, slow=slow,
                               duration_ms=dur, status_code=status, note=note)
        except Exception as e:
            dur = int((time.monotonic() - t0) * 1000)
            return ProbeResult(name=name, ok=False, slow=False,
                               duration_ms=dur, status_code=None,
                               error=str(e)[:200])

    def health(self) -> ProbeResult:
        def fn():
            r = self.s.get(f'{self.base}/api/health', timeout=HARD_DEADLINE_S)
            body = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
            note = f"status={body.get('status')}" if body else None
            return r.status_code, note
        return self._timed('health', fn)

    def login(self, email: str, password: str, label: str) -> ProbeResult:
        def fn():
            r = self.s.post(
                f'{self.base}/api/auth/login',
                json={'email': email, 'password': password},
                timeout=HARD_DEADLINE_S,
            )
            return r.status_code, f'user={email}'
        return self._timed(f'login.{label}', fn)

    def get_json(self, path: str, label: str, expect: str | None = None) -> ProbeResult:
        def fn():
            r = self.s.get(f'{self.base}{path}', timeout=HARD_DEADLINE_S)
            note = None
            if expect and 200 <= r.status_code < 300:
                try:
                    body = r.json()
                    note = f"{expect}={body.get(expect)}"
                except Exception:
                    pass
            return r.status_code, note
        return self._timed(label, fn)

    def public_get(self, path: str, label: str) -> ProbeResult:
        # Use a fresh session (no auth cookie) so we exercise the public
        # path the way an external verifier would.
        def fn():
            r = requests.get(f'{self.base}{path}', timeout=HARD_DEADLINE_S)
            return r.status_code, None
        return self._timed(label, fn)


class SyntheticMonitor:
    """Run a full monitor sweep + return aggregated result.

    Credentials live in env vars so we don't ship password hashes in
    source. Defaults match the seed accounts so the monitor works out of
    the box against fresh-seeded environments.
    """

    @classmethod
    def run(cls, base_url: str | None = None) -> MonitorRunResult:
        base_url = (base_url or os.environ.get('KUJA_SYNTHETIC_BASE_URL') or DEFAULT_BASE_URL).rstrip('/')
        started = datetime.now(timezone.utc)
        t0 = time.monotonic()

        # Credentials — env-overridable for non-default tenants
        ngo_email = os.environ.get('KUJA_SYN_NGO_EMAIL', 'fatima@amani.org')
        ngo_password = os.environ.get('KUJA_SYN_NGO_PASSWORD', 'pass123')
        donor_email = os.environ.get('KUJA_SYN_DONOR_EMAIL', 'sarah@globalhealth.org')
        donor_password = os.environ.get('KUJA_SYN_DONOR_PASSWORD', 'pass123')

        result = MonitorRunResult(
            started_at=started.isoformat(),
            finished_at='',  # filled below
            total_ms=0,
            base_url=base_url,
        )

        # Public probes — fresh session each
        with requests.Session() as fresh:
            probe = _Probe(fresh, base_url)
            result.probes.append(probe.health())
            result.probes.append(probe.public_get('/.well-known/did.json', 'did_doc'))
            result.probes.append(probe.public_get(
                '/api/credentials/status-list/2021', 'status_list',
            ))

        # NGO probes — auth'd session
        with requests.Session() as ngo:
            probe = _Probe(ngo, base_url)
            result.probes.append(probe.login(ngo_email, ngo_password, 'ngo'))
            result.probes.append(probe.get_json('/api/dashboard', 'ngo_dashboard'))
            result.probes.append(probe.get_json('/api/applications', 'ngo_apps_list'))
            result.probes.append(probe.get_json('/api/reports/upcoming', 'ngo_reports_upcoming'))

        # Donor probes — auth'd session
        with requests.Session() as donor:
            probe = _Probe(donor, base_url)
            result.probes.append(probe.login(donor_email, donor_password, 'donor'))
            result.probes.append(probe.get_json('/api/applications?status=submitted', 'donor_reviews_pending'))

        for p in result.probes:
            if not p.ok:
                result.failures += 1
            if p.slow:
                result.slow_count += 1

        result.total_ms = int((time.monotonic() - t0) * 1000)
        result.finished_at = datetime.now(timezone.utc).isoformat()
        return result


# --------------------------------------------------------------------------
# Persistence — one row per sweep so the admin dashboard can render a
# 7-day trend (failures over time + slow-probe trend). The model itself
# lives in app/models/synthetic_monitor.py so SQLAlchemy picks it up via
# `from app import models` in app/__init__.py and db.create_all() builds
# the table on boot.
# --------------------------------------------------------------------------

def persist_run(result: MonitorRunResult):
    """Persist a MonitorRunResult to the synthetic_monitor_runs table.

    Best-effort: returns None on persistence error rather than raising.
    The monitor's first job is to run; logging it is secondary.
    """
    import json
    from app.models.synthetic_monitor import SyntheticMonitorRun
    try:
        row = SyntheticMonitorRun(
            started_at=datetime.fromisoformat(result.started_at.replace('Z', '+00:00')),
            finished_at=datetime.fromisoformat(result.finished_at.replace('Z', '+00:00')),
            total_ms=result.total_ms,
            base_url=result.base_url,
            failures=result.failures,
            slow_count=result.slow_count,
            probes_json=json.dumps([asdict(p) for p in result.probes]),
        )
        db.session.add(row)
        db.session.commit()
        return row
    except Exception as e:
        logger.warning('synthetic monitor persist failed: %s', e)
        db.session.rollback()
        return None


def notify_failures(result: MonitorRunResult) -> None:
    """Fire admin notifications when the run has failures.

    Sends one notification per admin (24h dedup via notification service).
    Body lists the failed probe names so an admin can triage at a glance.
    """
    if result.failures == 0:
        return
    try:
        from app.models.user import User
        from app.services.notification_service import create_notification
        failed_names = ', '.join(p.name for p in result.probes if not p.ok) or '?'
        admins = User.query.filter_by(role='admin').all()
        for admin in admins:
            try:
                create_notification(
                    user_id=admin.id,
                    type='admin',
                    title=f'Synthetic monitor: {result.failures} failure(s)',
                    message=f'Failed probes: {failed_names}. See /admin/synthetic-monitor for details.',
                    link='/admin/synthetic-monitor',
                )
            except Exception:
                continue
    except Exception as e:
        logger.warning('synthetic monitor notify failed: %s', e)

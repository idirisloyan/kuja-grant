#!/usr/bin/env python3
"""
import_historical_round.py — bring a PAST Proximate funding round into the
system as history, not as something that happened today.

Requested by the 4 Sep 2026 QA handoff ("Historical funding round import
pathway — prepare, DO NOT IMPORT YET"). What this tool guarantees:

  * DRY-RUN BY DEFAULT. Preview validates the package, resolves duplicates,
    reconciles the money and prints the exact plan. Nothing is written until
    ``--apply --confirm-historical`` is passed, and then only after the same
    preview passes with zero errors.
  * ORIGINAL DATES ARE KEPT. Round drafted/submitted/activated/closed,
    partner nominated/cleared, disbursement sent/report-due/report-submitted
    all come from the package. ``created_at`` stays the import time: that is
    when the RECORD came into existence, and back-dating it would be exactly
    the fake history the pack forbids.
  * NO FAKE AUDIT HISTORY. Every created row gets ONE audit-chain entry,
    action ``proximate.historical.imported``, note "Historical record
    imported", carrying the batch id, source, source ref and original dates.
    No nomination / endorsement / signature / release events are fabricated.
  * NO NOTIFICATIONS, NO CURRENT TASKS. Writes go through the ORM only. The
    tool never calls the messaging, reminder or report-link services, never
    issues receipt / report / verifier tokens, never opens interventions.
  * IDEMPOTENT. Every row is stamped (import_batch_id, import_source_ref); a
    re-run of the same package skips rows already imported.
  * DUPLICATE DETECTION. A partner whose name (EN or AR, case-insensitive)
    already exists is REUSED, never twinned. A round whose title already
    exists is an error unless ``round.reuse_existing_id`` names it. A
    disbursement matching an existing (partner, sent date, amount) is skipped.
  * ROLLBACK. ``--rollback <batch> --confirm-rollback`` removes every row the
    batch created, and refuses if any later non-import audit activity touched
    those rows. Audit entries are never deleted; the rollback is audited.
  * TENANT / ROLE BOUNDARIES. Writes are scoped to the Proximate network and
    attributed to a named, existing Oversight Body member (``--actor``) —
    never a hard-coded system user.

Where to run it: a machine whose DATABASE_URL points at the target database.
Locally, leave DATABASE_URL unset and pass KUJA_DB_PATH. For production,
export Railway's DATABASE_PUBLIC_URL for the ONE command — never commit it,
never put it in a GitHub secret — and do NOT run this via ``railway ssh``
into the web worker (long create_app scripts there have wedged production).

Usage
  py import_historical_round.py PACKAGE.json --actor ob@example.org
  py import_historical_round.py PACKAGE.json --actor ob@example.org --report out.json
  py import_historical_round.py PACKAGE.json --actor ob@example.org --apply --confirm-historical
  py import_historical_round.py --rollback hist-2025-kassala --actor ob@example.org --confirm-rollback

Package format: docs/historical_import/README.md (sample alongside).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ACTION_IMPORTED = 'proximate.historical.imported'
ACTION_BATCH = 'proximate.historical.batch'
ACTION_ROLLED_BACK = 'proximate.historical.rolled_back'
HISTORICAL_NOTE = 'Historical record imported'
ACTOR_SUFFIX = ' (historical import)'

BATCH_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$')
REF_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:/ -]{0,119}$')

class PackageError(Exception):
    """A package problem that makes the plan unbuildable."""


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def parse_dt(value, field_name: str) -> datetime | None:
    if value is None or value == '':
        return None
    if isinstance(value, (int, float)):
        raise PackageError(f'{field_name}: dates must be ISO strings, not numbers')
    s = str(value).strip()
    try:
        if len(s) == 10:
            d = date.fromisoformat(s)
            return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)
        dt = datetime.fromisoformat(s.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        raise PackageError(f'{field_name}: not an ISO date: {s!r}')


def parse_date(value, field_name: str) -> date | None:
    dt = parse_dt(value, field_name)
    return dt.date() if dt else None


def money(value, field_name: str, *, required: bool = False) -> float | None:
    if value is None or value == '':
        if required:
            raise PackageError(f'{field_name}: amount is required')
        return None
    try:
        x = float(value)
    except (TypeError, ValueError):
        raise PackageError(f'{field_name}: not a number: {value!r}')
    if x < 0:
        raise PackageError(f'{field_name}: negative amount {x}')
    return round(x, 2)


def text(value, field_name: str, *, required: bool = False, max_len: int = 300) -> str | None:
    if value is None:
        if required:
            raise PackageError(f'{field_name}: required')
        return None
    s = str(value).strip()
    if not s:
        if required:
            raise PackageError(f'{field_name}: required')
        return None
    if len(s) > max_len:
        raise PackageError(f'{field_name}: longer than {max_len} characters')
    return s


def choice(value, field_name: str, allowed, *, default=None) -> str | None:
    if value is None or value == '':
        return default
    s = str(value).strip()
    if s not in allowed:
        raise PackageError(f'{field_name}: {s!r} is not one of {sorted(allowed)}')
    return s


def iso(dt) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Plan model
# ---------------------------------------------------------------------------

@dataclass
class Item:
    kind: str                 # round | grant | partner | participant | disbursement | allocation
    op: str                   # create | reuse | skip_imported | skip_duplicate | error
    ref: str
    label: str
    data: dict = field(default_factory=dict)
    existing_id: int | None = None
    notes: list = field(default_factory=list)
    created_id: int | None = None


@dataclass
class Plan:
    batch_id: str
    source: str
    items: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    errors: list = field(default_factory=list)

    def add(self, item: Item) -> Item:
        self.items.append(item)
        if item.op == 'error':
            self.errors.append(f'{item.kind} {item.ref}: {"; ".join(item.notes)}')
        return item

    def by_kind(self, kind: str):
        return [i for i in self.items if i.kind == kind]

    def totals(self) -> dict:
        out: dict = {}
        for i in self.items:
            out.setdefault(i.kind, {}).setdefault(i.op, 0)
            out[i.kind][i.op] += 1
        return out


# ---------------------------------------------------------------------------
# Package loading + validation
# ---------------------------------------------------------------------------

def load_package(path: str) -> dict:
    with open(path, 'r', encoding='utf-8') as fh:
        try:
            pkg = json.load(fh)
        except json.JSONDecodeError as ex:
            raise PackageError(f'{path}: not valid JSON ({ex})')
    if not isinstance(pkg, dict):
        raise PackageError('package root must be an object')
    batch = text(pkg.get('batch_id'), 'batch_id', required=True, max_len=64)
    if not BATCH_RE.match(batch):
        raise PackageError('batch_id: use 3-64 chars of letters, digits, ., _ or -')
    text(pkg.get('source'), 'source', required=True, max_len=300)
    if not isinstance(pkg.get('round'), dict):
        raise PackageError('round: required object')
    for key in ('partners', 'awards', 'disbursements'):
        if key in pkg and not isinstance(pkg[key], list):
            raise PackageError(f'{key}: must be a list')
    if 'grant' in pkg and pkg['grant'] is not None and not isinstance(pkg['grant'], dict):
        raise PackageError('grant: must be an object')
    return pkg


def _ref(obj: dict, field_name: str) -> str:
    ref = text(obj.get('source_ref'), field_name, required=True, max_len=120)
    if not REF_RE.match(ref):
        raise PackageError(f'{field_name}: source_ref {ref!r} has unsupported characters')
    return ref


# ---------------------------------------------------------------------------
# Plan building (read-only against the database)
# ---------------------------------------------------------------------------

def build_plan(pkg: dict, *, net, actor, models) -> Plan:
    from sqlalchemy import func

    (ProximateRound, ProximateRoundParticipant, ProximatePartner,
     ProximateDisbursement, ProximateGrant, ProximateGrantAllocation) = models
    from app.models.proximate_round import (
        ROUND_STATUSES, ROUND_TRIGGER_TYPES, ROUND_PHASES, PARTICIPANT_STAGES,
    )
    from app.models.proximate_endorsement import PARTNER_STATUSES
    from app.models.proximate_disbursement import (
        DISBURSEMENT_STATUSES, DEFAULT_REPORT_WINDOW_DAYS,
    )
    from app.models.proximate_grant import GRANT_STATUSES, REPORTING_CADENCES

    batch = pkg['batch_id']
    plan = Plan(batch_id=batch, source=pkg['source'])

    def already_imported(model, ref):
        return model.query.filter_by(
            network_id=net.id, import_batch_id=batch, import_source_ref=ref,
        ).first()

    # ---- round -----------------------------------------------------------
    r = pkg['round']
    round_ref = _ref(r, 'round.source_ref')
    title = text(r.get('title'), 'round.title', required=True)
    status = choice(r.get('status'), 'round.status', ROUND_STATUSES, default=None)
    dates = r.get('dates') or {}
    if not isinstance(dates, dict):
        raise PackageError('round.dates: must be an object')
    drafted_at = parse_dt(dates.get('drafted_at'), 'round.dates.drafted_at')
    submitted_at = parse_dt(dates.get('submitted_at'), 'round.dates.submitted_at')
    activated_at = parse_dt(dates.get('activated_at'), 'round.dates.activated_at')
    closed_at = parse_dt(dates.get('closed_at'), 'round.dates.closed_at')
    cancelled_at = parse_dt(dates.get('cancelled_at'), 'round.dates.cancelled_at')
    if drafted_at is None:
        raise PackageError('round.dates.drafted_at: required (the original date the round was opened)')
    for name, dt in (('submitted_at', submitted_at), ('activated_at', activated_at),
                     ('closed_at', closed_at), ('cancelled_at', cancelled_at)):
        if dt and dt < drafted_at:
            raise PackageError(f'round.dates.{name} is before drafted_at')
    if status is None:
        # Status reconstruction from the dates the source actually has.
        if cancelled_at:
            status = 'cancelled'
        elif closed_at:
            status = 'closed'
        elif activated_at:
            status = 'active'
        elif submitted_at:
            status = 'in_review'
        else:
            status = 'draft'
        plan.warnings.append(f'round {round_ref}: status not given; reconstructed as {status!r} from dates')
    if status == 'closed' and not closed_at:
        raise PackageError('round.dates.closed_at: required when status is closed')
    if status in ('active', 'closed') and not activated_at:
        raise PackageError(f'round.dates.activated_at: required when status is {status}')
    phase = choice(r.get('phase'), 'round.phase', ROUND_PHASES,
                   default=('closeout' if status in ('closed', 'cancelled') else 'reporting'))
    trigger_type = choice(r.get('trigger_type'), 'round.trigger_type', ROUND_TRIGGER_TYPES,
                          default='programme_cycle')
    envelope = money(r.get('envelope_usd'), 'round.envelope_usd')
    round_data = dict(
        title=title,
        title_ar=text(r.get('title_ar'), 'round.title_ar'),
        trigger_type=trigger_type,
        trigger_summary=text(r.get('trigger_summary'), 'round.trigger_summary', max_len=5000),
        donor_name=text(r.get('donor_name'), 'round.donor_name', max_len=200),
        envelope_usd=envelope,
        target_country=text(r.get('target_country'), 'round.target_country', max_len=3) or 'SD',
        target_region=text(r.get('target_region'), 'round.target_region', max_len=120),
        target_locality=text(r.get('target_locality'), 'round.target_locality', max_len=160),
        status=status, phase=phase,
        drafted_at=drafted_at, submitted_at=submitted_at, activated_at=activated_at,
        closed_at=closed_at, cancelled_at=cancelled_at,
        closing_summary=text(r.get('closing_summary'), 'round.closing_summary', max_len=10000),
        cancellation_reason=text(r.get('cancellation_reason'), 'round.cancellation_reason', max_len=5000),
    )
    round_item = Item(kind='round', op='create', ref=round_ref, label=title, data=round_data)
    existing = already_imported(ProximateRound, round_ref)
    if existing:
        round_item.op, round_item.existing_id = 'skip_imported', existing.id
        round_item.notes.append(f'already imported as round #{existing.id}')
    else:
        reuse_id = r.get('reuse_existing_id')
        same_title = ProximateRound.query.filter(
            ProximateRound.network_id == net.id,
            func.lower(ProximateRound.title) == title.lower(),
        ).first()
        if reuse_id:
            target = ProximateRound.query.filter_by(id=int(reuse_id), network_id=net.id).first()
            if not target:
                round_item.op = 'error'
                round_item.notes.append(f'reuse_existing_id {reuse_id} is not a round in this tenant')
            else:
                round_item.op, round_item.existing_id = 'reuse', target.id
                round_item.notes.append(f'attaching to existing round #{target.id} "{target.title}"')
        elif same_title:
            round_item.op = 'error'
            round_item.notes.append(
                f'a round titled "{same_title.title}" already exists (#{same_title.id}); '
                f'set round.reuse_existing_id to attach to it, or change the title')
    plan.add(round_item)

    # ---- grant (optional) --------------------------------------------------
    g = pkg.get('grant')
    grant_item = None
    if g:
        grant_ref = _ref(g, 'grant.source_ref')
        gtitle = text(g.get('title'), 'grant.title', required=True)
        gdata = dict(
            title=gtitle,
            donor_name_cache=text(g.get('donor_name'), 'grant.donor_name', max_len=200),
            donor_grant_ref=text(g.get('donor_grant_ref'), 'grant.donor_grant_ref', max_len=120),
            amount_committed_usd=money(g.get('amount_committed_usd'), 'grant.amount_committed_usd'),
            amount_received_usd=money(g.get('amount_received_usd'), 'grant.amount_received_usd') or 0.0,
            currency=(text(g.get('currency'), 'grant.currency', max_len=3) or 'USD').upper(),
            start_date=parse_date(g.get('start_date'), 'grant.start_date'),
            end_date=parse_date(g.get('end_date'), 'grant.end_date'),
            reporting_cadence=choice(g.get('reporting_cadence'), 'grant.reporting_cadence',
                                     REPORTING_CADENCES, default='final_only'),
            status=choice(g.get('status'), 'grant.status', GRANT_STATUSES, default='completed'),
            signed_at=parse_dt(g.get('signed_at'), 'grant.signed_at'),
        )
        if gdata['start_date'] and gdata['end_date'] and gdata['end_date'] < gdata['start_date']:
            raise PackageError('grant.end_date is before start_date')
        if (gdata['amount_committed_usd'] is not None
                and gdata['amount_received_usd'] > gdata['amount_committed_usd'] + 0.005):
            plan.warnings.append(f'grant {grant_ref}: received exceeds committed')
        grant_item = Item(kind='grant', op='create', ref=grant_ref, label=gtitle, data=gdata)
        existing = already_imported(ProximateGrant, grant_ref)
        if existing:
            grant_item.op, grant_item.existing_id = 'skip_imported', existing.id
            grant_item.notes.append(f'already imported as grant #{existing.id}')
        else:
            dup = None
            if gdata['donor_grant_ref']:
                dup = ProximateGrant.query.filter(
                    ProximateGrant.network_id == net.id,
                    func.lower(ProximateGrant.donor_grant_ref) == gdata['donor_grant_ref'].lower(),
                ).first()
            if dup is None:
                dup = ProximateGrant.query.filter(
                    ProximateGrant.network_id == net.id,
                    func.lower(ProximateGrant.title) == gtitle.lower(),
                ).first()
            if dup:
                grant_item.op, grant_item.existing_id = 'reuse', dup.id
                grant_item.notes.append(f'matches existing grant #{dup.id} "{dup.title}" — reused')
        plan.add(grant_item)
        alloc = money(g.get('allocated_to_round_usd'), 'grant.allocated_to_round_usd')
        if alloc is not None:
            committed = gdata['amount_committed_usd']
            alloc_item = Item(kind='allocation', op='create', ref=f'{grant_ref}->{round_ref}',
                              label=f'{gtitle} → {title}', data={'amount_usd': alloc})
            if committed is not None and alloc > committed + 0.005:
                alloc_item.op = 'error'
                alloc_item.notes.append(f'allocation {alloc} exceeds committed {committed}')
            plan.add(alloc_item)

    # ---- partners ----------------------------------------------------------
    existing_partners = ProximatePartner.query.filter_by(network_id=net.id).all()
    by_name = {}
    for p in existing_partners:
        for n in (p.name, p.name_ar):
            if n:
                by_name.setdefault(n.strip().lower(), p)
    partner_items: dict[str, Item] = {}
    seen_names: dict[str, str] = {}
    for idx, p in enumerate(pkg.get('partners') or []):
        if not isinstance(p, dict):
            raise PackageError(f'partners[{idx}]: must be an object')
        pref = _ref(p, f'partners[{idx}].source_ref')
        if pref in partner_items:
            raise PackageError(f'partners[{idx}]: duplicate source_ref {pref!r} in package')
        name = text(p.get('name'), f'partners[{idx}].name', required=True, max_len=200)
        name_ar = text(p.get('name_ar'), f'partners[{idx}].name_ar', max_len=200)
        pstatus = choice(p.get('status'), f'partners[{idx}].status', PARTNER_STATUSES, default=None)
        nominated_at = parse_dt(p.get('nominated_at'), f'partners[{idx}].nominated_at') or drafted_at
        dd_cleared_at = parse_dt(p.get('dd_cleared_at'), f'partners[{idx}].dd_cleared_at')
        pdata = dict(
            name=name, name_ar=name_ar,
            locality=text(p.get('locality'), f'partners[{idx}].locality', max_len=120),
            state=text(p.get('state'), f'partners[{idx}].state', max_len=16),
            country=text(p.get('country'), f'partners[{idx}].country', max_len=80) or 'SD',
            contact_email=text(p.get('contact_email'), f'partners[{idx}].contact_email', max_len=320),
            status=pstatus, nominated_at=nominated_at, dd_cleared_at=dd_cleared_at,
            trust_tier=text(p.get('trust_tier'), f'partners[{idx}].trust_tier', max_len=40),
        )
        item = Item(kind='partner', op='create', ref=pref, label=name, data=pdata)
        for n in (name, name_ar):
            if not n:
                continue
            key = n.strip().lower()
            if key in seen_names and seen_names[key] != pref:
                item.op = 'error'
                item.notes.append(f'name "{n}" also used by partner {seen_names[key]} in this package')
            seen_names[key] = pref
        if item.op != 'error':
            existing = already_imported(ProximatePartner, pref)
            if existing:
                item.op, item.existing_id = 'skip_imported', existing.id
                item.notes.append(f'already imported as partner #{existing.id}')
            else:
                match = by_name.get(name.strip().lower()) or (
                    by_name.get(name_ar.strip().lower()) if name_ar else None)
                if match and not p.get('force_create'):
                    item.op, item.existing_id = 'reuse', match.id
                    item.notes.append(
                        f'matches existing partner #{match.id} "{match.name}" ({match.status}) — reused, '
                        f'not twinned (set force_create: true to override)')
        partner_items[pref] = plan.add(item)

    # ---- awards → participants --------------------------------------------
    award_by_partner: dict[str, float] = {}
    participant_refs = set()
    for idx, a in enumerate(pkg.get('awards') or []):
        if not isinstance(a, dict):
            raise PackageError(f'awards[{idx}]: must be an object')
        pref = text(a.get('partner_ref'), f'awards[{idx}].partner_ref', required=True, max_len=120)
        if pref not in partner_items:
            raise PackageError(f'awards[{idx}].partner_ref {pref!r} does not name a partner in this package')
        if pref in participant_refs:
            raise PackageError(f'awards[{idx}]: partner {pref!r} awarded twice')
        participant_refs.add(pref)
        amount = money(a.get('amount_usd'), f'awards[{idx}].amount_usd', required=True)
        stage = choice(a.get('stage'), f'awards[{idx}].stage', PARTICIPANT_STAGES, default=None)
        award_by_partner[pref] = amount
        item = Item(kind='participant', op='create', ref=f'{round_ref}/{pref}',
                    label=f'{partner_items[pref].label} in {title}',
                    data={'partner_ref': pref, 'amount_usd': amount, 'stage': stage,
                          'notes': text(a.get('notes'), f'awards[{idx}].notes', max_len=2000)})
        if partner_items[pref].op == 'error':
            item.op = 'error'
            item.notes.append('partner row has errors')
        plan.add(item)

    # ---- disbursements -----------------------------------------------------
    disb_by_partner: dict[str, float] = {}
    disb_refs = set()
    for idx, d in enumerate(pkg.get('disbursements') or []):
        if not isinstance(d, dict):
            raise PackageError(f'disbursements[{idx}]: must be an object')
        dref = _ref(d, f'disbursements[{idx}].source_ref')
        if dref in disb_refs:
            raise PackageError(f'disbursements[{idx}]: duplicate source_ref {dref!r} in package')
        disb_refs.add(dref)
        pref = text(d.get('partner_ref'), f'disbursements[{idx}].partner_ref', required=True, max_len=120)
        if pref not in partner_items:
            raise PackageError(f'disbursements[{idx}].partner_ref {pref!r} does not name a partner in this package')
        amount = money(d.get('amount_usd'), f'disbursements[{idx}].amount_usd', required=True)
        sent_at = parse_dt(d.get('sent_at'), f'disbursements[{idx}].sent_at')
        if sent_at is None:
            raise PackageError(f'disbursements[{idx}].sent_at: required (original release date)')
        if sent_at < drafted_at:
            raise PackageError(f'disbursements[{idx}].sent_at is before the round was opened')
        report_due_at = parse_dt(d.get('report_due_at'), f'disbursements[{idx}].report_due_at')
        report_submitted_at = parse_dt(d.get('report_submitted_at'), f'disbursements[{idx}].report_submitted_at')
        received_at = parse_dt(d.get('received_at'), f'disbursements[{idx}].received_at')
        item = Item(kind='disbursement', op='create', ref=dref,
                    label=f'${amount:,.2f} → {partner_items[pref].label} ({sent_at.date().isoformat()})')
        if report_due_at is None:
            report_due_at = sent_at + timedelta(days=DEFAULT_REPORT_WINDOW_DAYS)
            item.notes.append(f'report_due_at not given; set to sent + {DEFAULT_REPORT_WINDOW_DAYS} days')
        dstatus = choice(d.get('status'), f'disbursements[{idx}].status', DISBURSEMENT_STATUSES, default=None)
        if dstatus is None:
            if d.get('verified') is True:
                dstatus = 'verified'
            elif report_submitted_at:
                dstatus = 'reported'
            else:
                dstatus = 'pending_report'
            item.notes.append(f'status not given; reconstructed as {dstatus!r}')
        if dstatus == 'pending_cosign':
            item.op = 'error'
            item.notes.append('a historical release cannot be awaiting a co-signature')
        if dstatus in ('reported', 'verified', 'flagged') and not report_submitted_at:
            item.op = 'error'
            item.notes.append(f'status {dstatus} needs report_submitted_at')
        item.data = dict(
            partner_ref=pref, amount_usd=amount, sent_at=sent_at, status=dstatus,
            report_due_at=report_due_at, report_submitted_at=report_submitted_at,
            received_at=received_at,
            purpose=text(d.get('purpose'), f'disbursements[{idx}].purpose', max_len=500),
        )
        disb_by_partner[pref] = disb_by_partner.get(pref, 0.0) + amount
        if partner_items[pref].op == 'error':
            item.op = 'error'
            item.notes.append('partner row has errors')
        elif item.op != 'error':
            existing = already_imported(ProximateDisbursement, dref)
            if existing:
                item.op, item.existing_id = 'skip_imported', existing.id
                item.notes.append(f'already imported as disbursement #{existing.id}')
            elif partner_items[pref].existing_id:
                # Duplicate detection against releases the reused partner already has.
                for ex in ProximateDisbursement.query.filter_by(
                        network_id=net.id, partner_id=partner_items[pref].existing_id).all():
                    ex_sent = ex.sent_at.date() if ex.sent_at else None
                    if ex_sent == sent_at.date() and abs(float(ex.amount_usd or 0) - amount) < 0.005:
                        item.op, item.existing_id = 'skip_duplicate', ex.id
                        item.notes.append(
                            f'partner already has a ${amount:,.2f} release on {ex_sent} (#{ex.id}) — skipped')
                        break
        plan.add(item)

    # ---- financial reconciliation -----------------------------------------
    total_disb = sum(i.data['amount_usd'] for i in plan.by_kind('disbursement') if i.op == 'create')
    total_awards = sum(award_by_partner.values())
    if envelope is not None and total_disb > envelope + 0.005:
        plan.warnings.append(
            f'disbursements to create (${total_disb:,.2f}) exceed the round envelope (${envelope:,.2f})')
    if envelope is not None and total_awards > envelope + 0.005:
        plan.warnings.append(
            f'awards (${total_awards:,.2f}) exceed the round envelope (${envelope:,.2f})')
    for pref, awarded in award_by_partner.items():
        released = disb_by_partner.get(pref, 0.0)
        if abs(released - awarded) > 0.005:
            plan.warnings.append(
                f'partner {pref}: awarded ${awarded:,.2f} but releases total ${released:,.2f}')
    for pref in disb_by_partner:
        if pref not in award_by_partner:
            plan.warnings.append(f'partner {pref}: has releases but no award row (no roster entry will be created)')
    for i in plan.by_kind('participant'):
        if i.op == 'create' and i.data['stage'] is None:
            pref = i.data['partner_ref']
            has_disb = any(d.op == 'create' and d.data['partner_ref'] == pref for d in plan.by_kind('disbursement'))
            reported = any(d.op == 'create' and d.data['partner_ref'] == pref and d.data['report_submitted_at']
                           for d in plan.by_kind('disbursement'))
            # Product roster vocabulary (ProximateRoundParticipant.stage): an award
            # row means at least 'awarded'; money moved means 'disbursed'; a
            # report on file means 'reported'.
            i.data['stage'] = 'reported' if reported else ('disbursed' if has_disb else 'awarded')
            i.notes.append(f'stage not given; reconstructed as {i.data["stage"]!r}')
    for i in plan.by_kind('partner'):
        if i.op == 'create' and i.data['status'] is None:
            pref = i.ref
            has_disb = pref in disb_by_partner
            i.data['status'] = 'dd_clear' if has_disb else 'nominated'
            i.notes.append(f'status not given; reconstructed as {i.data["status"]!r}'
                           + ('' if has_disb else ' (no releases)'))
    return plan


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------

def apply_plan(plan: Plan, *, net, actor, models, db, AuditChainEntry) -> dict:
    (ProximateRound, ProximateRoundParticipant, ProximatePartner,
     ProximateDisbursement, ProximateGrant, ProximateGrantAllocation) = models
    if plan.errors:
        raise PackageError('plan has errors; nothing applied')
    batch = plan.batch_id
    created: list[tuple[str, int, Item, dict]] = []   # (subject_kind, id, item, original_dates)

    # Partners first (rounds and disbursements point at them).
    partner_id_by_ref: dict[str, int] = {}
    for i in plan.by_kind('partner'):
        if i.op in ('reuse', 'skip_imported'):
            partner_id_by_ref[i.ref] = i.existing_id
            continue
        if i.op != 'create':
            continue
        d = i.data
        p = ProximatePartner(
            network_id=net.id, name=d['name'], name_ar=d['name_ar'],
            locality=d['locality'], state=d['state'], country=d['country'],
            contact_email=d['contact_email'], status=d['status'],
            trust_tier=d['trust_tier'], nominated_by_user_id=actor.id,
            nominated_at=d['nominated_at'], dd_cleared_at=d['dd_cleared_at'],
            import_batch_id=batch, import_source_ref=i.ref,
        )
        db.session.add(p)
        db.session.flush()
        i.created_id = p.id
        partner_id_by_ref[i.ref] = p.id
        created.append(('proximate_partner', p.id, i,
                        {'nominated_at': iso(d['nominated_at']), 'dd_cleared_at': iso(d['dd_cleared_at'])}))

    # Round.
    ri = plan.by_kind('round')[0]
    if ri.op == 'create':
        d = ri.data
        rnd = ProximateRound(
            network_id=net.id, title=d['title'], title_ar=d['title_ar'],
            trigger_type=d['trigger_type'], trigger_summary=d['trigger_summary'],
            donor_name=d['donor_name'], envelope_usd=d['envelope_usd'],
            target_country=d['target_country'], target_region=d['target_region'],
            target_locality=d['target_locality'], status=d['status'], phase=d['phase'],
            drafted_by_user_id=actor.id, drafted_at=d['drafted_at'],
            submitted_at=d['submitted_at'], activated_at=d['activated_at'],
            closed_at=d['closed_at'], cancelled_at=d['cancelled_at'],
            closing_summary=d['closing_summary'], cancellation_reason=d['cancellation_reason'],
            import_batch_id=batch, import_source_ref=ri.ref,
        )
        db.session.add(rnd)
        db.session.flush()
        ri.created_id = rnd.id
        round_id = rnd.id
        created.append(('proximate_round', rnd.id, ri, {
            'drafted_at': iso(d['drafted_at']), 'submitted_at': iso(d['submitted_at']),
            'activated_at': iso(d['activated_at']), 'closed_at': iso(d['closed_at']),
            'cancelled_at': iso(d['cancelled_at'])}))
    else:
        round_id = ri.existing_id

    # Grant + allocation.
    grant_id = None
    for i in plan.by_kind('grant'):
        if i.op in ('reuse', 'skip_imported'):
            grant_id = i.existing_id
            continue
        d = i.data
        gr = ProximateGrant(
            network_id=net.id, title=d['title'], donor_name_cache=d['donor_name_cache'],
            donor_grant_ref=d['donor_grant_ref'], amount_committed_usd=d['amount_committed_usd'],
            amount_received_usd=d['amount_received_usd'], currency=d['currency'],
            start_date=d['start_date'], end_date=d['end_date'],
            reporting_cadence=d['reporting_cadence'], status=d['status'], signed_at=d['signed_at'],
            created_by_user_id=actor.id, import_batch_id=batch, import_source_ref=i.ref,
        )
        db.session.add(gr)
        db.session.flush()
        i.created_id = gr.id
        grant_id = gr.id
        created.append(('proximate_grant', gr.id, i, {
            'start_date': iso(d['start_date']), 'end_date': iso(d['end_date']),
            'signed_at': iso(d['signed_at'])}))
    for i in plan.by_kind('allocation'):
        if i.op != 'create' or grant_id is None or round_id is None:
            continue
        exists = ProximateGrantAllocation.query.filter_by(grant_id=grant_id, round_id=round_id).first()
        if exists:
            i.op, i.existing_id = 'skip_duplicate', exists.id
            i.notes.append('allocation already exists')
            continue
        al = ProximateGrantAllocation(
            grant_id=grant_id, round_id=round_id, amount_usd=i.data['amount_usd'],
            notes=f'{HISTORICAL_NOTE} (batch {batch})',
        )
        db.session.add(al)
        db.session.flush()
        i.created_id = al.id

    # Roster.
    for i in plan.by_kind('participant'):
        if i.op != 'create':
            continue
        pid = partner_id_by_ref.get(i.data['partner_ref'])
        if pid is None or round_id is None:
            continue
        exists = ProximateRoundParticipant.query.filter_by(round_id=round_id, partner_id=pid).first()
        if exists:
            i.op, i.existing_id = 'skip_duplicate', exists.id
            i.notes.append('partner already on this roster')
            continue
        part = ProximateRoundParticipant(
            round_id=round_id, partner_id=pid, stage=i.data['stage'],
            notes=(i.data['notes'] or f'{HISTORICAL_NOTE} (batch {batch})'
                   + f' — awarded ${i.data["amount_usd"]:,.2f}'),
            added_by_user_id=actor.id,
        )
        db.session.add(part)
        db.session.flush()
        i.created_id = part.id

    # Releases — no tokens, no cosign, no receipt/report links.
    for i in plan.by_kind('disbursement'):
        if i.op != 'create':
            continue
        d = i.data
        pid = partner_id_by_ref.get(d['partner_ref'])
        if pid is None:
            continue
        ds = ProximateDisbursement(
            network_id=net.id, partner_id=pid, round_id=round_id,
            amount_usd=Decimal(str(d['amount_usd'])), purpose=d['purpose'],
            sent_at=d['sent_at'], sent_by_user_id=actor.id, status=d['status'],
            report_due_at=d['report_due_at'], report_submitted_at=d['report_submitted_at'],
            received_at=d['received_at'], cosigners_required=0,
            import_batch_id=batch, import_source_ref=i.ref,
        )
        db.session.add(ds)
        db.session.flush()
        i.created_id = ds.id
        created.append(('proximate_disbursement', ds.id, i, {
            'sent_at': iso(d['sent_at']), 'report_due_at': iso(d['report_due_at']),
            'report_submitted_at': iso(d['report_submitted_at']), 'received_at': iso(d['received_at'])}))

    db.session.commit()

    # A re-run that created nothing is a no-op all the way down: no audit
    # entry either, or every idle re-run would grow the chain.
    if not created and not any(i.created_id for i in plan.items):
        return {'round_id': round_id, 'grant_id': grant_id, 'created_rows': 0, 'audit_entries': 0,
                'note': 'nothing new — every row was already imported'}

    # ONE honest audit entry per created row, plus a batch summary. Never a
    # fabricated nomination / signature / release event.
    audit_seqs = []
    for kind, sid, item, original_dates in created:
        e = AuditChainEntry.append(
            action=ACTION_IMPORTED, actor_email=actor.email,
            subject_kind=kind, subject_id=sid,
            details={'note': HISTORICAL_NOTE, 'batch_id': batch, 'source': plan.source,
                     'source_ref': item.ref, 'original_dates': original_dates,
                     'imported_at': datetime.now(timezone.utc).isoformat()},
            network_id=net.id,
        )
        if e is not None:
            audit_seqs.append(e.seq)
    summary = AuditChainEntry.append(
        action=ACTION_BATCH, actor_email=actor.email,
        subject_kind='proximate_round', subject_id=round_id,
        details={'note': HISTORICAL_NOTE, 'batch_id': batch, 'source': plan.source,
                 'created': {k: sum(1 for c in created if c[0] == k)
                             for k in ('proximate_partner', 'proximate_round',
                                       'proximate_grant', 'proximate_disbursement')},
                 'reused_partners': sum(1 for i in plan.by_kind('partner') if i.op == 'reuse'),
                 'imported_at': datetime.now(timezone.utc).isoformat()},
        network_id=net.id,
    )
    return {'round_id': round_id, 'grant_id': grant_id,
            'created_rows': len(created), 'audit_entries': len(audit_seqs) + (1 if summary else 0)}


# ---------------------------------------------------------------------------
# Rollback
# ---------------------------------------------------------------------------

def rollback_batch(batch: str, *, net, actor, models, db, AuditChainEntry, confirm: bool) -> dict:
    (ProximateRound, ProximateRoundParticipant, ProximatePartner,
     ProximateDisbursement, ProximateGrant, ProximateGrantAllocation) = models
    rounds = ProximateRound.query.filter_by(network_id=net.id, import_batch_id=batch).all()
    partners = ProximatePartner.query.filter_by(network_id=net.id, import_batch_id=batch).all()
    disbs = ProximateDisbursement.query.filter_by(network_id=net.id, import_batch_id=batch).all()
    grants = ProximateGrant.query.filter_by(network_id=net.id, import_batch_id=batch).all()
    if not (rounds or partners or disbs or grants):
        raise PackageError(f'batch {batch!r}: nothing to roll back in this tenant')

    subjects = ([('proximate_round', r.id) for r in rounds]
                + [('proximate_partner', p.id) for p in partners]
                + [('proximate_disbursement', d.id) for d in disbs]
                + [('proximate_grant', g.id) for g in grants])
    touched = []
    for kind, sid in subjects:
        later = AuditChainEntry.query.filter(
            AuditChainEntry.subject_kind == kind,
            AuditChainEntry.subject_id == sid,
            ~AuditChainEntry.action.like('proximate.historical.%'),
        ).count()
        if later:
            touched.append(f'{kind} #{sid} ({later} audited action(s) since import)')
    plan = {
        'batch_id': batch,
        'rounds': [r.id for r in rounds], 'partners': [p.id for p in partners],
        'disbursements': [d.id for d in disbs], 'grants': [g.id for g in grants],
        'blocked_by_later_activity': touched,
    }
    if touched:
        raise PackageError('refusing to roll back: product activity has happened on imported rows — '
                           + '; '.join(touched))
    if not confirm:
        return {'dry_run': True, **plan}

    round_ids = [r.id for r in rounds]
    grant_ids = [g.id for g in grants]
    if grant_ids:
        ProximateGrantAllocation.query.filter(ProximateGrantAllocation.grant_id.in_(grant_ids)).delete(
            synchronize_session=False)
    if round_ids:
        ProximateGrantAllocation.query.filter(ProximateGrantAllocation.round_id.in_(round_ids)).delete(
            synchronize_session=False)
    for d in disbs:
        db.session.delete(d)
    if round_ids:
        ProximateRoundParticipant.query.filter(ProximateRoundParticipant.round_id.in_(round_ids)).delete(
            synchronize_session=False)
    for r in rounds:
        db.session.delete(r)
    for g in grants:
        db.session.delete(g)
    for p in partners:
        db.session.delete(p)
    db.session.commit()
    AuditChainEntry.append(
        action=ACTION_ROLLED_BACK, actor_email=actor.email,
        subject_kind='proximate_round', subject_id=(round_ids[0] if round_ids else None),
        details={'batch_id': batch, 'removed': {k: v for k, v in plan.items()
                                                 if k in ('rounds', 'partners', 'disbursements', 'grants')},
                 'rolled_back_at': datetime.now(timezone.utc).isoformat()},
        network_id=net.id,
    )
    return {'dry_run': False, **plan}


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_plan(plan: Plan, *, mode: str) -> None:
    print('=' * 72)
    print(f'HISTORICAL IMPORT — {mode.upper()} — batch {plan.batch_id}')
    print(f'source: {plan.source}')
    print('=' * 72)
    for i in plan.items:
        tag = {'create': 'CREATE', 'reuse': 'REUSE ', 'skip_imported': 'SKIP  ',
               'skip_duplicate': 'DUP   ', 'error': 'ERROR '}[i.op]
        extra = f' #{i.existing_id}' if i.existing_id else ''
        extra += f' -> #{i.created_id}' if i.created_id else ''
        print(f'{tag} {i.kind:12} {i.ref:24} {i.label}{extra}')
        for n in i.notes:
            print(f'       · {n}')
    if plan.warnings:
        print('-' * 72)
        print('WARNINGS (review before applying):')
        for w in plan.warnings:
            print(f'  ! {w}')
    if plan.errors:
        print('-' * 72)
        print('ERRORS (nothing will be written):')
        for e in plan.errors:
            print(f'  x {e}')
    print('-' * 72)
    print('totals:', json.dumps(plan.totals(), sort_keys=True))
    print('=' * 72)


def plan_to_json(plan: Plan, *, mode: str, result: dict | None) -> dict:
    return {
        'mode': mode,
        'batch_id': plan.batch_id,
        'source': plan.source,
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'items': [{
            'kind': i.kind, 'op': i.op, 'ref': i.ref, 'label': i.label,
            'existing_id': i.existing_id, 'created_id': i.created_id, 'notes': i.notes,
            'data': {k: (iso(v) if isinstance(v, (datetime, date)) else v) for k, v in i.data.items()},
        } for i in plan.items],
        'warnings': plan.warnings,
        'errors': plan.errors,
        'totals': plan.totals(),
        'result': result,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _load_context(actor_email: str):
    from app import create_app
    from app.extensions import db
    from app.models import User, Network, NetworkMembership
    from app.models.audit_chain import AuditChainEntry
    from app.models.proximate_round import ProximateRound, ProximateRoundParticipant
    from app.models.proximate_endorsement import ProximatePartner
    from app.models.proximate_disbursement import ProximateDisbursement
    from app.models.proximate_grant import ProximateGrant, ProximateGrantAllocation

    app = create_app()
    ctx = app.app_context()
    ctx.push()
    net = Network.query.filter_by(slug='proximate').first()
    if net is None:
        raise PackageError('proximate network not found in this database')
    actor = User.query.filter(User.email.ilike(actor_email.strip())).first()
    if actor is None or not getattr(actor, 'is_active', True):
        raise PackageError(f'--actor {actor_email!r}: no active user with that email')
    seat = NetworkMembership.query.filter_by(
        network_id=net.id, org_id=actor.org_id, is_oversight_body=True, status='active',
    ).first() if actor.org_id else None
    if seat is None:
        raise PackageError(f'--actor {actor_email!r} does not hold an active Oversight Body seat on '
                           f'the Proximate network; historical imports are an OB action')
    models = (ProximateRound, ProximateRoundParticipant, ProximatePartner,
              ProximateDisbursement, ProximateGrant, ProximateGrantAllocation)
    return ctx, db, net, actor, models, AuditChainEntry


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('package', nargs='?', help='JSON package (see docs/historical_import/README.md)')
    ap.add_argument('--actor', required=True, help='email of the Oversight Body member performing the import')
    ap.add_argument('--apply', action='store_true', help='write the plan (requires --confirm-historical)')
    ap.add_argument('--confirm-historical', action='store_true',
                    help='second key for --apply: I have reviewed the preview and the original dates')
    ap.add_argument('--rollback', metavar='BATCH_ID', help='remove everything a batch created')
    ap.add_argument('--confirm-rollback', action='store_true', help='second key for --rollback')
    ap.add_argument('--report', metavar='OUT.json', help='write the plan / result as JSON')
    args = ap.parse_args(argv)

    if bool(args.package) == bool(args.rollback):
        ap.error('pass exactly one of PACKAGE.json or --rollback BATCH_ID')
    if args.apply and not args.confirm_historical:
        ap.error('--apply also needs --confirm-historical')

    try:
        ctx, db, net, actor, models, AuditChainEntry = _load_context(args.actor)
    except PackageError as ex:
        print(f'ERROR: {ex}')
        return 2

    try:
        if args.rollback:
            res = rollback_batch(args.rollback, net=net, actor=actor, models=models, db=db,
                                 AuditChainEntry=AuditChainEntry, confirm=args.confirm_rollback)
            mode = 'rollback' if args.confirm_rollback else 'rollback preview'
            print(f'{mode.upper()}: {json.dumps(res, indent=2)}')
            if args.report:
                with open(args.report, 'w', encoding='utf-8') as fh:
                    json.dump({'mode': mode, **res}, fh, indent=2)
            if not args.confirm_rollback:
                print('Nothing removed. Re-run with --confirm-rollback to apply.')
            return 0

        pkg = load_package(args.package)
        plan = build_plan(pkg, net=net, actor=actor, models=models)
        mode = 'apply' if args.apply else 'preview'
        result = None
        if args.apply and not plan.errors:
            result = apply_plan(plan, net=net, actor=actor, models=models, db=db,
                                AuditChainEntry=AuditChainEntry)
        print_plan(plan, mode=mode)
        if result:
            print('APPLIED:', json.dumps(result))
        elif args.apply:
            print('NOT APPLIED: fix the errors above and re-run.')
        else:
            print('Nothing written. Re-run with --apply --confirm-historical to import.')
        if args.report:
            with open(args.report, 'w', encoding='utf-8') as fh:
                json.dump(plan_to_json(plan, mode=mode, result=result), fh, indent=2, ensure_ascii=False)
            print(f'report written: {args.report}')
        return 1 if plan.errors else 0
    except PackageError as ex:
        db.session.rollback()
        print(f'ERROR: {ex}')
        return 1
    finally:
        ctx.pop()


if __name__ == '__main__':
    sys.exit(main())

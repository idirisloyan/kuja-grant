"""
TrustProfileService — Phase 1 (May 2026 truth-in-claims)
========================================================

The Two-Pillar Trust Profile is Kuja's headline framing for due
diligence. The BRD describes it; until Phase 1, the underlying
data (assessments, diligence items, sanctions, registration, etc.)
existed but was never assembled into a single coherent profile.

This service does the assembly. It's read-only: no new schema, just
a deterministic synthesis across existing models.

Two pillars:

  CAPACITY PROFILE (what the NGO can do)
    - 5 framework assessments (Kuja, STEP, UN-HACT, CHS, NUPAS)
    - latest score per framework
    - top 3 strengths + top 3 gaps
    - completion % across frameworks

  DUE DILIGENCE PROFILE (whether the NGO is safe to fund)
    - Registration verification (status, last checked, expiry)
    - Sanctions screening (UN/OFAC/EU, last run, flags)
    - PEP screening (latest run)
    - Adverse media screening (latest run, finding counts)
    - Bank account verification (latest, risk score)
    - Beneficial ownership disclosure (presence / age)

Each pillar produces:
    score        — 0-100 composite
    status       — clear | review | flagged | incomplete
    last_updated — most recent input timestamp
    breakdown    — per-sub-component {label, score, status, last_updated, evidence_url}

Composite ("overall") trust:
    Average of two pillar scores; status is the worst of the two
    (a flagged due diligence pillar can't be overridden by a strong
    capacity score).

Why this is the moat:
    Most platforms give donors raw artifacts: "here's the sanctions
    check, here's the assessment PDF." Kuja synthesises them into a
    single defensible answer ("Trust score 78 / 100. Capacity strong,
    one pending medium-severity adverse media item.") with the
    drilldown evidence one click away.
"""

import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import (
    Organization,
    Assessment,
    ComplianceCheck,
    RegistrationVerification,
    AdverseMediaScreening,
    BankAccountVerification,
    Document,
)

logger = logging.getLogger('kuja')


class TrustProfileService:

    # Framework weights for capacity score (sum to 100)
    FRAMEWORK_WEIGHTS = {
        'kuja':    30,
        'step':    20,
        'un_hact': 20,
        'chs':     15,
        'nupas':   15,
    }

    # Due diligence sub-component weights (sum to 100)
    DD_WEIGHTS = {
        'registration':   25,
        'sanctions':      25,
        'pep':            15,
        'adverse_media':  20,
        'bank':           10,
        'ownership':       5,
    }

    @classmethod
    def build(cls, org_id: int) -> dict | None:
        """Assemble the full Trust Profile for an organisation.

        Returns None if the org doesn't exist.
        """
        org = db.session.get(Organization, org_id)
        if not org:
            return None

        capacity = cls._build_capacity_pillar(org)
        diligence = cls._build_diligence_pillar(org)

        # Composite score: average of two pillars
        overall_score = int(round((capacity['score'] + diligence['score']) / 2))

        # Phase 99 follow-up — verdict's second retest found overall
        # remained "Clear" while Due Diligence was "28/100 Flagged".
        # Root cause: `max(..., key=order.index)` picks the element with
        # the HIGHEST index, which is 'clear' (3) — it was selecting the
        # BEST status, not the worst. Switched to `min` so 'flagged' (0)
        # wins. Also reconcile with the composite score band so the
        # banner can't claim Clear at < 70 overall.
        order = ['flagged', 'review', 'incomplete', 'clear']
        worst = min(
            [capacity['status'], diligence['status']],
            key=lambda s: order.index(s) if s in order else len(order),
        )
        if overall_score < 40:
            score_band = 'flagged'
        elif overall_score < 70:
            score_band = 'review'
        else:
            score_band = 'clear'
        worst = min(
            [worst, score_band],
            key=lambda s: order.index(s) if s in order else len(order),
        )

        # Sector: prefer first entry of org.sectors (JSON array), fall back to single field
        sector = None
        try:
            if hasattr(org, 'sectors') and org.sectors:
                import json
                arr = json.loads(org.sectors) if isinstance(org.sectors, str) else org.sectors
                if isinstance(arr, list) and arr:
                    sector = arr[0]
        except Exception:
            pass
        if sector is None:
            sector = getattr(org, 'sector', None)

        return {
            'org_id': org.id,
            'org_name': org.name,
            'country': org.country,
            'sector': sector,
            'verified_badge': org.verified,    # legacy field; passport is the modern signal
            'overall': {
                'score': overall_score,
                'status': worst,
                'computed_at': datetime.now(timezone.utc).isoformat(),
            },
            'capacity': capacity,
            'diligence': diligence,
        }

    # ------------------------------------------------------------------
    # CAPACITY PILLAR
    # ------------------------------------------------------------------

    @classmethod
    def _build_capacity_pillar(cls, org: Organization) -> dict:
        # Latest completed assessment per framework
        latest_per_framework = {}
        all_assessments = (
            Assessment.query
            .filter_by(org_id=org.id)
            .order_by(Assessment.created_at.desc())
            .all()
        )
        for a in all_assessments:
            if a.framework not in latest_per_framework:
                latest_per_framework[a.framework] = a

        # Build per-framework breakdown
        breakdown = []
        weighted_total = 0
        weight_used = 0
        completed_count = 0
        for fw_key, weight in cls.FRAMEWORK_WEIGHTS.items():
            a = latest_per_framework.get(fw_key)
            if a and a.overall_score is not None:
                fw_score = int(round(a.overall_score))
                weighted_total += fw_score * weight
                weight_used += weight
                completed_count += 1
                breakdown.append({
                    'framework': fw_key,
                    'label': cls._framework_label_for_network(fw_key),
                    'status': a.status or 'completed',
                    'score': fw_score,
                    'last_updated': a.updated_at.isoformat() if a.updated_at else None,
                    'weight': weight,
                })
            else:
                breakdown.append({
                    'framework': fw_key,
                    'label': cls._framework_label_for_network(fw_key),
                    'status': 'not_started',
                    'score': None,
                    'last_updated': None,
                    'weight': weight,
                })

        capacity_score = int(round(weighted_total / weight_used)) if weight_used else 0
        completion_pct = int(round((completed_count / len(cls.FRAMEWORK_WEIGHTS)) * 100))

        if completed_count == 0:
            status = 'incomplete'
        elif capacity_score < 40:
            status = 'flagged'
        elif capacity_score < 70:
            status = 'review'
        else:
            status = 'clear'

        # Top strengths + gaps from the most recent assessment with breakdown
        strengths, gaps = cls._extract_strengths_gaps(all_assessments)

        return {
            'score': capacity_score,
            'status': status,
            'completion_pct': completion_pct,
            'frameworks_completed': completed_count,
            'frameworks_total': len(cls.FRAMEWORK_WEIGHTS),
            'breakdown': breakdown,
            'strengths': strengths,
            'gaps': gaps,
        }

    @staticmethod
    def _framework_label(key: str) -> str:
        """Static framework name. For the network-specific in-house
        framework label (e.g. 'NEAR Capacity Framework' when in NEAR),
        use _framework_label_for_network() instead.
        """
        return {
            'kuja': 'Kuja Capacity Framework',
            'step': 'STEP (Strategic Tools for Evaluating People)',
            'un_hact': 'UN HACT (Harmonized Approach to Cash Transfers)',
            'chs': 'CHS (Core Humanitarian Standard)',
            'nupas': 'NUPAS (Non-US Pre-Award Survey)',
        }.get(key, key.upper())

    @classmethod
    def _framework_label_for_network(cls, key: str) -> str:
        """Phase 99 — render the in-house framework with the current
        network's display name when on a non-default tenant.

        On Kuja marketplace this returns the same label as before. On
        NEAR (or any other network), if `Network.assessment_framework_display`
        is set, that string is returned for the 'kuja' key so members
        see 'NEAR Capacity Framework' / their own brand instead of the
        parent platform label. All other framework keys (STEP, HACT,
        etc.) are external standards and stay unchanged.
        """
        if key != 'kuja':
            return cls._framework_label(key)
        try:
            from app.utils.network import get_current_network
            net = get_current_network()
            if net and not getattr(net, 'is_default', True):
                custom = getattr(net, 'assessment_framework_display', None)
                if custom:
                    return custom
        except Exception:
            pass
        return cls._framework_label(key)

    @classmethod
    def _extract_strengths_gaps(cls, assessments: list) -> tuple[list[str], list[str]]:
        """Best-effort extraction of top strengths and gaps from the most
        recent completed assessment.

        Strengths derived from highest-scoring categories (category_scores).
        Gaps from the assessment.gaps JSON array.
        """
        for a in assessments:
            if (a.status or '') != 'completed':
                continue
            try:
                # Strengths: top 3 categories by score
                cat = a.get_category_scores() or {}
                strengths = []
                if cat:
                    ranked = sorted(cat.items(), key=lambda kv: kv[1] or 0, reverse=True)
                    strengths = [f'{k} ({v}/100)' for k, v in ranked[:3] if v]
                gaps_raw = a.get_gaps() or []
                gaps = []
                for g in gaps_raw[:3]:
                    if isinstance(g, dict):
                        # Phase 99 — verdict found "{'category': 'financial',
                        # 'score': 78, ...}" rendering raw in the UI when
                        # neither description nor title was present.
                        # Compose a human-readable summary from known
                        # fields instead of dumping the dict's repr.
                        label = (
                            g.get('description')
                            or g.get('title')
                            or g.get('summary')
                            or g.get('label')
                        )
                        if not label:
                            category = g.get('category') or g.get('area') or 'this area'
                            score = g.get('score')
                            label = (
                                f'Score in {category}: {score}/100'
                                if score is not None
                                else f'Gap in {category}'
                            )
                        gaps.append(label)
                    else:
                        gaps.append(str(g))
                if strengths or gaps:
                    return (strengths, gaps)
            except Exception:
                continue
        return ([], [])

    # ------------------------------------------------------------------
    # DUE DILIGENCE PILLAR
    # ------------------------------------------------------------------

    @classmethod
    def _build_diligence_pillar(cls, org: Organization) -> dict:
        components = []
        weighted_total = 0
        weight_used = 0
        worst_status = 'clear'
        status_order = {'flagged': 0, 'review': 1, 'incomplete': 2, 'clear': 3}

        # 1. Registration
        reg_comp = cls._registration_component(org)
        components.append(reg_comp)
        weighted_total += reg_comp['score'] * cls.DD_WEIGHTS['registration']
        weight_used += cls.DD_WEIGHTS['registration']
        worst_status = cls._worse_status(worst_status, reg_comp['status'], status_order)

        # 2. Sanctions
        san_comp = cls._sanctions_component(org)
        components.append(san_comp)
        weighted_total += san_comp['score'] * cls.DD_WEIGHTS['sanctions']
        weight_used += cls.DD_WEIGHTS['sanctions']
        worst_status = cls._worse_status(worst_status, san_comp['status'], status_order)

        # 3. PEP
        pep_comp = cls._pep_component(org)
        components.append(pep_comp)
        weighted_total += pep_comp['score'] * cls.DD_WEIGHTS['pep']
        weight_used += cls.DD_WEIGHTS['pep']
        worst_status = cls._worse_status(worst_status, pep_comp['status'], status_order)

        # 4. Adverse media
        am_comp = cls._adverse_media_component(org)
        components.append(am_comp)
        weighted_total += am_comp['score'] * cls.DD_WEIGHTS['adverse_media']
        weight_used += cls.DD_WEIGHTS['adverse_media']
        worst_status = cls._worse_status(worst_status, am_comp['status'], status_order)

        # 5. Bank
        bank_comp = cls._bank_component(org)
        components.append(bank_comp)
        weighted_total += bank_comp['score'] * cls.DD_WEIGHTS['bank']
        weight_used += cls.DD_WEIGHTS['bank']
        worst_status = cls._worse_status(worst_status, bank_comp['status'], status_order)

        # 6. Beneficial ownership (proxy: any uploaded "ownership" doc)
        own_comp = cls._ownership_component(org)
        components.append(own_comp)
        weighted_total += own_comp['score'] * cls.DD_WEIGHTS['ownership']
        weight_used += cls.DD_WEIGHTS['ownership']
        worst_status = cls._worse_status(worst_status, own_comp['status'], status_order)

        diligence_score = int(round(weighted_total / weight_used)) if weight_used else 0

        # Phase 99 — verdict found "Due Diligence 28/100 · Clear" — score
        # said flagged, status said clear because the two were computed
        # independently. Reconcile: take the WORSE of the
        # component-driven worst_status and the score-band status so the
        # banner can never claim Clear when the score is in the flagged
        # range. Mirrors the capacity pillar's score-to-status mapping
        # (lines ~185-192 above this method).
        if diligence_score < 40:
            score_band = 'flagged'
        elif diligence_score < 70:
            score_band = 'review'
        else:
            score_band = 'clear'
        reconciled_status = cls._worse_status(worst_status, score_band, status_order)

        # Phase 99 follow-up — verdict's second retest gave
        # "Registration 10/100 · Clear" as a per-component contradiction.
        # Each component builder returns its own status independently of
        # the score it returns; reconcile here so a low-scoring component
        # can never claim Clear. Same score bands as the pillar.
        for comp in components:
            try:
                c_score = int(comp.get('score') or 0)
            except (TypeError, ValueError):
                c_score = 0
            if c_score < 40:
                c_band = 'flagged'
            elif c_score < 70:
                c_band = 'review'
            else:
                c_band = 'clear'
            current = comp.get('status') or 'clear'
            comp['status'] = cls._worse_status(current, c_band, status_order)

        # And re-derive the pillar's worst_status from the now-reconciled
        # components so the pillar banner matches what users see in the
        # breakdown.
        for comp in components:
            reconciled_status = cls._worse_status(
                reconciled_status, comp.get('status') or 'clear', status_order,
            )

        return {
            'score': diligence_score,
            'status': reconciled_status,
            'breakdown': components,
        }

    @staticmethod
    def _worse_status(current: str, candidate: str, status_order: dict) -> str:
        return current if status_order.get(current, 99) < status_order.get(candidate, 99) else candidate

    @classmethod
    def _registration_component(cls, org: Organization) -> dict:
        latest = (
            RegistrationVerification.query
            .filter_by(org_id=org.id)
            .order_by(RegistrationVerification.updated_at.desc())
            .first()
        )
        if not latest:
            return {
                'key': 'registration',
                'label': 'Registration Verification',
                'status': 'incomplete',
                'score': 0,
                'last_updated': None,
                'detail': 'Not yet verified.',
            }
        status_map = {
            'verified': ('clear', 100),
            'ai_reviewed': ('review', 75),
            'pending': ('incomplete', 40),
            'flagged': ('flagged', 10),
            'expired': ('flagged', 20),
            'unverified': ('incomplete', 0),
        }
        st, score = status_map.get(latest.status, ('incomplete', 30))
        return {
            'key': 'registration',
            'label': 'Registration Verification',
            'status': st,
            'score': score,
            'last_updated': latest.updated_at.isoformat() if latest.updated_at else None,
            'detail': f'{latest.country or "?"} — {latest.registration_authority or "registry"}',
            'expires_at': latest.expiry_date.isoformat() if latest.expiry_date else None,
        }

    @classmethod
    def _sanctions_component(cls, org: Organization) -> dict:
        checks = (
            ComplianceCheck.query
            .filter(
                ComplianceCheck.org_id == org.id,
                ComplianceCheck.check_type.in_([
                    'sanctions_un', 'sanctions_ofac', 'sanctions_eu',
                    'blacklist', 'sanctions_personnel',
                ]),
            )
            .order_by(ComplianceCheck.checked_at.desc())
            .all()
        )
        if not checks:
            return {
                'key': 'sanctions',
                'label': 'Sanctions Screening',
                'status': 'incomplete',
                'score': 0,
                'last_updated': None,
                'detail': 'Not yet screened.',
            }
        flagged = [c for c in checks if c.status == 'flagged']
        last_checked = max((c.checked_at for c in checks if c.checked_at), default=None)
        if flagged:
            return {
                'key': 'sanctions',
                'label': 'Sanctions Screening',
                'status': 'flagged',
                'score': 0,
                'last_updated': last_checked.isoformat() if last_checked else None,
                'detail': f'{len(flagged)} match(es) found across {len({c.check_type for c in flagged})} list(s).',
            }
        return {
            'key': 'sanctions',
            'label': 'Sanctions Screening',
            'status': 'clear',
            'score': 100,
            'last_updated': last_checked.isoformat() if last_checked else None,
            'detail': f'Clear across {len({c.check_type for c in checks})} list(s).',
        }

    @classmethod
    def _pep_component(cls, org: Organization) -> dict:
        checks = (
            ComplianceCheck.query
            .filter_by(org_id=org.id, check_type='pep_screening')
            .order_by(ComplianceCheck.checked_at.desc())
            .all()
        )
        if not checks:
            return {
                'key': 'pep',
                'label': 'PEP Screening',
                'status': 'incomplete',
                'score': 0,
                'last_updated': None,
                'detail': 'Not yet screened.',
            }
        flagged = [c for c in checks if c.status == 'flagged']
        last_checked = max((c.checked_at for c in checks if c.checked_at), default=None)
        if flagged:
            return {
                'key': 'pep',
                'label': 'PEP Screening',
                'status': 'review',   # PEP is EDD trigger, not blocker
                'score': 50,
                'last_updated': last_checked.isoformat() if last_checked else None,
                'detail': f'{len(flagged)} PEP match(es) — enhanced due diligence required.',
            }
        return {
            'key': 'pep',
            'label': 'PEP Screening',
            'status': 'clear',
            'score': 100,
            'last_updated': last_checked.isoformat() if last_checked else None,
            'detail': 'No politically exposed persons identified.',
        }

    @classmethod
    def _adverse_media_component(cls, org: Organization) -> dict:
        latest = (
            AdverseMediaScreening.query
            .filter_by(org_id=org.id)
            .order_by(AdverseMediaScreening.screened_at.desc())
            .first()
        )
        if not latest:
            return {
                'key': 'adverse_media',
                'label': 'Adverse Media Screening',
                'status': 'incomplete',
                'score': 0,
                'last_updated': None,
                'detail': 'Not yet screened.',
            }
        summary = latest.get_summary() or {}
        status = summary.get('overall_status', latest.status)
        score_map = {'clear': 100, 'review': 55, 'flagged': 10, 'incomplete': 0, 'pending': 0, 'error': 30}
        return {
            'key': 'adverse_media',
            'label': 'Adverse Media Screening',
            'status': status,
            'score': score_map.get(status, 30),
            'last_updated': latest.screened_at.isoformat() if latest.screened_at else None,
            'detail': (
                f"{summary.get('high_count', 0)} high, "
                f"{summary.get('medium_count', 0)} medium, "
                f"{summary.get('low_count', 0)} low findings "
                f"({latest.lookback_months}mo lookback, source: {latest.source})."
            ),
        }

    @classmethod
    def _bank_component(cls, org: Organization) -> dict:
        latest = (
            BankAccountVerification.query
            .filter_by(org_id=org.id)
            .order_by(BankAccountVerification.verified_at.desc())
            .first()
        )
        if not latest:
            return {
                'key': 'bank',
                'label': 'Bank Account Verification',
                'status': 'incomplete',
                'score': 0,
                'last_updated': None,
                'detail': 'Bank account details not yet verified.',
            }
        status_map = {
            'verified': ('clear', 100),
            'review': ('review', 60),
            'flagged': ('flagged', 10),
            'pending': ('incomplete', 30),
            'error': ('review', 40),
        }
        st, score = status_map.get(latest.status, ('review', 50))
        return {
            'key': 'bank',
            'label': 'Bank Account Verification',
            'status': st,
            'score': score,
            'last_updated': latest.verified_at.isoformat() if latest.verified_at else None,
            'detail': (
                f'{latest.bank_name or "Bank"} ({latest.bank_country or "?"}). '
                f'Risk {latest.risk_score}/100, {len(latest.get_findings())} finding(s).'
            ),
        }

    @classmethod
    def _ownership_component(cls, org: Organization) -> dict:
        """Beneficial-ownership disclosure proxy: any uploaded doc tagged as
        ownership/beneficial_ownership/board_structure within the last 24 months.

        Document doesn't have org_id directly — it joins via Application or
        Assessment. We look at Documents linked to any Assessment owned by
        this org (the most common evidence path).
        """
        from app.models import Assessment as _Asm
        asm_ids = [
            a.id for a in
            _Asm.query.filter_by(org_id=org.id).with_entities(_Asm.id).all()
        ]
        if not asm_ids:
            return {
                'key': 'ownership',
                'label': 'Beneficial Ownership Disclosure',
                'status': 'incomplete',
                'score': 0,
                'last_updated': None,
                'detail': 'No beneficial ownership disclosure on file.',
            }
        docs = (
            Document.query
            .filter(
                Document.assessment_id.in_(asm_ids),
                Document.doc_type.in_(['beneficial_ownership', 'ownership_disclosure', 'board_structure']),
            )
            .order_by(Document.uploaded_at.desc())
            .first()
        )
        if not docs:
            return {
                'key': 'ownership',
                'label': 'Beneficial Ownership Disclosure',
                'status': 'incomplete',
                'score': 0,
                'last_updated': None,
                'detail': 'No beneficial ownership disclosure on file.',
            }
        uploaded_at = docs.uploaded_at
        if uploaded_at and uploaded_at.tzinfo is None:
            uploaded_at = uploaded_at.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - uploaded_at).days if uploaded_at else 9999
        if age_days > 730:    # >2 years
            return {
                'key': 'ownership',
                'label': 'Beneficial Ownership Disclosure',
                'status': 'review',
                'score': 40,
                'last_updated': uploaded_at.isoformat() if uploaded_at else None,
                'detail': f'On file but {age_days // 365}+ years old — refresh recommended.',
            }
        return {
            'key': 'ownership',
            'label': 'Beneficial Ownership Disclosure',
            'status': 'clear',
            'score': 100,
            'last_updated': uploaded_at.isoformat() if uploaded_at else None,
            'detail': f'Filed {age_days // 30}mo ago.',
        }

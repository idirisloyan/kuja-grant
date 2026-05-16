"""
ReportBundleService — Phase 8 (May 2026).

NGO program officers spend hours assembling a quarterly donor review:
narrative + financial breakdown + indicators + attached evidence +
risks + decisions. Kuja knows where all of these live. The bundle
service assembles them into ONE structured deliverable.

A "bundle" = a frozen snapshot containing:
  - cover_meta:    org name + grant title + reporting period + submitted_at
  - executive_summary: AI-generated one-paragraph "what to know" (cached)
  - narrative_sections:  the report's content keyed sections
  - indicators:    grant-defined indicators with current vs target
  - attachments:   linked Document IDs with original_filename + uploaded_at
  - risks:         StatusSignal rows kind='risk' on this report
  - decisions:     StatusSignal rows kind='decision' on this report
  - asks:          StatusSignal rows kind='ask' on this report
  - trust_snapshot: pillar scores at submit time (from TrustProfileService)
  - audit_anchor:  hash of the bundle payload (written to AuditChainEntry)

Two operations:
  - assemble(report_id, *, with_ai_summary=True) → dict (read-only synthesis)
  - publish(report_id, *, user, with_ai_summary=True) → dict + writes audit chain entry

Donors get the same shape; both sides see "the bundle the donor reviewed
on date X had hash Y" — provable.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import (
    Report, Grant, Organization, Document, StatusSignal, AuditChainEntry,
)

logger = logging.getLogger('kuja')


class ReportBundleService:

    @classmethod
    def assemble(cls, report_id: int, *, with_ai_summary: bool = True) -> dict | None:
        """Build the bundle. Read-only — does not persist."""
        rpt = (
            Report.query
            .options(db.joinedload(Report.grant), db.joinedload(Report.submitted_by_org))
            .filter_by(id=report_id)
            .first()
        )
        if not rpt:
            return None

        # Cover metadata
        cover = {
            'report_id': rpt.id,
            'report_type': rpt.report_type,
            'title': rpt.title or f'{rpt.report_type or "report"} — {rpt.reporting_period or ""}'.strip(),
            'reporting_period': rpt.reporting_period,
            'org_name': rpt.submitted_by_org.name if rpt.submitted_by_org else None,
            'org_country': rpt.submitted_by_org.country if rpt.submitted_by_org else None,
            'grant_title': rpt.grant.title if rpt.grant else None,
            'donor_org_name': cls._donor_name(rpt.grant),
            'status': rpt.status,
            'submitted_at': rpt.submitted_at.isoformat() if rpt.submitted_at else None,
            'due_date': rpt.due_date.isoformat() if rpt.due_date else None,
            'revision_number': rpt.revision_number,
        }

        # Narrative sections (just the report content dict — already structured)
        narrative_sections = rpt.get_content() or {}

        # Indicators — pull from the grant's reporting_requirements if defined.
        # We don't have a separate indicators table; this is a structured
        # snapshot of what the donor configured.
        indicators = cls._extract_indicators(rpt.grant, narrative_sections)

        # Attachments — Documents on the application (which the report rolls up to)
        attachments = cls._collect_attachments(rpt)

        # Signals (asks / risks / decisions on this report)
        signals = (
            StatusSignal.query
            .filter_by(entity_kind='report', entity_id=rpt.id)
            .order_by(StatusSignal.created_at.desc())
            .all()
        )
        asks      = [s.to_dict() for s in signals if s.kind == 'ask']
        risks     = [s.to_dict() for s in signals if s.kind == 'risk']
        decisions = [s.to_dict() for s in signals if s.kind == 'decision']

        # Trust snapshot — read-only; uses the unified TrustProfileService
        trust_snapshot = cls._trust_snapshot(rpt.submitted_by_org_id)

        # Existing AI analysis stored on the report (avoid re-running on assemble)
        existing_ai = rpt.get_ai_analysis() or {}
        compliance_score = existing_ai.get('compliance_score')
        risk_flags = existing_ai.get('risk_flags', []) or []

        # Executive summary — optional AI call
        executive_summary = None
        if with_ai_summary:
            executive_summary = cls._executive_summary(
                cover=cover, narrative=narrative_sections,
                indicators=indicators, risks=risks, decisions=decisions,
                compliance_score=compliance_score,
            )

        bundle = {
            'cover_meta': cover,
            'executive_summary': executive_summary,
            'narrative_sections': narrative_sections,
            'indicators': indicators,
            'attachments': attachments,
            'asks': asks,
            'risks': risks,
            'decisions': decisions,
            'trust_snapshot': trust_snapshot,
            'compliance_score': compliance_score,
            'risk_flags': risk_flags,
            'assembled_at': datetime.now(timezone.utc).isoformat(),
        }
        # Hash the canonical payload so the same bundle always produces
        # the same anchor — donors can later verify what they reviewed.
        bundle['bundle_hash'] = cls._bundle_hash(bundle)
        return bundle

    @classmethod
    def publish(cls, report_id: int, *, user, with_ai_summary: bool = True) -> dict | None:
        """Assemble + write an AuditChainEntry so the bundle is provable later."""
        bundle = cls.assemble(report_id, with_ai_summary=with_ai_summary)
        if not bundle:
            return None
        try:
            AuditChainEntry.append(
                action='report_bundle.publish',
                actor_email=getattr(user, 'email', None),
                subject_kind='report',
                subject_id=report_id,
                details={
                    'bundle_hash': bundle['bundle_hash'],
                    'report_status': bundle['cover_meta'].get('status'),
                    'with_ai_summary': bool(executive_summary_present(bundle)),
                    'attachment_count': len(bundle['attachments']),
                    'signal_counts': {
                        'asks': len(bundle['asks']),
                        'risks': len(bundle['risks']),
                        'decisions': len(bundle['decisions']),
                    },
                },
            )
        except Exception as e:
            logger.warning(f"Audit chain append failed for bundle publish: {e}")
        return bundle

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _donor_name(grant) -> str | None:
        if not grant or not grant.donor_org_id:
            return None
        donor = db.session.get(Organization, grant.donor_org_id)
        return donor.name if donor else None

    @staticmethod
    def _extract_indicators(grant, narrative: dict) -> list[dict]:
        """Best-effort: pull indicator-like rows from the grant's
        reporting_requirements JSON, and match against narrative values
        where keys align."""
        if not grant:
            return []
        reqs = grant.get_reporting_requirements() or []
        indicators = []
        for r in reqs:
            if not isinstance(r, dict):
                continue
            ind_list = r.get('indicators') or []
            if not isinstance(ind_list, list):
                continue
            for ind in ind_list[:20]:
                if not isinstance(ind, dict):
                    continue
                key = ind.get('key') or ind.get('name') or str(ind.get('id') or '')
                current = narrative.get(key) if key else None
                indicators.append({
                    'name': ind.get('name') or key or 'indicator',
                    'description': ind.get('description'),
                    'target': ind.get('target'),
                    'unit': ind.get('unit'),
                    'current': current,
                })
        return indicators[:30]

    @staticmethod
    def _collect_attachments(rpt) -> list[dict]:
        """Documents linked to the report's application + any documents
        the report itself references in `attachments`."""
        attachments = []
        seen = set()
        # Documents on the underlying application
        if rpt.application_id:
            from app.models.document import Document as _Doc
            for d in _Doc.query.filter_by(application_id=rpt.application_id).all():
                if d.id in seen:
                    continue
                seen.add(d.id)
                attachments.append({
                    'id': d.id, 'original_filename': d.original_filename,
                    'doc_type': d.doc_type, 'file_size': d.file_size,
                    'uploaded_at': d.uploaded_at.isoformat() if d.uploaded_at else None,
                    'score': d.score,
                })
        # Doc IDs referenced directly on the report
        for attach_id in (rpt.get_attachments() or [])[:20]:
            try:
                aid = int(attach_id)
            except (ValueError, TypeError):
                continue
            if aid in seen:
                continue
            d = db.session.get(Document, aid)
            if not d:
                continue
            seen.add(aid)
            attachments.append({
                'id': d.id, 'original_filename': d.original_filename,
                'doc_type': d.doc_type, 'file_size': d.file_size,
                'uploaded_at': d.uploaded_at.isoformat() if d.uploaded_at else None,
                'score': d.score,
            })
        return attachments

    @staticmethod
    def _trust_snapshot(org_id: int) -> dict | None:
        if not org_id:
            return None
        try:
            from app.services.trust_profile_service import TrustProfileService
            profile = TrustProfileService.build(org_id)
            if not profile:
                return None
            return {
                'overall': profile.get('overall'),
                'capacity_score': profile.get('capacity', {}).get('score'),
                'capacity_status': profile.get('capacity', {}).get('status'),
                'diligence_score': profile.get('diligence', {}).get('score'),
                'diligence_status': profile.get('diligence', {}).get('status'),
            }
        except Exception as e:
            logger.debug(f"trust_snapshot failed for org {org_id}: {e}")
            return None

    @classmethod
    def _executive_summary(
        cls, *,
        cover: dict, narrative: dict, indicators: list, risks: list,
        decisions: list, compliance_score: int | None,
    ) -> str | None:
        """One short paragraph AI summary tying the bundle together."""
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        # Compact digest
        narrative_blob = ' · '.join(
            f"{k}: {str(v)[:120]}" for k, v in list(narrative.items())[:6]
            if v
        ) or '(no narrative captured)'
        ind_blob = '; '.join(
            f"{i['name']}={i.get('current')}/{i.get('target')}{(' ' + i.get('unit', '')).rstrip()}"
            for i in indicators[:6] if i.get('current') is not None
        ) or '(no indicators with current values)'
        risks_blob = ' | '.join(r.get('body', '')[:80] for r in risks[:4]) or '(no open risks)'
        decisions_blob = ' | '.join(d.get('body', '')[:80] for d in decisions[:4]) or '(no decisions)'

        system_prompt = (
            "You are writing the executive summary for a donor's grant report "
            "bundle. ONE paragraph (60–100 words). Calm, factual, action-orienting. "
            "Lead with status (on track / behind / at risk). Mention the single most "
            "important number from the indicators if there is one. Name the top risk "
            "if there is one. End with what the donor should focus on at review."
        )
        user_message = (
            f"Report: {cover.get('title') or cover.get('report_type')} for {cover.get('grant_title')}.\n"
            f"Period: {cover.get('reporting_period') or 'unspecified'}. "
            f"Status: {cover.get('status')}. "
            f"Compliance score: {compliance_score if compliance_score is not None else 'n/a'}/100.\n\n"
            f"Narrative excerpt: {narrative_blob}\n"
            f"Indicators: {ind_blob}\n"
            f"Open risks: {risks_blob}\n"
            f"Decisions: {decisions_blob}\n\n"
            "Write the executive summary."
        )

        text = AIService._call_claude(
            system_prompt, user_message,
            max_tokens=300,
            endpoint='report_bundle.exec_summary',
        )
        if not text:
            return None
        text = text.strip()
        return text[:900]

    @staticmethod
    def _bundle_hash(bundle: dict) -> str:
        # Exclude the hash itself + the assembled_at timestamp so the hash
        # is stable for identical content
        copy = {k: v for k, v in bundle.items() if k not in ('bundle_hash', 'assembled_at')}
        canonical = json.dumps(copy, sort_keys=True, separators=(',', ':'), ensure_ascii=False, default=str)
        return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def executive_summary_present(bundle: dict) -> bool:
    return bool((bundle or {}).get('executive_summary'))

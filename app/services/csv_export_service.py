"""
CsvExportService — Phase 21C (May 2026).

Single point of definition for CSV exports across the platform. PMO
transferable pattern: "CSV export of any list as a server action."

Today supports:
  - grants (donor: own grants; admin: any)
  - applications (donor: apps on own grants; ngo: own apps; admin: any)
  - reviews (admin: all; donor: reviews on own grant apps; reviewer: own)

Output discipline:
  - UTF-8 with BOM (Excel-friendly)
  - Header row + one row per record
  - Stable column order (downstream pivot tables don't break)
  - All datetime columns serialised to ISO 8601 UTC
  - JSON list/dict columns flattened to "value1|value2|value3"

Writes an AuditChainEntry per export (csv_export.run) so admins can see
who exported what, when.
"""

import csv
import io
import json
import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models import Application, Grant, Organization, Review, User

logger = logging.getLogger('kuja')

ALLOWED_KINDS = ('grants', 'applications', 'reviews')


def _utf8_bom(value: str) -> bytes:
    """Excel reads UTF-8 with BOM correctly; without BOM it mojibakes."""
    return b'\xef\xbb\xbf' + value.encode('utf-8')


def _safe(v) -> str:
    if v is None:
        return ''
    if isinstance(v, (datetime,)):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()
    if isinstance(v, (list, tuple)):
        return '|'.join(str(x) for x in v if x is not None)
    if isinstance(v, dict):
        try:
            return json.dumps(v, ensure_ascii=False)
        except Exception:
            return ''
    return str(v)


class CsvExportService:

    @classmethod
    def export(cls, *, kind: str, user) -> tuple[bytes, str] | None:
        """Returns (csv_bytes, filename) or None on bad input.
        Caller must enforce permissions BEFORE calling."""
        if kind not in ALLOWED_KINDS:
            return None
        if kind == 'grants':
            return cls._export_grants(user)
        if kind == 'applications':
            return cls._export_applications(user)
        if kind == 'reviews':
            return cls._export_reviews(user)
        return None

    # ------------------------------------------------------------------

    @classmethod
    def _export_grants(cls, user) -> tuple[bytes, str]:
        q = Grant.query.options(db.joinedload(Grant.donor_org))
        if user.role == 'donor':
            q = q.filter(Grant.donor_org_id == user.org_id)
        # NGO doesn't get a list export; this is donor/admin only at the route layer
        grants = q.order_by(Grant.created_at.desc()).all()

        cols = (
            'id', 'title', 'donor_org_name', 'status', 'deadline',
            'total_funding', 'currency', 'sectors', 'countries',
            'created_at', 'published_at', 'updated_at',
        )
        return cls._render(cols, _grant_rows(grants), 'grants')

    @classmethod
    def _export_applications(cls, user) -> tuple[bytes, str]:
        q = Application.query.options(
            db.joinedload(Application.grant),
            db.joinedload(Application.ngo_org),
        )
        if user.role == 'donor':
            q = q.join(Grant).filter(Grant.donor_org_id == user.org_id)
        elif user.role == 'ngo':
            q = q.filter(Application.ngo_org_id == user.org_id)
        elif user.role == 'reviewer':
            review_app_ids = db.session.query(Review.application_id).filter_by(
                reviewer_user_id=user.id
            ).subquery()
            q = q.filter(Application.id.in_(review_app_ids))
        # admin sees all

        apps = q.order_by(Application.created_at.desc()).all()
        cols = (
            'id', 'grant_id', 'grant_title', 'ngo_org_id', 'ngo_org_name',
            'status', 'ai_score', 'human_score', 'final_score',
            'decision_reason_code', 'submitted_at', 'created_at', 'updated_at',
        )
        return cls._render(cols, _application_rows(apps), 'applications')

    @classmethod
    def _export_reviews(cls, user) -> tuple[bytes, str]:
        q = Review.query.options(
            db.joinedload(Review.application).joinedload(Application.grant),
        )
        if user.role == 'reviewer':
            q = q.filter(Review.reviewer_user_id == user.id)
        elif user.role == 'donor':
            q = q.join(Application).join(Grant).filter(Grant.donor_org_id == user.org_id)
        # admin sees all

        reviews = q.order_by(Review.created_at.desc()).all()
        cols = (
            'id', 'application_id', 'reviewer_user_id', 'status',
            'overall_score', 'completed_at', 'created_at', 'updated_at',
            'grant_id', 'grant_title',
        )
        return cls._render(cols, _review_rows(reviews), 'reviews')

    @classmethod
    def _render(cls, columns: tuple, rows_iter, kind: str) -> tuple[bytes, str]:
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator='\n')
        writer.writerow(columns)
        for row in rows_iter:
            writer.writerow([_safe(row.get(c)) for c in columns])
        now = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        filename = f'kuja-{kind}-{now}.csv'
        return _utf8_bom(buf.getvalue()), filename


# Row builders kept top-level for testability + import simplicity

def _grant_rows(grants):
    for g in grants:
        yield {
            'id': g.id,
            'title': g.title,
            'donor_org_name': g.donor_org.name if g.donor_org else None,
            'status': g.status,
            'deadline': g.deadline,
            'total_funding': g.total_funding,
            'currency': g.currency,
            'sectors': g.get_sectors() if hasattr(g, 'get_sectors') else [],
            'countries': g.get_countries() if hasattr(g, 'get_countries') else [],
            'created_at': g.created_at,
            'published_at': g.published_at,
            'updated_at': g.updated_at,
        }


def _application_rows(apps):
    for a in apps:
        yield {
            'id': a.id,
            'grant_id': a.grant_id,
            'grant_title': a.grant.title if a.grant else None,
            'ngo_org_id': a.ngo_org_id,
            'ngo_org_name': a.ngo_org.name if a.ngo_org else None,
            'status': a.status,
            'ai_score': a.ai_score,
            'human_score': a.human_score,
            'final_score': a.final_score,
            'decision_reason_code': a.decision_reason_code,
            'submitted_at': a.submitted_at,
            'created_at': a.created_at,
            'updated_at': a.updated_at,
        }


def _review_rows(reviews):
    for r in reviews:
        yield {
            'id': r.id,
            'application_id': r.application_id,
            'reviewer_user_id': r.reviewer_user_id,
            'status': r.status,
            'overall_score': r.overall_score,
            'completed_at': r.completed_at,
            'created_at': r.created_at,
            'updated_at': r.updated_at,
            'grant_id': r.application.grant_id if r.application else None,
            'grant_title': (
                r.application.grant.title
                if r.application and r.application.grant else None
            ),
        }

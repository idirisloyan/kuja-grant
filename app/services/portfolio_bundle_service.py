"""
PortfolioBundleService — Phase 13 (May 2026).

Donor at end of quarter clicks ONE button and gets a single PDF that
covers every grantee's current-period report bundle as chapters, with
an AI portfolio-level executive summary on the cover.

This is the board-ready deliverable: 40-page consolidated review that
the compliance team currently spends 3-5 days assembling.

Architecture:
  - Pull every Report submitted in the lookback window (default 90 days)
    against the donor's open/awarded grants
  - For each report, run ReportBundleService.assemble (uses existing cache)
  - Generate ONE PDF via reportlab with:
      * Cover (donor name, period label, grantee count, report count)
      * AI portfolio summary (one paragraph synthesising all bundles)
      * Per-grantee chapters (each = one bundle, full layout)
      * Closing audit-chain anchor

Cost control:
  - One AI call for the portfolio summary
  - Per-bundle exec-summary AI calls use existing 10-min cache (no
    double-billing for repeated portfolio downloads)
  - PDF generation is bounded — max 12 reports per portfolio download
"""

import io
import logging
from datetime import datetime, timedelta, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak,
)

from app.extensions import db
from app.models import Grant, Report
from app.services.report_bundle_service import ReportBundleService
from app.services.bundle_pdf_service import (
    build_bundle_pdf, _make_styles, _esc, _truncate, _hex,
    NAVY, CLAY, CLAY_DARK, INK, INK_SOFT, SAND, SAVANNA, BORDER,
)

logger = logging.getLogger('kuja')


class PortfolioBundleService:

    MAX_REPORTS = 12   # cap pages/cost
    DEFAULT_LOOKBACK_DAYS = 90

    @classmethod
    def assemble(
        cls,
        *,
        donor_org_id: int,
        lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    ) -> dict | None:
        """Build the structured portfolio bundle (read-only synthesis).

        Returns:
          {
            'donor_org_id': int,
            'donor_org_name': str,
            'lookback_days': int,
            'period_label': str,
            'report_count': int,
            'grantee_count': int,
            'bundles': [per-report bundle dicts...],
            'ai_portfolio_summary': str | None,
            'computed_at': iso,
          }
        """
        from app.models import Organization
        donor = db.session.get(Organization, donor_org_id)
        if not donor:
            return None

        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

        # Find reports against this donor's grants
        reports = (
            Report.query
            .join(Grant)
            .filter(Grant.donor_org_id == donor_org_id)
            .filter(Report.created_at >= since)
            .order_by(Report.submitted_at.desc().nullslast(), Report.created_at.desc())
            .options(
                db.joinedload(Report.grant),
                db.joinedload(Report.submitted_by_org),
            )
            .limit(cls.MAX_REPORTS)
            .all()
        )

        bundles = []
        grantee_ids = set()
        for r in reports:
            b = ReportBundleService.assemble(r.id, with_ai_summary=True)
            if b:
                bundles.append(b)
                if r.submitted_by_org_id:
                    grantee_ids.add(r.submitted_by_org_id)

        # AI portfolio summary across all bundles
        portfolio_summary = None
        if bundles:
            portfolio_summary = cls._portfolio_summary(
                donor_name=donor.name, bundles=bundles, lookback_days=lookback_days,
            )

        return {
            'donor_org_id': donor_org_id,
            'donor_org_name': donor.name,
            'lookback_days': lookback_days,
            'period_label': cls._period_label(lookback_days),
            'report_count': len(bundles),
            'grantee_count': len(grantee_ids),
            'bundles': bundles,
            'ai_portfolio_summary': portfolio_summary,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    # ------------------------------------------------------------------

    @staticmethod
    def _period_label(lookback_days: int) -> str:
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=lookback_days)
        return f'{start.strftime("%d %b %Y")} – {now.strftime("%d %b %Y")}'

    @classmethod
    def _portfolio_summary(
        cls, *, donor_name: str, bundles: list[dict], lookback_days: int,
    ) -> str | None:
        """One AI paragraph summarising the whole portfolio of bundles."""
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        # Compact digest
        rows = []
        for b in bundles[:cls.MAX_REPORTS]:
            cover = b.get('cover_meta', {}) or {}
            comp = b.get('compliance_score')
            risks_n = len(b.get('risks', []))
            decisions_n = len(b.get('decisions', []))
            rows.append(
                f"- {cover.get('org_name', '?')}: "
                f"{cover.get('title', '?')[:60]} "
                f"({cover.get('reporting_period', '?')}); "
                f"status={cover.get('status')}; "
                f"compliance={comp if comp is not None else 'n/a'}/100; "
                f"risks_open={risks_n}; decisions={decisions_n}"
            )
        digest = '\n'.join(rows)

        system_prompt = (
            "You are writing the executive summary for a donor's quarterly "
            "portfolio review pack. ONE paragraph (90-150 words). Lead with "
            "headline status (X grantees, Y reports, Z compliance flags). "
            "Highlight the standout performers + the ones that need attention. "
            "End with the single most important thing for the donor's board "
            "to discuss at review. No filler, no platitudes."
        )
        user_message = (
            f"Donor: {donor_name}\n"
            f"Lookback: {lookback_days} days\n"
            f"Reports in this portfolio: {len(bundles)}\n\n"
            f"Per-report digest:\n{digest}\n\n"
            "Write the portfolio executive summary."
        )

        text = AIService._call_claude(
            system_prompt, user_message,
            max_tokens=400,
            endpoint='portfolio_bundle.summary',
        )
        if not text:
            return None
        return text.strip()[:1400]


# ----------------------------------------------------------------------
# PDF rendering — assembles cover + portfolio summary + per-grantee
# chapters into a single document.
# ----------------------------------------------------------------------

def build_portfolio_pdf(portfolio: dict) -> bytes:
    """Render PortfolioBundleService.assemble() result into one PDF."""
    if not portfolio:
        raise ValueError('portfolio is required')

    styles = _make_styles()
    buffer = io.BytesIO()

    def _draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(INK_SOFT)
        canvas.drawString(15 * mm, 10 * mm,
                          f'Portfolio review · {portfolio.get("donor_org_name", "")[:60]}')
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm,
                               f'Page {canvas.getPageNumber()}')
        canvas.setStrokeColor(CLAY)
        canvas.setLineWidth(2)
        canvas.line(15 * mm, A4[1] - 12 * mm, A4[0] - 15 * mm, A4[1] - 12 * mm)
        canvas.setFont('Helvetica-Bold', 8)
        canvas.setFillColor(CLAY)
        canvas.drawString(15 * mm, A4[1] - 10 * mm, 'KUJA · PORTFOLIO REVIEW')
        canvas.restoreState()

    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title=f'Portfolio Review — {portfolio.get("donor_org_name", "")[:80]}',
        author='Kuja',
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height, id='normal',
    )
    doc.addPageTemplates([
        PageTemplate(id='portfolio', frames=frame, onPage=_draw_footer),
    ])

    story = []

    # ----- Cover -----
    story.append(Paragraph('DONOR PORTFOLIO REVIEW', styles['eyebrow']))
    story.append(Paragraph(_esc(portfolio.get('donor_org_name', '')), styles['h1']))
    story.append(Paragraph(_esc(portfolio.get('period_label', '')), styles['subtitle']))

    # Stats grid
    grantee_count = portfolio.get('grantee_count', 0)
    report_count = portfolio.get('report_count', 0)
    bundles = portfolio.get('bundles', []) or []
    total_risks = sum(len(b.get('risks', [])) for b in bundles)
    total_evidence = sum(len(b.get('attachments', [])) for b in bundles)
    avg_compliance = None
    comp_scores = [b.get('compliance_score') for b in bundles if isinstance(b.get('compliance_score'), (int, float))]
    if comp_scores:
        avg_compliance = round(sum(comp_scores) / len(comp_scores))

    stat_cells = [[
        _stat_cell_v('Grantees', str(grantee_count)),
        _stat_cell_v('Reports', str(report_count)),
        _stat_cell_v('Avg compliance', f'{avg_compliance}/100' if avg_compliance is not None else 'n/a'),
        _stat_cell_v('Risk flags open', str(total_risks)),
        _stat_cell_v('Evidence', str(total_evidence)),
    ]]
    t = Table(stat_cells, colWidths=[(doc.width / 5)] * 5)
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOX', (0, 0), (-1, -1), 0.4, BORDER),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(Spacer(1, 4))
    story.append(t)
    story.append(Spacer(1, 12))

    # AI portfolio summary
    portfolio_summary = portfolio.get('ai_portfolio_summary')
    if portfolio_summary:
        story.append(Paragraph('PORTFOLIO EXECUTIVE SUMMARY · AI-GENERATED', styles['eyebrow']))
        story.append(Paragraph('Portfolio summary', styles['h2']))
        p = Paragraph(_esc(_truncate(portfolio_summary, 1400)), styles['exec_summary'])
        box = Table([[p]], colWidths=['*'])
        box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FFF7ED')),
            ('LINEBEFORE', (0, 0), (0, -1), 3, CLAY),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(box)
        story.append(Spacer(1, 12))

    # Table of contents
    if bundles:
        story.append(Paragraph('TABLE OF CONTENTS', styles['eyebrow']))
        story.append(Paragraph('Bundles in this portfolio', styles['h2']))
        toc_rows = [['#', 'Grantee', 'Report', 'Period', 'Status']]
        for i, b in enumerate(bundles, 1):
            cover = b.get('cover_meta', {}) or {}
            toc_rows.append([
                str(i),
                _esc(_truncate(cover.get('org_name', '') or '?', 30)),
                _esc(_truncate(cover.get('title', '') or '?', 40)),
                _esc(_truncate(cover.get('reporting_period', '') or '—', 20)),
                _esc(_truncate(cover.get('status', '') or '—', 16)),
            ])
        toc = Table(toc_rows, colWidths=[
            doc.width * 0.05, doc.width * 0.25, doc.width * 0.35,
            doc.width * 0.18, doc.width * 0.17,
        ], repeatRows=1)
        toc.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), SAND),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, SAVANNA]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        story.append(toc)

    # ----- Per-grantee chapters -----
    for i, b in enumerate(bundles, 1):
        story.append(PageBreak())
        cover = b.get('cover_meta', {}) or {}
        story.append(Paragraph(f'CHAPTER {i} OF {len(bundles)}', styles['eyebrow']))
        story.append(Paragraph(
            _esc(cover.get('title') or f'Report #{cover.get("report_id")}'),
            styles['h1'],
        ))
        sub_parts = []
        if cover.get('org_name'): sub_parts.append(_esc(cover['org_name']))
        if cover.get('reporting_period'): sub_parts.append(_esc(cover['reporting_period']))
        if cover.get('status'): sub_parts.append(f"status: {_esc(cover['status'])}")
        if sub_parts:
            story.append(Paragraph(' · '.join(sub_parts), styles['subtitle']))

        # Bundle executive summary
        if b.get('executive_summary'):
            story.append(Paragraph('Bundle summary', styles['h2']))
            p = Paragraph(_esc(_truncate(b['executive_summary'], 1000)), styles['body'])
            story.append(p)

        # Compact attachments + scores summary
        attachments = b.get('attachments', []) or []
        risks = b.get('risks', []) or []
        comp = b.get('compliance_score')
        trust = b.get('trust_snapshot') or {}

        story.append(Spacer(1, 6))
        info_rows = [['Compliance', f'{comp}/100' if comp is not None else '—',
                      'Capacity', f'{trust.get("capacity_score", "—")}/100',
                      'Diligence', f'{trust.get("diligence_score", "—")}/100']]
        info_t = Table(info_rows, colWidths=[doc.width / 6] * 6)
        info_t.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('LEFTPADDING', (0, 0), (-1, -1), 4),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, 0), 'Helvetica-Bold'),
            ('FONTNAME', (4, 0), (4, 0), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, 0), (0, 0), INK_SOFT),
            ('TEXTCOLOR', (2, 0), (2, 0), INK_SOFT),
            ('TEXTCOLOR', (4, 0), (4, 0), INK_SOFT),
        ]))
        story.append(info_t)

        if attachments:
            story.append(Spacer(1, 6))
            story.append(Paragraph(f'Evidence: {len(attachments)} attachment{"s" if len(attachments) != 1 else ""}', styles['callout']))

        if risks:
            story.append(Spacer(1, 4))
            story.append(Paragraph(f'Open risks ({len(risks)}):', styles['body']))
            for r in risks[:5]:
                story.append(Paragraph('• ' + _esc(_truncate(r.get('body', '') or '', 240)), styles['callout']))

        # Bundle hash anchor (small, on each chapter)
        story.append(Spacer(1, 8))
        story.append(Paragraph(
            f'<font color="#{_hex(INK_SOFT)}" size="7">Bundle anchor: {_esc((b.get("bundle_hash") or "")[:48])}</font>',
            ParagraphStyle('chapter_anchor', fontName='Courier', fontSize=7, textColor=INK_SOFT),
        ))

    # ----- Closing portfolio anchor -----
    story.append(PageBreak())
    story.append(Paragraph('PORTFOLIO INTEGRITY', styles['eyebrow']))
    story.append(Paragraph('Closing anchor', styles['h2']))
    bundle_hashes = [b.get('bundle_hash', '') for b in bundles if b.get('bundle_hash')]
    closing_text = (
        f'<font color="#{_hex(INK)}">This portfolio review includes '
        f'<b>{len(bundles)}</b> report bundles across <b>{grantee_count}</b> grantee organisation'
        f'{"s" if grantee_count != 1 else ""}, covering the period '
        f'<b>{_esc(portfolio.get("period_label", ""))}</b>.</font><br/><br/>'
        f'<font color="#{_hex(INK_SOFT)}" size="8">'
        f'Each chapter\'s bundle hash is shown at its foot. Tampering with any '
        f'chapter (e.g. swapping one grantee\'s bundle for another version) would '
        f'change that chapter\'s hash. The platform\'s tamper-evident audit chain '
        f'records the publish + verify + download events for every bundle separately.'
        f'</font>'
    )
    p = Paragraph(closing_text, ParagraphStyle(
        'closing', fontName='Helvetica', fontSize=10, leading=14, textColor=INK,
    ))
    box = Table([[p]], colWidths=['*'])
    box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), SAVANNA),
        ('LINEBEFORE', (0, 0), (0, -1), 3, NAVY),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(box)

    doc.build(story)
    return buffer.getvalue()


# ----------------------------------------------------------------------
# Local helper — small vertical stat cell for the cover quick-stats grid
# ----------------------------------------------------------------------

def _stat_cell_v(label: str, value: str) -> list:
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_LEFT
    label_p = Paragraph(
        f'<font size="7" color="#{_hex(INK_SOFT)}"><b>{_esc(label.upper())}</b></font>',
        ParagraphStyle('cell_label_v', fontName='Helvetica', alignment=TA_LEFT),
    )
    value_p = Paragraph(
        f'<font size="11" color="#{_hex(INK)}"><b>{_esc(value)}</b></font>',
        ParagraphStyle('cell_val_v', fontName='Helvetica-Bold', alignment=TA_LEFT),
    )
    return [label_p, value_p]

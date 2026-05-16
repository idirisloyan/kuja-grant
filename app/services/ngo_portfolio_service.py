"""
NGOPortfolioService — Phase 14 (May 2026).

NGO-side analog of PortfolioBundleService. One click → kuja-portfolio-
<ngo>-<period>.pdf covering EVERY report the NGO submitted in the
window, with chapters per grant + an AI "what we delivered this period"
exec summary.

Use case: NGO program director going into a board meeting needs ONE
document to show their delivery across all donors. Currently they would
have to download each bundle separately and assemble manually.

Cost control: reuses ReportBundleService.assemble (10-min cache per
bundle, so subsequent NGO downloads don't re-bill AI summaries). One
new AI call per fresh portfolio download (the cross-portfolio summary).
Max 12 reports per download — keeps PDF small + cost bounded.
"""

import io
import logging
from datetime import datetime, timedelta, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle, PageBreak,
)

from app.extensions import db
from app.models import Grant, Report
from app.services.report_bundle_service import ReportBundleService
from app.services.bundle_pdf_service import (
    _make_styles, _esc, _truncate, _hex,
    NAVY, CLAY, INK, INK_SOFT, SAND, SAVANNA, BORDER,
)

logger = logging.getLogger('kuja')


class NGOPortfolioService:

    MAX_REPORTS = 12
    DEFAULT_LOOKBACK_DAYS = 90

    @classmethod
    def assemble(
        cls, *, ngo_org_id: int, lookback_days: int = DEFAULT_LOOKBACK_DAYS,
    ) -> dict | None:
        """Build the structured NGO portfolio bundle.

        Returns:
          {
            'ngo_org_id', 'ngo_org_name', 'lookback_days', 'period_label',
            'report_count', 'donor_count', 'bundles': [...],
            'ai_portfolio_summary', 'computed_at',
          }
        """
        from app.models import Organization
        ngo = db.session.get(Organization, ngo_org_id)
        if not ngo:
            return None

        since = datetime.now(timezone.utc) - timedelta(days=lookback_days)

        reports = (
            Report.query
            .filter(Report.submitted_by_org_id == ngo_org_id)
            .filter(Report.created_at >= since)
            .order_by(Report.submitted_at.desc().nullslast(), Report.created_at.desc())
            .options(
                db.joinedload(Report.grant).joinedload(Grant.donor_org),
            )
            .limit(cls.MAX_REPORTS)
            .all()
        )

        bundles = []
        donor_ids = set()
        for r in reports:
            b = ReportBundleService.assemble(r.id, with_ai_summary=True)
            if b:
                bundles.append(b)
                if r.grant and r.grant.donor_org_id:
                    donor_ids.add(r.grant.donor_org_id)

        portfolio_summary = None
        if bundles:
            portfolio_summary = cls._portfolio_summary(
                ngo_name=ngo.name, bundles=bundles, lookback_days=lookback_days,
            )

        return {
            'ngo_org_id': ngo_org_id,
            'ngo_org_name': ngo.name,
            'lookback_days': lookback_days,
            'period_label': cls._period_label(lookback_days),
            'report_count': len(bundles),
            'donor_count': len(donor_ids),
            'bundles': bundles,
            'ai_portfolio_summary': portfolio_summary,
            'computed_at': datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _period_label(lookback_days: int) -> str:
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=lookback_days)
        return f'{start.strftime("%d %b %Y")} – {now.strftime("%d %b %Y")}'

    @classmethod
    def _portfolio_summary(
        cls, *, ngo_name: str, bundles: list[dict], lookback_days: int,
    ) -> str | None:
        try:
            from app.services.ai_service import AIService
        except Exception:
            return None

        rows = []
        for b in bundles[:cls.MAX_REPORTS]:
            cover = b.get('cover_meta', {}) or {}
            comp = b.get('compliance_score')
            risks_n = len(b.get('risks', []))
            rows.append(
                f"- {cover.get('grant_title') or cover.get('title') or '?'} "
                f"(donor: {cover.get('donor_org_name') or '?'}; "
                f"period: {cover.get('reporting_period') or '?'}); "
                f"status={cover.get('status')}; "
                f"compliance={comp if comp is not None else 'n/a'}/100; "
                f"risks_open={risks_n}"
            )
        digest = '\n'.join(rows)

        system_prompt = (
            "You are writing an NGO program director's quarterly board "
            "pack opening summary. ONE paragraph (90-150 words). Lead "
            "with delivery headline (X reports across Y donors). Name "
            "the standout grants + the ones that need attention. End "
            "with the most important strategic point for the board. "
            "Use 'we' voice. No filler, no platitudes."
        )
        user_message = (
            f"NGO: {ngo_name}\n"
            f"Lookback: {lookback_days} days\n"
            f"Reports in this portfolio: {len(bundles)}\n\n"
            f"Per-report digest:\n{digest}\n\n"
            "Write the portfolio executive summary."
        )

        text = AIService._call_claude(
            system_prompt, user_message,
            max_tokens=400,
            endpoint='ngo_portfolio.summary',
        )
        if not text:
            return None
        return text.strip()[:1400]


# ----------------------------------------------------------------------
# PDF rendering — mirrors build_portfolio_pdf with NGO voice + per-grant
# (rather than per-grantee) chapters.
# ----------------------------------------------------------------------

def build_ngo_portfolio_pdf(portfolio: dict) -> bytes:
    if not portfolio:
        raise ValueError('portfolio is required')

    styles = _make_styles()
    buffer = io.BytesIO()

    def _draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(INK_SOFT)
        canvas.drawString(15 * mm, 10 * mm,
                          f'Delivery report · {portfolio.get("ngo_org_name", "")[:60]}')
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm,
                               f'Page {canvas.getPageNumber()}')
        canvas.setStrokeColor(CLAY)
        canvas.setLineWidth(2)
        canvas.line(15 * mm, A4[1] - 12 * mm, A4[0] - 15 * mm, A4[1] - 12 * mm)
        canvas.setFont('Helvetica-Bold', 8)
        canvas.setFillColor(CLAY)
        canvas.drawString(15 * mm, A4[1] - 10 * mm, 'KUJA · DELIVERY REPORT')
        canvas.restoreState()

    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title=f'Delivery Report — {portfolio.get("ngo_org_name", "")[:80]}',
        author='Kuja',
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='ngo')
    doc.addPageTemplates([PageTemplate(id='ngo', frames=frame, onPage=_draw_footer)])

    story = []

    story.append(Paragraph('DELIVERY REPORT · WHAT WE SHIPPED', styles['eyebrow']))
    story.append(Paragraph(_esc(portfolio.get('ngo_org_name', '')), styles['h1']))
    story.append(Paragraph(_esc(portfolio.get('period_label', '')), styles['subtitle']))

    bundles = portfolio.get('bundles', []) or []
    total_evidence = sum(len(b.get('attachments', [])) for b in bundles)
    total_risks = sum(len(b.get('risks', [])) for b in bundles)
    comp_scores = [b.get('compliance_score') for b in bundles
                   if isinstance(b.get('compliance_score'), (int, float))]
    avg_comp = round(sum(comp_scores) / len(comp_scores)) if comp_scores else None

    stat_cells = [[
        _stat(label='Donors',           value=str(portfolio.get('donor_count', 0))),
        _stat(label='Reports',          value=str(portfolio.get('report_count', 0))),
        _stat(label='Avg compliance',   value=f'{avg_comp}/100' if avg_comp is not None else 'n/a'),
        _stat(label='Open risks',       value=str(total_risks)),
        _stat(label='Evidence',         value=str(total_evidence)),
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

    if portfolio.get('ai_portfolio_summary'):
        story.append(Paragraph('BOARD-FACING SUMMARY · AI-GENERATED', styles['eyebrow']))
        story.append(Paragraph('Delivery summary', styles['h2']))
        p = Paragraph(_esc(_truncate(portfolio['ai_portfolio_summary'], 1400)),
                      styles['exec_summary'])
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

    if bundles:
        story.append(Paragraph('TABLE OF CONTENTS', styles['eyebrow']))
        story.append(Paragraph('Reports in this portfolio', styles['h2']))
        toc_rows = [['#', 'Grant', 'Donor', 'Period', 'Status']]
        for i, b in enumerate(bundles, 1):
            cover = b.get('cover_meta', {}) or {}
            toc_rows.append([
                str(i),
                _esc(_truncate(cover.get('grant_title') or cover.get('title') or '?', 35)),
                _esc(_truncate(cover.get('donor_org_name') or '?', 25)),
                _esc(_truncate(cover.get('reporting_period') or '—', 20)),
                _esc(_truncate(cover.get('status') or '—', 16)),
            ])
        toc = Table(toc_rows, colWidths=[
            doc.width * 0.05, doc.width * 0.30, doc.width * 0.25,
            doc.width * 0.20, doc.width * 0.20,
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

    # Per-grant chapters
    for i, b in enumerate(bundles, 1):
        story.append(PageBreak())
        cover = b.get('cover_meta', {}) or {}
        story.append(Paragraph(f'CHAPTER {i} OF {len(bundles)}', styles['eyebrow']))
        story.append(Paragraph(
            _esc(cover.get('grant_title') or cover.get('title') or f'Report #{cover.get("report_id")}'),
            styles['h1'],
        ))
        sub = []
        if cover.get('donor_org_name'):   sub.append(_esc(cover['donor_org_name']))
        if cover.get('reporting_period'): sub.append(_esc(cover['reporting_period']))
        if cover.get('status'):           sub.append(f"status: {_esc(cover['status'])}")
        if sub:
            story.append(Paragraph(' · '.join(sub), styles['subtitle']))

        if b.get('executive_summary'):
            story.append(Paragraph('Bundle summary', styles['h2']))
            story.append(Paragraph(_esc(_truncate(b['executive_summary'], 1000)), styles['body']))

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

        attachments = b.get('attachments', []) or []
        risks = b.get('risks', []) or []
        if attachments:
            story.append(Spacer(1, 6))
            story.append(Paragraph(
                f'Evidence: {len(attachments)} attachment{"s" if len(attachments) != 1 else ""}',
                styles['callout'],
            ))
        if risks:
            story.append(Spacer(1, 4))
            story.append(Paragraph(f'Open risks ({len(risks)}):', styles['body']))
            for r in risks[:5]:
                story.append(Paragraph(
                    '• ' + _esc(_truncate(r.get('body', '') or '', 240)),
                    styles['callout'],
                ))

        story.append(Spacer(1, 8))
        story.append(Paragraph(
            f'<font color="#{_hex(INK_SOFT)}" size="7">Bundle anchor: {_esc((b.get("bundle_hash") or "")[:48])}</font>',
            ParagraphStyle('ch_anchor', fontName='Courier', fontSize=7, textColor=INK_SOFT),
        ))

    # Closing
    story.append(PageBreak())
    story.append(Paragraph('PORTFOLIO INTEGRITY', styles['eyebrow']))
    story.append(Paragraph('Closing anchor', styles['h2']))
    closing = (
        f'<font color="#{_hex(INK)}">This delivery report covers '
        f'<b>{len(bundles)}</b> reports across <b>{portfolio.get("donor_count", 0)}</b> '
        f'donor{"s" if portfolio.get("donor_count", 0) != 1 else ""}, for '
        f'<b>{_esc(portfolio.get("period_label", ""))}</b>.</font><br/><br/>'
        f'<font color="#{_hex(INK_SOFT)}" size="8">'
        f'Each chapter\'s bundle hash is shown at its foot. Hashes match '
        f'the platform\'s tamper-evident audit chain — your donor can '
        f'independently verify this document is the same one they reviewed.'
        f'</font>'
    )
    p = Paragraph(closing, ParagraphStyle(
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


def _stat(*, label: str, value: str) -> list:
    from reportlab.lib.enums import TA_LEFT
    label_p = Paragraph(
        f'<font size="7" color="#{_hex(INK_SOFT)}"><b>{_esc(label.upper())}</b></font>',
        ParagraphStyle('ngo_lbl', fontName='Helvetica', alignment=TA_LEFT),
    )
    value_p = Paragraph(
        f'<font size="11" color="#{_hex(INK)}"><b>{_esc(value)}</b></font>',
        ParagraphStyle('ngo_val', fontName='Helvetica-Bold', alignment=TA_LEFT),
    )
    return [label_p, value_p]

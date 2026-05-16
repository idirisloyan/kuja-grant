"""
BundlePdfService — Phase 9 (May 2026).

Renders a Report Bundle dict (from ReportBundleService.assemble) into a
downloadable PDF. NGO clicks "Download bundle.pdf" → the donor gets a
single self-contained document with cover + AI executive summary +
indicators + attachments list + asks/risks/decisions + trust snapshot +
audit anchor hash.

Why a real PDF instead of HTML-to-PDF:
  - Many donor staff read offline (Global South audience, intermittent
    connection) — they need a portable artifact
  - PDF embeds the bundle_hash in a footer on every page so the
    document is traceable to the audit chain even if pages get
    forwarded separately
  - reportlab is dependency-light and renders identically across
    environments (no headless Chrome dance)

Style: Kuja-Studio voice (clay/navy/savanna palette). The PDF mirrors
the on-screen ReportBundlePanel layout where possible so donors don't
have to re-learn the document.
"""

import io
import logging
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

logger = logging.getLogger('kuja')

# Kuja brand palette
CLAY = colors.HexColor('#C2410C')
CLAY_DARK = colors.HexColor('#7C2D12')
NAVY = colors.HexColor('#1B3A5C')
INK = colors.HexColor('#1F2937')
INK_SOFT = colors.HexColor('#64748B')
SAND = colors.HexColor('#FFE4D6')
SAVANNA = colors.HexColor('#F2F6FA')
GROW = colors.HexColor('#16A34A')
SUN = colors.HexColor('#D97706')
FLAG = colors.HexColor('#B91C1C')
BORDER = colors.HexColor('#E5E7EB')


def _make_styles() -> dict:
    """Reusable paragraph styles for the bundle PDF."""
    base = getSampleStyleSheet()
    return {
        'h1': ParagraphStyle(
            'kuja_h1', parent=base['Title'],
            fontName='Helvetica-Bold', fontSize=22, leading=26,
            textColor=INK, spaceBefore=0, spaceAfter=4,
        ),
        'subtitle': ParagraphStyle(
            'kuja_sub', parent=base['Normal'],
            fontName='Helvetica', fontSize=10, leading=14,
            textColor=INK_SOFT, spaceAfter=12,
        ),
        'h2': ParagraphStyle(
            'kuja_h2', parent=base['Heading2'],
            fontName='Helvetica-Bold', fontSize=12, leading=15,
            textColor=CLAY_DARK, spaceBefore=16, spaceAfter=6,
        ),
        'eyebrow': ParagraphStyle(
            'kuja_eb', parent=base['Normal'],
            fontName='Helvetica-Bold', fontSize=8, leading=10,
            textColor=CLAY, spaceBefore=8, spaceAfter=2,
        ),
        'body': ParagraphStyle(
            'kuja_body', parent=base['Normal'],
            fontName='Helvetica', fontSize=10, leading=14,
            textColor=INK, spaceAfter=6,
        ),
        'mono': ParagraphStyle(
            'kuja_mono', parent=base['Code'],
            fontName='Courier', fontSize=8, leading=10,
            textColor=INK_SOFT, spaceAfter=2,
        ),
        'exec_summary': ParagraphStyle(
            'kuja_exec', parent=base['Normal'],
            fontName='Helvetica', fontSize=10.5, leading=15,
            textColor=INK, leftIndent=8, rightIndent=8,
            spaceBefore=4, spaceAfter=8,
        ),
        'callout': ParagraphStyle(
            'kuja_callout', parent=base['Normal'],
            fontName='Helvetica-Oblique', fontSize=9, leading=12,
            textColor=INK_SOFT, leftIndent=8, spaceBefore=2, spaceAfter=4,
        ),
    }


def build_bundle_pdf(bundle: dict) -> bytes:
    """Render a ReportBundleService.assemble() result into a PDF.

    Returns raw PDF bytes the caller can stream as a file download.
    """
    if not bundle:
        raise ValueError('bundle is required')

    cover = bundle.get('cover_meta', {}) or {}
    trust = bundle.get('trust_snapshot') or {}
    indicators = bundle.get('indicators', []) or []
    attachments = bundle.get('attachments', []) or []
    asks = bundle.get('asks', []) or []
    risks = bundle.get('risks', []) or []
    decisions = bundle.get('decisions', []) or []
    risk_flags = bundle.get('risk_flags', []) or []
    bundle_hash = bundle.get('bundle_hash', '')
    title_text = cover.get('title') or f"{cover.get('report_type') or 'Report'} bundle"

    styles = _make_styles()
    buffer = io.BytesIO()

    # Footer + page-number callback writes the bundle hash on every page
    def _draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(INK_SOFT)
        # Left: bundle hash (first 24 chars)
        short_hash = (bundle_hash or '')[:24]
        if short_hash:
            canvas.drawString(15 * mm, 10 * mm,
                              f'Bundle anchor: {short_hash}…')
        # Right: page number
        page_num = canvas.getPageNumber()
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm,
                               f'Page {page_num}')
        # Top brand bar
        canvas.setStrokeColor(CLAY)
        canvas.setLineWidth(2)
        canvas.line(15 * mm, A4[1] - 12 * mm, A4[0] - 15 * mm, A4[1] - 12 * mm)
        canvas.setFont('Helvetica-Bold', 8)
        canvas.setFillColor(CLAY)
        canvas.drawString(15 * mm, A4[1] - 10 * mm, 'KUJA · GRANT BUNDLE')
        canvas.restoreState()

    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title=title_text[:120], author='Kuja',
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height, id='normal',
    )
    doc.addPageTemplates([
        PageTemplate(id='kuja', frames=frame, onPage=_draw_footer),
    ])

    story = []

    # --- Cover block ---
    story.append(Paragraph('GRANT REPORT BUNDLE', styles['eyebrow']))
    story.append(Paragraph(_esc(title_text), styles['h1']))
    subtitle_parts = []
    if cover.get('org_name'):
        subtitle_parts.append(_esc(cover['org_name']))
    if cover.get('donor_org_name'):
        subtitle_parts.append(_esc(cover['donor_org_name']))
    if cover.get('reporting_period'):
        subtitle_parts.append(_esc(cover['reporting_period']))
    if subtitle_parts:
        story.append(Paragraph(' · '.join(subtitle_parts), styles['subtitle']))

    # Quick-stats grid (status, compliance, capacity, diligence, evidence)
    cells = []
    cells.append(_stat_cell('Status', _esc(cover.get('status') or '—'),
                            _status_color(cover.get('status') or '')))
    if bundle.get('compliance_score') is not None:
        cells.append(_stat_cell('Compliance', f'{bundle["compliance_score"]}/100', INK))
    if trust:
        cells.append(_stat_cell('Capacity',
                                f'{trust.get("capacity_score", 0)}/100',
                                _status_color(trust.get('capacity_status', ''))))
        cells.append(_stat_cell('Diligence',
                                f'{trust.get("diligence_score", 0)}/100',
                                _status_color(trust.get('diligence_status', ''))))
    cells.append(_stat_cell('Evidence', str(len(attachments)), INK))

    # Spread stats across a single row table
    if cells:
        t = Table([cells], colWidths=[(doc.width / max(1, len(cells)))] * len(cells))
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
        story.append(Spacer(1, 8))

    # --- Executive summary (AI) ---
    if bundle.get('executive_summary'):
        story.append(Paragraph('EXECUTIVE SUMMARY (AI-GENERATED)', styles['eyebrow']))
        story.append(Paragraph('Executive summary', styles['h2']))
        story.append(_callout_box(bundle['executive_summary'], styles, accent=CLAY))

    # --- Narrative sections ---
    narrative = bundle.get('narrative_sections') or {}
    if narrative:
        story.append(Paragraph('NARRATIVE', styles['eyebrow']))
        story.append(Paragraph('Report narrative', styles['h2']))
        for key, value in list(narrative.items())[:12]:
            label = key.replace('_', ' ').title()
            story.append(Paragraph(f'<b>{_esc(label)}</b>', styles['body']))
            story.append(Paragraph(_esc(_truncate(str(value), 1200)), styles['body']))

    # --- Indicators ---
    if indicators:
        story.append(Paragraph('INDICATORS', styles['eyebrow']))
        story.append(Paragraph(f'Indicators ({len(indicators)})', styles['h2']))
        rows = [['Name', 'Current', 'Target', 'Unit']]
        for ind in indicators[:30]:
            rows.append([
                _esc(_truncate(str(ind.get('name') or ''), 60)),
                _esc(_truncate(str(ind.get('current') or '—'), 60)),
                _esc(_truncate(str(ind.get('target') or '—'), 30)),
                _esc(_truncate(str(ind.get('unit') or ''), 20)),
            ])
        t = Table(rows, colWidths=[doc.width * 0.5, doc.width * 0.2,
                                   doc.width * 0.15, doc.width * 0.15],
                  repeatRows=1)
        t.setStyle(_table_style(header_bg=SAND))
        story.append(t)

    # --- Attachments ---
    if attachments:
        story.append(Paragraph('EVIDENCE', styles['eyebrow']))
        story.append(Paragraph(f'Evidence attachments ({len(attachments)})', styles['h2']))
        rows = [['Filename', 'Type', 'Size', 'Uploaded']]
        for a in attachments[:30]:
            rows.append([
                _esc(_truncate(str(a.get('original_filename') or ''), 60)),
                _esc(_truncate(str(a.get('doc_type') or '—'), 30)),
                _fmt_bytes(a.get('file_size')),
                _fmt_date(a.get('uploaded_at')),
            ])
        t = Table(rows, colWidths=[doc.width * 0.5, doc.width * 0.2,
                                   doc.width * 0.15, doc.width * 0.15],
                  repeatRows=1)
        t.setStyle(_table_style(header_bg=SAND))
        story.append(t)

    # --- Asks / Risks / Decisions ---
    if (asks or risks or decisions):
        story.append(Paragraph('SIGNALS', styles['eyebrow']))
        story.append(Paragraph('Asks · Risks · Decisions', styles['h2']))
        for label, items, accent in (
            ('Asks', asks, NAVY),
            ('Risks', risks, SUN),
            ('Decisions', decisions, GROW),
        ):
            if not items:
                continue
            story.append(Paragraph(f'<b><font color="#{_hex(accent)}">{label} ({len(items)})</font></b>',
                                   styles['body']))
            for s in items[:8]:
                body = _esc(_truncate(str(s.get('body') or ''), 220))
                status = s.get('status', 'open')
                marker = '✗ ' if status == 'resolved' else '• '
                story.append(Paragraph(marker + body, styles['callout']))

    # --- Risk flags (AI report analysis) ---
    if risk_flags:
        story.append(Paragraph('AI RISK FLAGS', styles['eyebrow']))
        story.append(Paragraph('AI risk flags', styles['h2']))
        for f in risk_flags[:12]:
            story.append(Paragraph('• ' + _esc(_truncate(str(f), 280)), styles['callout']))

    # --- Audit anchor block (always last; high-contrast) ---
    story.append(Spacer(1, 18))
    story.append(_anchor_block(bundle_hash, bundle.get('assembled_at', '')))

    doc.build(story)
    return buffer.getvalue()


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def _esc(s) -> str:
    """ReportLab paragraphs use simple HTML — escape ampersands + angles."""
    if s is None: return ''
    text = str(s)
    return (text
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;'))


def _truncate(s: str, n: int) -> str:
    if not s: return ''
    return s if len(s) <= n else s[:n - 1] + '…'


def _fmt_bytes(n) -> str:
    if not n: return ''
    try:
        n = int(n)
    except (ValueError, TypeError):
        return ''
    if n < 1024: return f'{n} B'
    if n < 1024 * 1024: return f'{n / 1024:.1f} KB'
    return f'{n / (1024 * 1024):.1f} MB'


def _fmt_date(iso: str | None) -> str:
    if not iso: return ''
    try:
        return datetime.fromisoformat(str(iso).replace('Z', '+00:00')).strftime('%Y-%m-%d')
    except Exception:
        return _esc(str(iso)[:10])


def _hex(c) -> str:
    """ReportLab Color → "rrggbb" string."""
    return f'{int(c.red * 255):02x}{int(c.green * 255):02x}{int(c.blue * 255):02x}'


def _status_color(status: str):
    s = (status or '').lower()
    if s in ('clear', 'strong', 'verified', 'accepted'): return GROW
    if s in ('flagged', 'thin', 'overdue', 'critical'): return FLAG
    if s in ('review', 'adequate', 'pending', 'submitted'): return SUN
    return INK_SOFT


def _stat_cell(label: str, value: str, value_color) -> list:
    """Build a small 'Label / value' cell as a nested ReportLab list."""
    label_p = Paragraph(
        f'<font size="7" color="#{_hex(INK_SOFT)}"><b>{_esc(label.upper())}</b></font>',
        ParagraphStyle('cell_label', fontName='Helvetica', alignment=TA_LEFT),
    )
    value_p = Paragraph(
        f'<font size="11" color="#{_hex(value_color)}"><b>{_esc(value)}</b></font>',
        ParagraphStyle('cell_val', fontName='Helvetica-Bold', alignment=TA_LEFT),
    )
    return [label_p, value_p]


def _table_style(*, header_bg) -> TableStyle:
    return TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR', (0, 0), (-1, 0), INK),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, SAVANNA]),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ])


def _callout_box(text: str, styles: dict, *, accent) -> KeepTogether:
    """Render text inside a colored left-border box."""
    p = Paragraph(_esc(_truncate(text, 1200)), styles['exec_summary'])
    box = Table([[p]], colWidths=['*'])
    box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#FFF7ED')),
        ('LINEBEFORE', (0, 0), (0, -1), 3, accent),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return KeepTogether([box, Spacer(1, 8)])


def _anchor_block(bundle_hash: str, assembled_at: str) -> KeepTogether:
    """Audit anchor footer — explains the hash so a donor reading this PDF
    in isolation understands what it proves."""
    text = (
        f'<font color="#{_hex(INK_SOFT)}"><b>AUDIT ANCHOR</b><br/></font>'
        f'<font color="#{_hex(INK)}">'
        f'This bundle\'s payload hashes to:</font><br/>'
        f'<font face="Courier" size="8" color="#{_hex(INK)}">{_esc(bundle_hash or "—")}</font><br/><br/>'
        f'<font color="#{_hex(INK_SOFT)}" size="8">'
        f'Any modification to the bundle\'s sections would change this hash. '
        f'The publishing event is anchored in the platform\'s tamper-evident '
        f'audit chain; ask the issuing organisation to share the chain entry '
        f'if you need cryptographic proof. Assembled: '
        f'{_esc(_fmt_date(assembled_at))}.'
        f'</font>'
    )
    p = Paragraph(text, ParagraphStyle(
        'anchor', fontName='Helvetica', fontSize=8.5, leading=12,
        textColor=INK,
    ))
    box = Table([[p]], colWidths=['*'])
    box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), SAVANNA),
        ('LINEBEFORE', (0, 0), (0, -1), 3, NAVY),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return KeepTogether([box])

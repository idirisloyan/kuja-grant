"""
CalendarPdfService — Phase 13 (May 2026).

Renders the unified deadline calendar (from /api/calendar/deadlines)
into a printable / emailable PDF. NGO program manager + donor portfolio
lead both want one piece of paper for the week's stand-up.

Why a PDF and not just the screen view:
  - Field staff print their week's deadlines and stick them on the wall
  - Donor portfolio leads forward a quarter view to their board chair
    who doesn't have a Kuja login
  - Low-bandwidth users can save offline and reference without re-loading

Layout:
  - Cover: who, when, window, count
  - Week-by-week tables: monday → sunday rows, kind-grouped, severity-coded
  - Footer on every page: ownership + page numbers
"""

import io
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle,
)

from app.services.bundle_pdf_service import (
    _make_styles, _esc, _truncate,
    NAVY, CLAY, CLAY_DARK, INK, INK_SOFT, SAND, SAVANNA, BORDER, FLAG, SUN, GROW,
)

logger = logging.getLogger('kuja')


KIND_LABEL = {
    'grant_deadline': 'Grant deadline',
    'report_due': 'Report due',
    'registration_expiry': 'Registration expiry',
    'passport_expiry': 'Passport expiry',
    'screening_due': 'Screening due',
}

SEVERITY_COLOR = {
    'high': FLAG,
    'medium': SUN,
    'low': GROW,
}


def _parse(d):
    if isinstance(d, date) and not isinstance(d, datetime):
        return d
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, str):
        try:
            return date.fromisoformat(d[:10])
        except ValueError:
            return None
    return None


def _week_start(d: date) -> date:
    # Monday as week start
    return d - timedelta(days=d.weekday())


def build_calendar_pdf(
    *, viewer_name: str, viewer_role: str,
    window_start: date | None, window_end: date | None, today: date,
    events: list[dict],
) -> bytes:
    """Render the calendar to a PDF."""
    styles = _make_styles()
    buffer = io.BytesIO()

    def _draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(INK_SOFT)
        canvas.drawString(15 * mm, 10 * mm,
                          f'Calendar · {viewer_name[:60]} · {viewer_role}')
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm,
                               f'Page {canvas.getPageNumber()}')
        canvas.setStrokeColor(CLAY)
        canvas.setLineWidth(2)
        canvas.line(15 * mm, A4[1] - 12 * mm, A4[0] - 15 * mm, A4[1] - 12 * mm)
        canvas.setFont('Helvetica-Bold', 8)
        canvas.setFillColor(CLAY)
        canvas.drawString(15 * mm, A4[1] - 10 * mm, 'KUJA · CALENDAR')
        canvas.restoreState()

    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=20 * mm, bottomMargin=18 * mm,
        title=f'Kuja Calendar — {viewer_name[:80]}',
        author='Kuja',
    )
    frame = Frame(
        doc.leftMargin, doc.bottomMargin,
        doc.width, doc.height, id='cal',
    )
    doc.addPageTemplates([
        PageTemplate(id='cal', frames=frame, onPage=_draw_footer),
    ])

    story = []
    story.append(Paragraph('YOUR CALENDAR · UPCOMING & RECENT', styles['eyebrow']))
    story.append(Paragraph(_esc(viewer_name), styles['h1']))
    sub = []
    if window_start: sub.append(_esc(window_start.strftime('%d %b %Y')))
    if window_end:
        sub.append('→')
        sub.append(_esc(window_end.strftime('%d %b %Y')))
    sub.append(f"· {len(events)} event{'s' if len(events) != 1 else ''}")
    story.append(Paragraph(' '.join(sub), styles['subtitle']))

    # Group events by week-start (Monday)
    parsed = []
    for e in events or []:
        d = _parse(e.get('date'))
        if d:
            parsed.append((d, e))
    parsed.sort(key=lambda x: x[0])

    if not parsed:
        story.append(Paragraph(
            'No events in this window. Nice and clear.',
            styles['body'],
        ))
        doc.build(story)
        return buffer.getvalue()

    weeks = defaultdict(list)
    for d, e in parsed:
        weeks[_week_start(d)].append((d, e))
    week_keys = sorted(weeks.keys())

    for wstart in week_keys:
        wend = wstart + timedelta(days=6)
        is_this_week = wstart <= today <= wend
        story.append(Spacer(1, 8))
        wlabel = f'Week of {wstart.strftime("%d %b")} – {wend.strftime("%d %b %Y")}'
        if is_this_week:
            wlabel += '  ·  THIS WEEK'
        story.append(Paragraph(wlabel, styles['h2']))

        # Build per-week table
        header = ['Date', 'Kind', 'Item', 'Detail', 'Pri']
        rows = [header]
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), SAND),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8.5),
            ('GRID', (0, 0), (-1, -1), 0.3, BORDER),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, SAVANNA]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]
        for d, e in weeks[wstart]:
            kind = e.get('kind') or ''
            severity = e.get('severity') or 'low'
            day_label = d.strftime('%a %d %b')
            if d == today:
                day_label += ' · today'
            elif d < today:
                day_label += ' · past'
            rows.append([
                day_label,
                KIND_LABEL.get(kind, kind),
                _truncate(e.get('label') or '', 60),
                _truncate(e.get('detail') or '', 60),
                severity.upper(),
            ])
            # color the pri cell by severity
            r_idx = len(rows) - 1
            sev_col = SEVERITY_COLOR.get(severity, INK_SOFT)
            style_cmds.append(('TEXTCOLOR', (4, r_idx), (4, r_idx), sev_col))
            style_cmds.append(('FONTNAME', (4, r_idx), (4, r_idx), 'Helvetica-Bold'))
            if d < today:
                style_cmds.append(('TEXTCOLOR', (0, r_idx), (0, r_idx), INK_SOFT))

        t = Table(rows, colWidths=[
            doc.width * 0.18, doc.width * 0.16, doc.width * 0.28,
            doc.width * 0.30, doc.width * 0.08,
        ], repeatRows=1)
        t.setStyle(TableStyle(style_cmds))
        story.append(t)

    # Closing footer note
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        '<font size="8" color="#6B7280">Generated by Kuja. Severity reflects '
        'days-to-due at print time; reload in the app for live status.</font>',
        ParagraphStyle('cal_footer', fontName='Helvetica', fontSize=8,
                       textColor=INK_SOFT, leading=11),
    ))

    doc.build(story)
    return buffer.getvalue()

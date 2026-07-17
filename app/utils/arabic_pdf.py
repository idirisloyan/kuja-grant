"""Arabic text in reportlab PDFs — July 2026.

reportlab's base fonts are Latin-1 and it does no OpenType shaping, so
Arabic needs three things this module provides:

  1. an embedded font with the Arabic Presentation Forms block
     (Amiri, SIL OFL — vendored in app/assets/fonts with its license);
  2. shaping: arabic_reshaper turns logical letters into the correct
     positional forms (connected script instead of typewriter letters);
  3. bidi: python-bidi reorders the shaped text into the visual
     left-to-right order reportlab draws in.

Everything degrades honestly: if the font or libraries are missing the
callers fall back to English-only output — never a 500.
"""

import os
import re

_ARABIC_RANGE = re.compile(r'[؀-ۿݐ-ݿࢠ-ࣿ]')
FONTS_DIR = os.path.join(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))), 'assets', 'fonts')


def ensure_arabic_fonts() -> bool:
    """Register Amiri Regular/Bold once per process.

    Returns True when 'Amiri'/'Amiri-Bold' are usable font names."""
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        registered = pdfmetrics.getRegisteredFontNames()
        if 'Amiri' not in registered:
            pdfmetrics.registerFont(TTFont(
                'Amiri', os.path.join(FONTS_DIR, 'Amiri-Regular.ttf')))
        if 'Amiri-Bold' not in registered:
            pdfmetrics.registerFont(TTFont(
                'Amiri-Bold', os.path.join(FONTS_DIR, 'Amiri-Bold.ttf')))
        return True
    except Exception:
        return False


def has_arabic(text) -> bool:
    return bool(_ARABIC_RANGE.search(text or ''))


def shape_ar(text: str) -> str:
    """Logical Arabic (possibly mixed with Latin/digits) -> shaped,
    visually-ordered string ready for drawRightString."""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        return get_display(arabic_reshaper.reshape(text))
    except Exception:
        return text  # unshaped beats crashed


def wrap_arabic(text: str, font: str, size: float, max_width: float):
    """Word-wrap LOGICAL Arabic text to max_width points, measuring the
    SHAPED width of each candidate line (shaped glyph widths differ from
    the logical string's). Joining never crosses a space, so shaping per
    finished line is safe. Returns logical lines — shape when drawing."""
    from reportlab.pdfbase import pdfmetrics
    lines, cur = [], ''
    for word in (text or '').split():
        cand = f'{cur} {word}'.strip()
        if not cur or pdfmetrics.stringWidth(
                shape_ar(cand), font, size) <= max_width:
            cur = cand
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines or ['']

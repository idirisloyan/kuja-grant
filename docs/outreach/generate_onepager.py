"""
Phase 716b — A4 printable one-pager for the Proximate Fund field team.

Arabic-first, English secondary, QR code to /proximate-nominate.
Regenerate whenever the URL changes (e.g. when proximate.kuja.org DNS
lands):

    python docs/outreach/generate_onepager.py [url]

Requires: reportlab, qrcode, arabic-reshaper, python-bidi.
Uses Windows Arial for Arabic glyphs; swap FONT_PATH on other OSes.
"""

import sys
import os

import qrcode
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

URL = sys.argv[1] if len(sys.argv) > 1 else (
    'https://web-production-6f8a.up.railway.app/proximate-nominate'
)
OUT = os.path.join(os.path.dirname(__file__), 'proximate-nominate-onepager.pdf')
FONT_PATH = r'C:\Windows\Fonts\arial.ttf'
FONT_BOLD = r'C:\Windows\Fonts\arialbd.ttf'

EMERALD = HexColor('#047857')
DARK = HexColor('#1f2937')
GREY = HexColor('#6b7280')


def ar(text: str) -> str:
    """Shape + reorder Arabic for correct PDF rendering."""
    return get_display(arabic_reshaper.reshape(text))


def main():
    pdfmetrics.registerFont(TTFont('Ar', FONT_PATH))
    pdfmetrics.registerFont(TTFont('ArB', FONT_BOLD))

    W, H = A4
    c = canvas.Canvas(OUT, pagesize=A4)

    # Header band
    c.setFillColor(EMERALD)
    c.rect(0, H - 3.2 * cm, W, 3.2 * cm, fill=1, stroke=0)
    c.setFillColor(HexColor('#ffffff'))
    c.setFont('ArB', 22)
    c.drawRightString(W - 1.5 * cm, H - 1.6 * cm, ar('صندوق بروكسيميت'))
    c.setFont('ArB', 13)
    c.drawString(1.5 * cm, H - 1.6 * cm, 'Proximate Fund')
    c.setFont('Ar', 11)
    c.drawRightString(W - 1.5 * cm, H - 2.4 * cm,
                      ar('تمويل مجتمعي مباشر في السودان — من أديسو'))
    c.setFont('Ar', 9)
    c.drawString(1.5 * cm, H - 2.4 * cm,
                 'Direct community funding in Sudan — by Adeso')

    y = H - 4.6 * cm

    # Lead — Arabic primary
    c.setFillColor(DARK)
    c.setFont('ArB', 14)
    c.drawRightString(W - 1.5 * cm, y,
                      ar('هل لمجموعتكم عمل مجتمعي في السودان؟'))
    y -= 0.8 * cm
    c.setFont('Ar', 11.5)
    for line in [
        'نموّل المجموعات المجتمعية مباشرةً، بشهادة مجتمعكم أنتم.',
        'لا يلزم تسجيل رسمي، ولا حساب مصرفي مسبق، ولا أوراق معقدة.',
    ]:
        c.drawRightString(W - 1.5 * cm, y, ar(line))
        y -= 0.65 * cm

    # English lead block, beside the Arabic lead
    c.setFillColor(GREY)
    c.setFont('Ar', 9.5)
    ey = H - 5.4 * cm
    for line in [
        'Does your group serve its community in Sudan?',
        'We fund community groups directly, vouched for by',
        'your own community. No registration or paperwork.',
    ]:
        c.drawString(1.5 * cm, ey, line)
        ey -= 0.5 * cm

    # Steps
    y = H - 8.6 * cm
    steps = [
        ('١', 'رشّحوا مجموعتكم — خمسة أسئلة قصيرة عبر الرابط',
         '1. Nominate your group — five short questions at the link'),
        ('٢', 'مجتمعكم يشهد لكم — شيوخ ومنسقون محليون يؤكدون عملكم',
         '2. Your community vouches — local elders confirm your work'),
        ('٣', 'أديسو تتواصل معكم — خلال أيام، عبر الهاتف أو واتساب',
         '3. Adeso contacts you — within days, by phone or WhatsApp'),
    ]
    c.setFillColor(DARK)
    c.setFont('ArB', 13)
    c.drawRightString(W - 1.5 * cm, y, ar('كيف تعمل؟'))
    c.setFont('ArB', 10)
    c.drawString(1.5 * cm, y, 'How it works')
    y -= 0.85 * cm
    for num, arline, enline in steps:
        c.setFillColor(EMERALD)
        c.setFont('ArB', 12)
        c.drawRightString(W - 1.5 * cm, y, ar(num))
        c.setFillColor(DARK)
        c.setFont('Ar', 11)
        c.drawRightString(W - 2.3 * cm, y, ar(arline))
        y -= 0.55 * cm
        c.setFillColor(GREY)
        c.setFont('Ar', 9)
        c.drawRightString(W - 2.3 * cm, y, enline)
        y -= 0.75 * cm

    # QR block
    qr_img = qrcode.make(URL, box_size=10, border=2)
    qr_path = os.path.join(os.path.dirname(__file__), '_qr_tmp.png')
    qr_img.save(qr_path)
    qr_size = 5.2 * cm
    qx = 1.5 * cm
    qy = 2.6 * cm
    c.drawImage(qr_path, qx, qy, qr_size, qr_size)
    os.remove(qr_path)

    c.setFillColor(DARK)
    c.setFont('ArB', 13)
    c.drawRightString(W - 1.5 * cm, qy + qr_size - 0.6 * cm,
                      ar('امسحوا الرمز للترشيح الآن'))
    c.setFont('Ar', 10)
    c.drawRightString(W - 1.5 * cm, qy + qr_size - 1.35 * cm,
                      'Scan the code to nominate now')
    c.setFont('Ar', 9)
    c.setFillColor(GREY)
    c.drawRightString(W - 1.5 * cm, qy + qr_size - 2.2 * cm, URL)
    c.setFont('Ar', 10)
    c.setFillColor(DARK)
    c.drawRightString(W - 1.5 * cm, qy + 1.1 * cm,
                      ar('لا نطلب أي تفاصيل بنكية عبر هذا الرابط.'))
    c.setFont('Ar', 8.5)
    c.setFillColor(GREY)
    c.drawRightString(W - 1.5 * cm, qy + 0.5 * cm,
                      'We never ask for bank details through this link.')

    # Footer
    c.setFillColor(GREY)
    c.setFont('Ar', 8)
    c.drawCentredString(W / 2, 1.2 * cm,
                        'Adeso — African Development Solutions · adeso.org')

    c.save()
    print(f'Wrote {OUT} (QR -> {URL})')


if __name__ == '__main__':
    main()

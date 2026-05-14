"""
Kuja Market Analysis Deck (v5.0) — May 2026.

A focused 19-slide presentation summarising the v5.0 market analysis
with embedded charts. Designed for partner conversations, board
reviews, and internal alignment.

Regenerable: charts in docs/deck_charts.py · deck assembly here.
"""

import os
import sys

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, THIS_DIR)
import deck_charts as _charts

# Regenerate charts on every build so they stay in lockstep with content
CHART_PATHS = _charts.generate_all()
CHART = {os.path.basename(p).split("_", 1)[1].rsplit(".", 1)[0]: p
         for p in CHART_PATHS}


# ============================================================================
# BRANDING
# ============================================================================
NAVY = RGBColor(0x1B, 0x3A, 0x5C)
SKY = RGBColor(0x2C, 0x5F, 0x8A)
CLAY = RGBColor(0xC2, 0x41, 0x0C)
CLAY_SOFT = RGBColor(0xFF, 0xE4, 0xD6)
SAND = RGBColor(0xF2, 0xF6, 0xFA)
INK = RGBColor(0x1F, 0x29, 0x37)
MUTED = RGBColor(0x64, 0x74, 0x8B)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
GROW = RGBColor(0x16, 0xA3, 0x4A)
SUN = RGBColor(0xF5, 0x9E, 0x0B)
FLAG = RGBColor(0xDC, 0x26, 0x26)

SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)
FONT = "Calibri"

prs = Presentation()
prs.slide_width = SLIDE_W
prs.slide_height = SLIDE_H
BLANK = prs.slide_layouts[6]


# ============================================================================
# HELPERS
# ============================================================================

def add_text(slide, left, top, width, height, text, size=14, bold=False,
             color=INK, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             italic=False):
    tx = slide.shapes.add_textbox(left, top, width, height)
    tf = tx.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.text = text
    p.alignment = align
    r = p.runs[0]
    r.font.name = FONT
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    return tx


def add_bullets(slide, left, top, width, height, items, size=14,
                color=INK, bullet_color=NAVY):
    tx = slide.shapes.add_textbox(left, top, width, height)
    tf = tx.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if isinstance(item, tuple):
            head, body = item
            r1 = p.add_run() if i > 0 else (p.runs[0] if p.runs else p.add_run())
            # Set first run for bold prefix
            if not p.runs:
                r1 = p.add_run()
            else:
                r1 = p.runs[0]
            r1.text = "• " + head
            r1.font.name = FONT
            r1.font.size = Pt(size)
            r1.font.bold = True
            r1.font.color.rgb = bullet_color
            r2 = p.add_run()
            r2.text = " " + body
            r2.font.name = FONT
            r2.font.size = Pt(size)
            r2.font.color.rgb = color
        else:
            r = p.runs[0] if p.runs else p.add_run()
            r.text = "• " + str(item)
            r.font.name = FONT
            r.font.size = Pt(size)
            r.font.color.rgb = color
        p.space_after = Pt(8)
        p.line_spacing = 1.18
    return tx


def add_rect(slide, left, top, width, height, fill, line_color=None,
             corner=True):
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if corner else MSO_SHAPE.RECTANGLE,
        left, top, width, height,
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line_color is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line_color
        shape.line.width = Pt(1.2)
    return shape


def add_brand_bar(slide):
    """Slim brand bar at the bottom of every content slide."""
    add_rect(slide, Inches(0), Inches(7.30), SLIDE_W, Inches(0.20),
             NAVY, corner=False)
    add_text(slide, Inches(0.5), Inches(7.30), Inches(8), Inches(0.20),
             "Kuja  ·  AI-Powered Grant Management for the Global South",
             size=9, color=WHITE, align=PP_ALIGN.LEFT, italic=True)
    add_text(slide, Inches(5), Inches(7.30), Inches(7.8), Inches(0.20),
             "Market Analysis  ·  v5.0  ·  May 2026",
             size=9, color=WHITE, align=PP_ALIGN.RIGHT, italic=True)


def slide_title_bar(slide, title, subtitle=None):
    """Title banner across the top of a content slide."""
    add_rect(slide, Inches(0), Inches(0), SLIDE_W, Inches(0.85),
             NAVY, corner=False)
    add_text(slide, Inches(0.5), Inches(0.10), Inches(12.3), Inches(0.55),
             title, size=22, bold=True, color=WHITE,
             anchor=MSO_ANCHOR.MIDDLE)
    if subtitle:
        add_text(slide, Inches(0.5), Inches(0.45), Inches(12.3), Inches(0.35),
                 subtitle, size=11, color=CLAY_SOFT, italic=True,
                 anchor=MSO_ANCHOR.MIDDLE)


def add_chart(slide, key, left, top, width):
    path = CHART.get(key)
    if not path or not os.path.exists(path):
        return
    slide.shapes.add_picture(path, left, top, width=width)


def new_slide():
    return prs.slides.add_slide(BLANK)


# ============================================================================
# SLIDE 1 — Cover
# ============================================================================

s = new_slide()
# Full-bleed navy background
add_rect(s, Inches(0), Inches(0), SLIDE_W, SLIDE_H, NAVY, corner=False)
# Accent stripe
add_rect(s, Inches(0), Inches(3.6), SLIDE_W, Inches(0.06), CLAY, corner=False)

# Big brand wordmark
add_text(s, Inches(0), Inches(1.7), SLIDE_W, Inches(1.6),
         "Kuja", size=110, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

# Subtitle
add_text(s, Inches(0), Inches(3.85), SLIDE_W, Inches(0.6),
         "An AI-Powered Grant Management System",
         size=24, color=CLAY_SOFT, align=PP_ALIGN.CENTER)

# Built-for line
add_text(s, Inches(0), Inches(4.55), SLIDE_W, Inches(0.45),
         "Built for the Global South",
         size=14, color=WHITE, italic=True, align=PP_ALIGN.CENTER)

# Document type
add_text(s, Inches(0), Inches(5.7), SLIDE_W, Inches(0.5),
         "MARKET ANALYSIS",
         size=18, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

# Version
add_text(s, Inches(0), Inches(6.3), SLIDE_W, Inches(0.4),
         "v5.0  ·  May 2026",
         size=12, color=CLAY_SOFT, align=PP_ALIGN.CENTER, italic=True)

# Confidential footer
add_text(s, Inches(0), Inches(7.0), SLIDE_W, Inches(0.4),
         "INTERNAL · FOR TEAM AND PARTNERS",
         size=9, color=WHITE, align=PP_ALIGN.CENTER, italic=True)


# ============================================================================
# SLIDE 2 — The problem we address
# ============================================================================

s = new_slide()
slide_title_bar(s, "The Problem We Address",
                "Grant funding for Global South non-profits is structurally inefficient.")

# Three columns
col_w = Inches(4.0); col_top = Inches(1.3); col_h = Inches(5.6)
col_gap = Inches(0.3)
xs = [Inches(0.5), Inches(0.5) + col_w + col_gap,
      Inches(0.5) + 2 * (col_w + col_gap)]

cols = [
    ("FOR NGOs", [
        "Capacity assessment fatigue — answer the same 80–120 questions across CHS, UN-HACT, NUPAS, STEP, and donor-specific variants",
        "Application overhead with no help to know if their answer is strong",
        "Compliance evidence scattered across email, drives, and binders",
        "Reporting templates that vary by donor with no guidance on what each donor cares about",
        "Decision opacity — most applications rejected with little or no feedback",
        "Language exclusion — donor portals are English-only",
    ]),
    ("FOR DONORS", [
        "Sourcing is slow and intuition-driven — finding strong NGOs requires personal networks",
        "Capacity signal is non-standard — every donor maintains their own framework",
        "Application quality variance comes from language proficiency, not programme quality",
        "Compliance is reactive — sanctions, registry, document validation happen at the last minute",
        "Reports do not roll up — aggregating outcomes requires manual extraction",
        "No early-warning signal when grants drift off track",
    ]),
    ("FOR REVIEWERS", [
        "Each application takes hours to read carefully",
        "Rationales drift — reviewers anchor on each other, not the rubric",
        "Patterns across the portfolio are invisible",
        "No standardised way to cite specific evidence per criterion",
        "Suspect quality cannot be flagged with confidence",
    ]),
]

for (title, items), x in zip(cols, xs):
    # Header
    add_rect(s, x, col_top, col_w, Inches(0.55), NAVY)
    add_text(s, x, col_top, col_w, Inches(0.55),
             title, size=13, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    # Body card
    add_rect(s, x, col_top + Inches(0.6), col_w, col_h - Inches(0.6),
             SAND, line_color=NAVY)
    add_bullets(s, x + Inches(0.18), col_top + Inches(0.75),
                col_w - Inches(0.35), col_h - Inches(0.8),
                items, size=10.5, color=INK)

add_brand_bar(s)


# ============================================================================
# SLIDE 3 — Market opportunity (with chart)
# ============================================================================

s = new_slide()
slide_title_bar(s, "Market Opportunity",
                "$2.75B today · $4.79B by 2030 · 10.3% CAGR")

# Chart on the left
add_chart(s, "market_size", Inches(0.4), Inches(1.2), Inches(8.4))

# Key takeaways on the right
add_rect(s, Inches(9.0), Inches(1.2), Inches(3.9), Inches(5.7),
         SAND, line_color=NAVY)
add_text(s, Inches(9.2), Inches(1.4), Inches(3.6), Inches(0.4),
         "Why it matters now",
         size=13, bold=True, color=NAVY)
add_bullets(s, Inches(9.2), Inches(1.9), Inches(3.6), Inches(4.9),
            [
                ("Sector disruption. ",
                 "USAID dissolution in 2025 with 83% of programmes cancelled has created urgent demand for diversified funding infrastructure."),
                ("AI inflection. ",
                 "92% of nonprofits use AI in some capacity, but 76% lack formal AI strategy — there is a window for an AI-native platform."),
                ("Cloud shift. ",
                 "65% of new grant management deployments are cloud-based."),
                ("Localisation pressure. ",
                 "Grand Bargain 2.0 targets 25% direct local funding; actual <5%."),
            ],
            size=10, color=INK)

add_brand_bar(s)


# ============================================================================
# SLIDE 4 — TAM / SAM / SOM
# ============================================================================

s = new_slide()
slide_title_bar(s, "Total / Serviceable / Obtainable Market",
                "Three views on the same opportunity")
add_chart(s, "tam_sam_som", Inches(0.7), Inches(1.2), Inches(11.9))
add_brand_bar(s)


# ============================================================================
# SLIDE 5 — Sector trends (chart)
# ============================================================================

s = new_slide()
slide_title_bar(s, "The Sector Is Shifting",
                "Four trends are creating urgent demand for new grant infrastructure")
add_chart(s, "sector_trends", Inches(0.7), Inches(1.2), Inches(11.9))
add_brand_bar(s)


# ============================================================================
# SLIDE 6 — What Kuja Is
# ============================================================================

s = new_slide()
slide_title_bar(s, "What Kuja Is",
                "An end-to-end platform anchored on three category-defining commitments.")

# Three columns describing the commitments
col_w = Inches(4.0); col_top = Inches(1.3); col_h = Inches(5.6)
col_gap = Inches(0.3)
xs = [Inches(0.5), Inches(0.5) + col_w + col_gap,
      Inches(0.5) + 2 * (col_w + col_gap)]

commits = [
    ("TWO-PILLAR TRUST PROFILE",
     "Every NGO presents a Capacity Profile (\"can they execute?\") and a Due Diligence Profile (\"are they safe to fund?\"). Both pillars passport across applications.",
     ["Five capacity frameworks built in",
      "Custom donor framework builder",
      "Sanctions / AML / CTF",
      "Registration & standing",
      "Beneficial ownership + COI",
      "Adverse media monitoring"]),
    ("EMBEDDED AI INTELLIGENCE",
     "Twenty-one AI surfaces woven into every workflow. Action-oriented, grounded in user data, traceable to sources, editable end to end.",
     ["Application & report drafting",
      "Real-time document scoring",
      "Pre-submission readiness",
      "Reviewer one-screen summary",
      "Compliance pre-empt + pre-flight",
      "Portfolio insights"]),
    ("COMPLIANCE FOR BOTH SIDES",
     "Simplifies compliance and risk for the entire relationship — NGOs are supported through every obligation; donors get pre-assessed reports + portfolio health.",
     ["AI compliance calendar",
      "Proactive reminders",
      "AI report drafting",
      "4-pillar health score",
      "Trajectory + slips forecast",
      "Risk register with owners"]),
]

for (title, blurb, items), x in zip(commits, xs):
    # Header
    add_rect(s, x, col_top, col_w, Inches(0.55), CLAY)
    add_text(s, x, col_top, col_w, Inches(0.55),
             title, size=11, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    # Body card
    add_rect(s, x, col_top + Inches(0.6), col_w, col_h - Inches(0.6),
             CLAY_SOFT, line_color=CLAY)
    add_text(s, x + Inches(0.2), col_top + Inches(0.75),
             col_w - Inches(0.4), Inches(1.5),
             blurb, size=10.5, color=NAVY, italic=True)
    add_bullets(s, x + Inches(0.2), col_top + Inches(2.2),
                col_w - Inches(0.4), col_h - Inches(2.4),
                items, size=10.5, color=NAVY)

add_brand_bar(s)


# ============================================================================
# SLIDE 7 — Two-Pillar Trust Profile (chart)
# ============================================================================

s = new_slide()
slide_title_bar(s, "The Organisation Trust Profile",
                "Two pillars · one source of truth · travels with the organisation")
add_chart(s, "trust_profile", Inches(0.7), Inches(1.2), Inches(11.9))
add_brand_bar(s)


# ============================================================================
# SLIDE 8 — Capacity Passporting
# ============================================================================

s = new_slide()
slide_title_bar(s, "Capacity Passporting",
                "Do the assessment once. Carry it forward to every donor's framework.")

# Visual: 1 → many
# Source on left
add_rect(s, Inches(0.7), Inches(2.8), Inches(3.2), Inches(2.2),
         CLAY_SOFT, line_color=CLAY)
add_text(s, Inches(0.7), Inches(3.0), Inches(3.2), Inches(0.5),
         "STEP 1", size=11, bold=True, color=CLAY, align=PP_ALIGN.CENTER)
add_text(s, Inches(0.7), Inches(3.5), Inches(3.2), Inches(1.5),
         "NGO completes the Kuja Capacity Framework once · stored on the org profile",
         size=12.5, bold=True, color=NAVY, align=PP_ALIGN.CENTER,
         anchor=MSO_ANCHOR.MIDDLE)

# Middle: passport
add_rect(s, Inches(4.5), Inches(2.5), Inches(3.5), Inches(2.8),
         NAVY)
add_text(s, Inches(4.5), Inches(2.7), Inches(3.5), Inches(0.5),
         "STEP 2", size=11, bold=True, color=CLAY_SOFT, align=PP_ALIGN.CENTER)
add_text(s, Inches(4.5), Inches(3.2), Inches(3.5), Inches(0.7),
         "Capacity Passport",
         size=18, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_text(s, Inches(4.5), Inches(3.9), Inches(3.5), Inches(1.3),
         "Framework-neutral facts · AI maps across target frameworks · provenance traced to source",
         size=11, color=CLAY_SOFT, italic=True, align=PP_ALIGN.CENTER)

# Right: target frameworks
add_text(s, Inches(8.7), Inches(2.5), Inches(4.0), Inches(0.4),
         "STEP 3 — Prefilled across any donor framework",
         size=11, bold=True, color=CLAY)
target_frameworks = ["UN-HACT", "STEP", "CHS", "NUPAS", "Donor custom"]
for i, fw in enumerate(target_frameworks):
    y = Inches(2.95 + i * 0.55)
    add_rect(s, Inches(8.7), y, Inches(4.0), Inches(0.45),
             SAND, line_color=NAVY)
    add_text(s, Inches(8.7), y, Inches(4.0), Inches(0.45),
             fw, size=11, bold=True, color=NAVY,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)

# Big effort-reduction stat at the bottom
add_rect(s, Inches(1.5), Inches(5.7), Inches(10.3), Inches(1.2),
         CLAY)
add_text(s, Inches(1.5), Inches(5.85), Inches(10.3), Inches(0.4),
         "Effort reduction per subsequent application",
         size=11, color=WHITE, italic=True, align=PP_ALIGN.CENTER)
add_text(s, Inches(1.5), Inches(6.2), Inches(10.3), Inches(0.6),
         "12 hours of duplicated work  →  under 1 hour of review and refinement",
         size=18, bold=True, color=WHITE, align=PP_ALIGN.CENTER)

add_brand_bar(s)


# ============================================================================
# SLIDE 9 — Due Diligence — four sub-pillars
# ============================================================================

s = new_slide()
slide_title_bar(s, "Due Diligence Beyond Sanctions",
                "Four sub-pillars · passported across applications · auditable end to end")

dd = [
    ("Sanctions, AML & CTF",
     "UN · OFAC · EU + watchlists + CTF designations.",
     "Continuous re-screening on schedule, on change, and on every new application. Coverage includes declared beneficial owners and named officers."),
    ("Registration & Standing",
     "7 government registries today · expanding to all jurisdictions with public portals.",
     "Legal name, status, number verified against organisation-claimed values. Tax-exempt certification verified per country."),
    ("Beneficial Ownership",
     "Officer disclosure + ownership-chain transparency.",
     "Conflict-of-interest checks against donor staff directories surface conflicts before award. Historical preservation for retrospective audit."),
    ("Adverse Media",
     "Daily news scan with AI-classified relevance and severity.",
     "Auto-raised risk register entries above configured thresholds. Plain-language context summary with source link and suggested next steps."),
]
# 2x2 grid
card_w = Inches(6.1); card_h = Inches(2.7)
positions = [
    (Inches(0.5), Inches(1.2)),
    (Inches(6.75), Inches(1.2)),
    (Inches(0.5), Inches(4.05)),
    (Inches(6.75), Inches(4.05)),
]
for (title, lead, body), (x, y) in zip(dd, positions):
    add_rect(s, x, y, card_w, card_h, SAND, line_color=CLAY)
    # Title bar
    add_rect(s, x, y, card_w, Inches(0.5), CLAY)
    add_text(s, x + Inches(0.2), y, card_w - Inches(0.3), Inches(0.5),
             title, size=14, bold=True, color=WHITE,
             anchor=MSO_ANCHOR.MIDDLE)
    # Lead line
    add_text(s, x + Inches(0.2), y + Inches(0.6),
             card_w - Inches(0.3), Inches(0.6),
             lead, size=11.5, bold=True, color=CLAY, italic=True)
    # Body
    add_text(s, x + Inches(0.2), y + Inches(1.2),
             card_w - Inches(0.3), card_h - Inches(1.3),
             body, size=11, color=INK)

add_brand_bar(s)


# ============================================================================
# SLIDE 10 — Embedded AI Intelligence
# ============================================================================

s = new_slide()
slide_title_bar(s, "Embedded AI Intelligence",
                "21 AI-driven surfaces woven into every workflow — grounded, traceable, action-oriented.")

# Three columns for the three primary workspaces
col_w = Inches(4.0); col_top = Inches(1.3); col_h = Inches(5.7)
col_gap = Inches(0.3)
xs = [Inches(0.5), Inches(0.5) + col_w + col_gap,
      Inches(0.5) + 2 * (col_w + col_gap)]

cols = [
    ("NGO", [
        "Match scoring",
        "Application co-author",
        "Real-time document scoring",
        "Submission readiness",
        "Compliance pre-empt",
        "Report co-author",
        "Donor-perspective pre-flight",
        "Compliance to-do list",
    ]),
    ("DONOR", [
        "Grant brief from 2-line prompt",
        "Grant import from PDF/DOCX/TXT",
        "Median-NGO preview",
        "Burden critique",
        "Portfolio insights",
        "Cross-grant patterns",
        "Compliance explanation",
        "Health narrative",
    ]),
    ("REVIEWER", [
        "One-screen summary",
        "Evidence extraction",
        "Comparable signal",
        "Decision-changers",
        "Per-criterion rationale",
        "Red-flag detection",
        "Suggest-criteria",
        "Audit-ready record",
    ]),
]

for (title, items), x in zip(cols, xs):
    add_rect(s, x, col_top, col_w, Inches(0.55), NAVY)
    add_text(s, x, col_top, col_w, Inches(0.55),
             title, size=13, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    # 8 chips per column, 0.55in each + 0.08in gap
    for i, item in enumerate(items):
        y_chip = col_top + Inches(0.7) + Inches(i * 0.6)
        add_rect(s, x + Inches(0.1), y_chip, col_w - Inches(0.2),
                 Inches(0.5), CLAY_SOFT, line_color=CLAY)
        add_text(s, x + Inches(0.2), y_chip, col_w - Inches(0.4),
                 Inches(0.5), item, size=11, bold=True, color=NAVY,
                 anchor=MSO_ANCHOR.MIDDLE)

add_brand_bar(s)


# ============================================================================
# SLIDE 11 — Compliance simplified for both sides (chart)
# ============================================================================

s = new_slide()
slide_title_bar(s, "Compliance — Simplified for Both Sides",
                "The platform's flagship: NGOs are supported, donors are confident.")
add_chart(s, "compliance_both_sides", Inches(0.7), Inches(1.2), Inches(11.9))
add_brand_bar(s)


# ============================================================================
# SLIDE 12 — Mobile + Offline
# ============================================================================

s = new_slide()
slide_title_bar(s, "Mobile-First, Offline-First",
                "The operating reality of Global South CSOs — not an afterthought.")

# Big stat block on the left
add_rect(s, Inches(0.5), Inches(1.4), Inches(5.5), Inches(5.5),
         NAVY)
add_text(s, Inches(0.5), Inches(1.7), Inches(5.5), Inches(0.6),
         "WHY IT MATTERS", size=12, bold=True, color=CLAY_SOFT,
         align=PP_ALIGN.CENTER)
add_text(s, Inches(0.7), Inches(2.3), Inches(5.1), Inches(2.5),
         "The primary device for most Global South NGO staff is a phone. "
         "Connectivity is intermittent. Bandwidth is limited. The platform "
         "treats this as a first-class scenario rather than a degraded mode.",
         size=13, color=WHITE, italic=True)
add_text(s, Inches(0.7), Inches(5.0), Inches(5.1), Inches(1.8),
         "Field officers draft, capture evidence, and complete reports "
         "without a connection — the system syncs in the background when the "
         "network returns.",
         size=13, color=WHITE)

# Capabilities grid on the right
caps = [
    ("Progressive Web App",
     "Installable on phone home screen · same login as desktop"),
    ("Offline-first",
     "Draft applications, complete assessments, write reports without a network"),
    ("Continuous auto-save",
     "Every keystroke saved to local device storage"),
    ("Background sync",
     "Queued uploads transmit automatically on reconnection"),
    ("Camera as evidence",
     "Photographs of consent forms, beneficiaries, before/after — vision-based extraction"),
    ("Low-bandwidth optimised",
     "Heavy AI work runs async; core flows work on slow 3G"),
]
for i, (k, v) in enumerate(caps):
    row = i // 2; col = i % 2
    x = Inches(6.3 + col * 3.4); y = Inches(1.4 + row * 1.9)
    add_rect(s, x, y, Inches(3.2), Inches(1.7), CLAY_SOFT, line_color=CLAY)
    add_text(s, x + Inches(0.15), y + Inches(0.15),
             Inches(2.9), Inches(0.4),
             k, size=11.5, bold=True, color=CLAY)
    add_text(s, x + Inches(0.15), y + Inches(0.55),
             Inches(2.9), Inches(1.1),
             v, size=10, color=INK)

add_brand_bar(s)


# ============================================================================
# SLIDE 13 — Competitive landscape (chart)
# ============================================================================

s = new_slide()
slide_title_bar(s, "Competitive Landscape",
                "No competitor combines Global South focus with deep AI integration.")
add_chart(s, "competitive_2x2", Inches(0.7), Inches(1.1), Inches(11.9))
add_brand_bar(s)


# ============================================================================
# SLIDE 14 — Feature comparison (chart)
# ============================================================================

s = new_slide()
slide_title_bar(s, "Feature Coverage vs. Competitors",
                "40/40 fully supported · 17 differentiators no competitor offers.")
add_chart(s, "feature_count", Inches(0.7), Inches(1.2), Inches(11.9))
add_brand_bar(s)


# ============================================================================
# SLIDE 15 — Competitive Advantages (category-defining)
# ============================================================================

s = new_slide()
slide_title_bar(s, "Competitive Advantages — Category-Defining",
                "Three commitments no competitor matches.")

# Three big numbered cards
cards = [
    ("1", "Embedded AI Intelligence, Not a Chatbot",
     "AI is woven through every workflow as a working partner. Grounded in user data, traceable to sources, action-oriented (an editable starting point), and falls back gracefully when the AI service is unavailable. Competitors offering AI today provide chatbots or analytics dashboards — not a working AI partner."),
    ("2", "Two-Pillar Organisation Trust Profile",
     "Every NGO presents Capacity + Due Diligence side by side, both passported across applications. No competitor offers both pillars together. No competitor offers passporting on the due-diligence side."),
    ("3", "Compliance Simplified for Both Sides",
     "NGOs get an AI compliance working partner (extract obligations → calendar → reminders → drafting → scoring → pre-flight → revision guidance). Donors get pre-assessed scored reports, 4-pillar health, trajectory forecasting, slips-in-N-days warnings, and a risk register. The donor is never surprised; the NGO is never blocked."),
]
card_h = Inches(1.9); card_top = Inches(1.2); gap = Inches(0.15)
for i, (num, title, body) in enumerate(cards):
    y = card_top + i * (card_h + gap)
    add_rect(s, Inches(0.5), y, Inches(12.3), card_h, SAND, line_color=CLAY)
    # Number badge
    add_rect(s, Inches(0.5), y, Inches(1.2), card_h, CLAY)
    add_text(s, Inches(0.5), y, Inches(1.2), card_h,
             num, size=44, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, Inches(1.9), y + Inches(0.2), Inches(10.7), Inches(0.5),
             title, size=15, bold=True, color=CLAY)
    add_text(s, Inches(1.9), y + Inches(0.7), Inches(10.7), Inches(1.1),
             body, size=11, color=INK)

add_brand_bar(s)


# ============================================================================
# SLIDE 16 — Competitive Advantages (structural)
# ============================================================================

s = new_slide()
slide_title_bar(s, "Competitive Advantages — Structural",
                "Seven additional structural strengths.")

# 4 cards on left, 3 on right (or 3+4) — 7 cards in a 4×2 layout
adv = [
    ("4", "Only End-to-End Platform",
     "Marketplace, trust profile, AI applications, dual-scoring review, AI-supported reporting + health, ERP — single platform."),
    ("5", "Mobile-First, Offline-First",
     "Progressive web app · auto-save · background sync · vision-based evidence extraction."),
    ("6", "Built By and For the Global South",
     "Six languages at parity with role-aware tone · Adeso's 30+ years of humanitarian experience."),
    ("7", "Dual-Sided Network Effects",
     "CSOs gain visibility, AI working partner, calendar of obligations. Donors gain vetted pipeline + portfolio health."),
    ("8", "Auditable by Construction",
     "Provenance on every AI claim · tamper-evident hash-chained audit log · donor override transparency."),
    ("9", "Seamless ERP Conversion",
     "KujaBuild (Odoo 17) onboards seamlessly because most data is already captured in earlier stages."),
    ("10", "Credibility of Adeso",
     "Somali-founded · NEAR Network co-founder · three decades of African humanitarian impact."),
]
# Lay out 4 wide x 2 high (one empty)
card_w = Inches(3.0); card_h = Inches(2.7); gap_x = Inches(0.2); gap_y = Inches(0.2)
start_x = Inches(0.5); start_y = Inches(1.2)
for i, (num, title, body) in enumerate(adv):
    row = i // 4; col = i % 4
    x = start_x + col * (card_w + gap_x)
    y = start_y + row * (card_h + gap_y)
    add_rect(s, x, y, card_w, card_h, SAND, line_color=NAVY)
    # Number circle
    add_rect(s, x + Inches(0.15), y + Inches(0.15),
             Inches(0.6), Inches(0.6), CLAY)
    add_text(s, x + Inches(0.15), y + Inches(0.15),
             Inches(0.6), Inches(0.6),
             num, size=18, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, x + Inches(0.9), y + Inches(0.2),
             card_w - Inches(1.05), Inches(0.7),
             title, size=12, bold=True, color=NAVY)
    add_text(s, x + Inches(0.15), y + Inches(1.0),
             card_w - Inches(0.3), card_h - Inches(1.1),
             body, size=10.5, color=INK)

add_brand_bar(s)


# ============================================================================
# SLIDE 17 — Target market segments
# ============================================================================

s = new_slide()
slide_title_bar(s, "Target Market Segments",
                "Five segments · phased geographic expansion · dual-sided model.")

segs = [
    ("African CSOs / NGOs", "100,000+ registered",
     "Free marketplace tier + paid assessment + ERP option", NAVY),
    ("Global South CSOs (LatAm, Asia)", "500,000+",
     "Phase 2–3 geographic expansion", SKY),
    ("Bilateral / multilateral donors", "50+ major institutions",
     "Premium end-to-end solution", CLAY),
    ("Private foundations", "200,000+ globally",
     "Application portal + matching", CLAY),
    ("INGOs seeking local partners", "1,000+",
     "Marketplace + assessment integration", SKY),
]
card_w = Inches(11.5); card_top = Inches(1.3); card_h = Inches(0.95)
gap = Inches(0.1)
for i, (seg, size, approach, color) in enumerate(segs):
    y = card_top + i * (card_h + gap)
    # Big card
    add_rect(s, Inches(0.9), y, card_w, card_h, SAND, line_color=color)
    # Coloured stripe
    add_rect(s, Inches(0.9), y, Inches(0.18), card_h, color, corner=False)
    # Segment name
    add_text(s, Inches(1.3), y + Inches(0.05),
             Inches(4.5), card_h - Inches(0.1),
             seg, size=13, bold=True, color=NAVY,
             anchor=MSO_ANCHOR.MIDDLE)
    # Size
    add_text(s, Inches(5.8), y + Inches(0.05),
             Inches(2.5), card_h - Inches(0.1),
             size, size=12.5, bold=True, color=color,
             anchor=MSO_ANCHOR.MIDDLE)
    # Approach
    add_text(s, Inches(8.3), y + Inches(0.05),
             Inches(4.0), card_h - Inches(0.1),
             approach, size=10.5, color=INK, italic=True,
             anchor=MSO_ANCHOR.MIDDLE)

add_brand_bar(s)


# ============================================================================
# SLIDE 18 — Roadmap (chart)
# ============================================================================

s = new_slide()
slide_title_bar(s, "Roadmap",
                "v5.0 launch wave shipped Q2 2026 · momentum continues through 2028.")
add_chart(s, "roadmap", Inches(0.5), Inches(1.1), Inches(12.3))
add_brand_bar(s)


# ============================================================================
# SLIDE 19 — Why Adeso, Why Now (closing)
# ============================================================================

s = new_slide()
add_rect(s, Inches(0), Inches(0), SLIDE_W, SLIDE_H, NAVY, corner=False)
add_rect(s, Inches(0), Inches(3.6), SLIDE_W, Inches(0.06), CLAY, corner=False)

# Title
add_text(s, Inches(0), Inches(0.7), SLIDE_W, Inches(0.7),
         "Why Adeso · Why Now",
         size=36, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_text(s, Inches(0), Inches(1.4), SLIDE_W, Inches(0.5),
         "Right team · right moment · right product.",
         size=14, color=CLAY_SOFT, align=PP_ALIGN.CENTER, italic=True)

# Three pillars
pillars = [
    ("WHY ADESO",
     "Somali-founded African social enterprise. 30+ years of humanitarian impact. "
     "Co-founder of the NEAR Network — the largest network of national and local "
     "organisations in the Global South. Built by the communities Kuja serves."),
    ("WHY NOW",
     "USAID dissolution in 2025 ($36B cut, 83% of programmes cancelled) has created "
     "urgent demand for diversified funding infrastructure and direct donor-to-NGO "
     "connections. 92% of nonprofits already use AI but 76% lack a strategy."),
    ("WHY KUJA",
     "The only platform combining marketplace, two-pillar Trust Profile, Embedded AI "
     "Intelligence, compliance simplified for both sides, mobile-first delivery, and "
     "ERP operations — purpose-built for the Global South."),
]
for i, (title, body) in enumerate(pillars):
    x = Inches(0.5 + i * 4.2)
    add_rect(s, x, Inches(4.1), Inches(4.0), Inches(2.7),
             WHITE)
    # Title bar
    add_rect(s, x, Inches(4.1), Inches(4.0), Inches(0.55), CLAY)
    add_text(s, x, Inches(4.1), Inches(4.0), Inches(0.55),
             title, size=13, bold=True, color=WHITE,
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, x + Inches(0.2), Inches(4.8),
             Inches(3.6), Inches(2.0),
             body, size=11, color=INK)

# Closing footer
add_text(s, Inches(0), Inches(7.1), SLIDE_W, Inches(0.3),
         "Findable. Fundable. Trusted.",
         size=14, italic=True, color=CLAY_SOFT, align=PP_ALIGN.CENTER)


# ============================================================================
# SAVE
# ============================================================================

out_path = os.path.join(THIS_DIR, "Kuja_Market_Analysis_Deck_v5.pptx")
prs.save(out_path)

import os
size_kb = os.path.getsize(out_path) / 1024
size_str = f"{size_kb:.1f} KB" if size_kb < 1024 else f"{size_kb / 1024:.1f} MB"
print(f"Generated: {out_path}")
print(f"File size: {size_str}")
print(f"Slides: {len(prs.slides)}")

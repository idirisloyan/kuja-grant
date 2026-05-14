"""
Chart generator for the Kuja Market Analysis Deck (v5.0).

Produces clean, on-brand PNG charts at 200 dpi that the deck embeds.
Uses matplotlib so charts are versioned and regenerable.
"""

from __future__ import annotations

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Rectangle
import numpy as np


# Kuja brand palette (matches the BRD)
NAVY = "#1B3A5C"
SKY = "#2C5F8A"
SAND = "#F2F6FA"
CLAY = "#C2410C"
CLAY_SOFT = "#FFE4D6"
GROW = "#16A34A"
SUN = "#F59E0B"
FLAG = "#DC2626"
INK = "#1F2937"
MUTED = "#64748B"
WHITE = "#FFFFFF"

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(THIS_DIR, "deck_assets")
os.makedirs(OUT_DIR, exist_ok=True)


def _save(fig, name):
    out = os.path.join(OUT_DIR, name)
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE, dpi=200)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# 1. Market size growth — bar chart 2024–2030
# ---------------------------------------------------------------------------

def chart_market_size_growth():
    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=200)
    years = [2024, 2025, 2026, 2027, 2028, 2029, 2030]
    # 10.3% CAGR from 2.75 in 2024
    values = [round(2.75 * (1.103 ** (y - 2024)), 2) for y in years]

    bars = ax.bar(years, values, color=NAVY, width=0.65, edgecolor=NAVY)
    # Highlight the start and end years in clay
    bars[0].set_color(CLAY); bars[0].set_edgecolor(CLAY)
    bars[-1].set_color(CLAY); bars[-1].set_edgecolor(CLAY)

    # Value labels
    for b, v in zip(bars, values):
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.08,
                f"${v}B", ha="center", va="bottom",
                color=NAVY, fontsize=11, fontweight="bold")

    ax.set_title("Global Grant Management Software Market",
                 color=NAVY, fontsize=15, fontweight="bold", pad=18)
    ax.text(0.5, 1.02, "10.3% CAGR · $2.75B (2024) → $4.79B (2030)",
            transform=ax.transAxes, ha="center", color=MUTED,
            fontsize=11, style="italic")

    ax.set_ylabel("Market size (USD, billions)", color=NAVY, fontsize=10)
    ax.set_xticks(years)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(MUTED)
    ax.spines["bottom"].set_color(MUTED)
    ax.tick_params(colors=MUTED)
    ax.set_ylim(0, max(values) * 1.18)
    ax.grid(axis="y", linestyle="--", alpha=0.3)

    # Source note
    fig.text(0.5, -0.02, "Source: Grand View Research, Grant Management Software Market Report 2024",
             ha="center", color=MUTED, fontsize=8, style="italic")

    return _save(fig, "01_market_size.png")


# ---------------------------------------------------------------------------
# 2. TAM / SAM / SOM funnel
# ---------------------------------------------------------------------------

def chart_tam_sam_som():
    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 6.5)
    ax.set_axis_off()

    ax.text(5.5, 6.1, "Total Addressable, Serviceable, Obtainable Markets",
            ha="center", color=NAVY, fontsize=15, fontweight="bold")
    ax.text(5.5, 5.65, "Three views on the same opportunity",
            ha="center", color=MUTED, fontsize=10, style="italic")

    tiers = [
        ("TAM", "Total Addressable Market",
         "Full global grant management software market",
         "$2.75B (2024) → $4.79B (2030)", NAVY, WHITE),
        ("SAM", "Serviceable Available Market",
         "NGO/nonprofit segment (58.2%)",
         "$1.6B (2024) → $2.79B (2030)", SKY, WHITE),
        ("SOM", "Serviceable Obtainable Market",
         "Year 1–3 realistic capture, Africa-first",
         "$1M ARR Year 1 · $2M+ Year 3", CLAY, WHITE),
    ]

    # Three nested funnel-style rounded rects
    widths = [10.2, 8.2, 6.2]
    height = 1.2
    y_start = 4.2
    for i, (label, title, scope, value, fill, text_col) in enumerate(tiers):
        w = widths[i]
        x = (11 - w) / 2
        y = y_start - i * (height + 0.15)
        box = FancyBboxPatch((x, y), w, height,
                             boxstyle="round,pad=0.04,rounding_size=0.08",
                             linewidth=0, facecolor=fill, zorder=2)
        ax.add_patch(box)
        # Label badge
        ax.text(x + 0.55, y + height / 2, label,
                ha="center", va="center", color=text_col, fontsize=22,
                fontweight="bold")
        # Title + scope
        ax.text(x + 1.4, y + height / 2 + 0.22, title,
                ha="left", va="center", color=text_col, fontsize=12,
                fontweight="bold")
        ax.text(x + 1.4, y + height / 2 - 0.08, scope,
                ha="left", va="center", color=text_col, fontsize=9.5)
        # Value badge on the right
        ax.text(x + w - 0.4, y + height / 2, value,
                ha="right", va="center", color=text_col, fontsize=11,
                fontweight="bold")

    fig.text(0.5, 0.04, "TAM source: Grand View Research · SAM: 58.2% NGO segment share · SOM: Kuja Year 1–3 plan",
             ha="center", color=MUTED, fontsize=8, style="italic")

    return _save(fig, "02_tam_sam_som.png")


# ---------------------------------------------------------------------------
# 3. Sector trends — 4-stat tile dashboard
# ---------------------------------------------------------------------------

def chart_sector_trends():
    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 6)
    ax.set_axis_off()

    ax.text(5.5, 5.6, "The Sector Is Shifting", ha="center",
            color=NAVY, fontsize=15, fontweight="bold")
    ax.text(5.5, 5.2,
            "Four trends are creating urgent demand for new grant infrastructure",
            ha="center", color=MUTED, fontsize=10, style="italic")

    stats = [
        ("$36B", "in USAID cuts", "83% of programs cancelled (March 2025).",
         FLAG),
        ("<5%", "direct local funding", "Grand Bargain 2.0 target is 25%. Localisation gap is real.",
         CLAY),
        ("92%", "of nonprofits use AI", "but 76% lack any formal AI strategy (TechSoup 2025).",
         GROW),
        ("65%", "cloud deployments", "of new grant-management implementations.",
         SKY),
    ]

    box_w = 2.4; box_h = 3.5; gap = 0.3
    total_w = 4 * box_w + 3 * gap
    x_start = (11 - total_w) / 2

    for i, (big, mid, sub, color) in enumerate(stats):
        x = x_start + i * (box_w + gap)
        y = 0.8
        # Card
        box = FancyBboxPatch((x, y), box_w, box_h,
                             boxstyle="round,pad=0.04,rounding_size=0.08",
                             linewidth=1.5, edgecolor=color, facecolor=WHITE, zorder=2)
        ax.add_patch(box)
        # Big number
        ax.text(x + box_w / 2, y + box_h - 0.65, big,
                ha="center", va="center", color=color, fontsize=28,
                fontweight="bold")
        # Mid label
        ax.text(x + box_w / 2, y + box_h - 1.4, mid,
                ha="center", va="center", color=NAVY, fontsize=11,
                fontweight="bold")
        # Sub explanation
        # Wrap manually
        words = sub.split()
        lines = []; cur = ""
        for w in words:
            if len(cur) + len(w) > 28:
                lines.append(cur.strip()); cur = w + " "
            else:
                cur += w + " "
        if cur: lines.append(cur.strip())
        for j, line in enumerate(lines):
            ax.text(x + box_w / 2, y + box_h - 1.95 - j * 0.32,
                    line, ha="center", va="center", color=MUTED, fontsize=8.5)

    return _save(fig, "03_sector_trends.png")


# ---------------------------------------------------------------------------
# 4. Competitive landscape 2x2 — Global South focus vs AI depth
# ---------------------------------------------------------------------------

def chart_competitive_2x2():
    fig, ax = plt.subplots(figsize=(11, 6.5), dpi=200)
    ax.set_xlim(-1, 11); ax.set_ylim(-1, 11)
    ax.set_axis_off()

    ax.text(5, 10.5, "Competitive Landscape", ha="center",
            color=NAVY, fontsize=15, fontweight="bold")
    ax.text(5, 10.05,
            "Global South focus (X axis) vs. depth of AI integration (Y axis)",
            ha="center", color=MUTED, fontsize=10, style="italic")

    # Axis lines
    ax.annotate("", xy=(9.8, 0.5), xytext=(0.2, 0.5),
                arrowprops=dict(arrowstyle="->", color=NAVY, linewidth=1.5))
    ax.annotate("", xy=(0.5, 9.8), xytext=(0.5, 0.2),
                arrowprops=dict(arrowstyle="->", color=NAVY, linewidth=1.5))
    # Axis labels
    ax.text(5, 0.05, "Global South focus →", ha="center",
            color=NAVY, fontsize=10, fontweight="bold")
    ax.text(0.05, 5, "AI depth ↑", ha="center", va="center", rotation=90,
            color=NAVY, fontsize=10, fontweight="bold")

    # Quadrant labels — placed where they don't collide with bubbles.
    ax.text(2.5, 9.4, "Strong AI · US/EU focus", ha="center",
            color=MUTED, fontsize=8.5, style="italic")
    ax.text(6.0, 5.5, "Strong AI · Global South",
            ha="center", color=CLAY, fontsize=10, fontweight="bold")
    ax.text(2.5, 1.0, "Legacy · North-only", ha="center",
            color=MUTED, fontsize=8.5, style="italic")
    ax.text(7.5, 1.0, "Global South · low AI", ha="center",
            color=MUTED, fontsize=8.5, style="italic")

    # Light quadrant shading for the upper-right (where Kuja sits)
    ax.add_patch(Rectangle((5, 5), 4.8, 4.5, facecolor=CLAY_SOFT,
                           alpha=0.35, zorder=0))

    # Competitors (x = global-south-focus 0–10, y = AI depth 0–10, size = market reach)
    # Positions hand-tuned so labels don't collide.
    comps = [
        # name, x, y, marker size, label dx, label dy, is_kuja
        ("Kuja",              9.0, 9.0, 950,  0.0,  0.0,  True),
        ("Fluxx",             1.6, 5.2, 700,  0.0, -0.6, False),
        ("Submittable",       1.8, 6.2, 600, -0.05, 0.6, False),
        ("SmartSimple",       3.0, 4.4, 500,  0.0,  0.6, False),
        ("Bonterra",          1.5, 3.8, 600,  0.0, -0.6, False),
        ("OpenGrants",        3.0, 6.5, 300,  0.0,  0.55, False),
        ("Instrumentl",       2.4, 7.4, 350,  0.0,  0.55, False),
        ("Xapien",            4.0, 7.2, 350,  0.0,  0.55, False),
        ("GlobalGiving",      6.5, 2.0, 500,  0.0,  0.6, False),
        ("UN Partner Portal", 7.5, 2.8, 450,  0.0,  0.6, False),
        ("TechSoup STEP",     5.5, 3.0, 350,  0.0,  0.6, False),
    ]
    for name, x, y, s, dx, dy, is_kuja in comps:
        edge = CLAY if is_kuja else NAVY
        face = CLAY if is_kuja else "white"
        ax.scatter(x, y, s=s, c=face, edgecolors=edge, linewidths=2, zorder=4)
        ax.text(x + dx, y + dy, name, ha="center", va="center",
                color=WHITE if is_kuja else NAVY,
                fontsize=9, fontweight="bold" if is_kuja else "normal",
                zorder=5)

    fig.text(0.5, 0.02,
             "Position reflects current product positioning, not company size. "
             "Bubble size approximates market reach.",
             ha="center", color=MUTED, fontsize=8, style="italic")

    return _save(fig, "04_competitive_2x2.png")


# ---------------------------------------------------------------------------
# 5. Feature comparison — differentiator count
# ---------------------------------------------------------------------------

def chart_feature_count():
    fig, ax = plt.subplots(figsize=(11, 5.8), dpi=200)
    # Numbers reflect Y count in the feature matrix in the market analysis
    competitors = ["Kuja", "Fluxx", "SmartSimple", "Submittable",
                   "UN Partner Portal", "GlobalGiving", "Instrumentl",
                   "TechSoup STEP"]
    full_y = [40, 14, 14, 12, 11, 8, 6, 4]

    y_pos = np.arange(len(competitors))[::-1]
    bars = ax.barh(y_pos, full_y, color=[CLAY] + [NAVY] * (len(competitors) - 1),
                   edgecolor=[CLAY] + [NAVY] * (len(competitors) - 1))

    ax.set_yticks(y_pos)
    ax.set_yticklabels(competitors, color=NAVY, fontsize=11)
    ax.set_xlabel("Number of fully-supported features (out of 40)",
                  color=NAVY, fontsize=10)
    ax.set_title("Feature Coverage vs. Competitors",
                 color=NAVY, fontsize=15, fontweight="bold", pad=14)
    ax.set_xlim(0, 45)

    for b, v in zip(bars, full_y):
        ax.text(v + 0.5, b.get_y() + b.get_height() / 2,
                str(v), va="center", color=NAVY, fontsize=11, fontweight="bold")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(MUTED)
    ax.spines["bottom"].set_color(MUTED)
    ax.tick_params(colors=MUTED)
    ax.grid(axis="x", linestyle="--", alpha=0.3)

    fig.text(0.5, -0.02,
             "Kuja: 40/40 fully supported · 17 differentiators no competitor offers. "
             "See market analysis section 5 for the full matrix.",
             ha="center", color=MUTED, fontsize=8, style="italic")

    return _save(fig, "05_feature_count.png")


# ---------------------------------------------------------------------------
# 6. Roadmap timeline — shipped vs planned vs future
# ---------------------------------------------------------------------------

def chart_roadmap_timeline():
    fig, ax = plt.subplots(figsize=(11.5, 5.5), dpi=200)
    ax.set_xlim(0, 11.5); ax.set_ylim(0, 6.5)
    ax.set_axis_off()

    ax.text(5.75, 6.1, "Roadmap — Shipped, Planned, Future",
            ha="center", color=NAVY, fontsize=15, fontweight="bold")
    ax.text(5.75, 5.7,
            "v5.0 launch wave shipped in Q2 2026; momentum continues through 2028",
            ha="center", color=MUTED, fontsize=10, style="italic")

    # Timeline arrow
    ax.annotate("", xy=(11, 3.5), xytext=(0.5, 3.5),
                arrowprops=dict(arrowstyle="-|>", color=NAVY, linewidth=2))

    phases = [
        # (label, x_center, color, top items, bottom items)
        ("Q1 2026\nFoundation", 1.5, GROW,
         ["Live sanctions", "Registry verification (7)", "AI document analysis",
          "Donor wizard", "NGO reporting"], None),
        ("Q2 2026\nv5.0 launch", 4.0, GROW,
         ["Two-pillar Trust Profile", "Capacity passporting",
          "Embedded AI Intelligence", "Compliance support both sides",
          "Mobile + offline (PWA)"], None),
        ("Q3–Q4 2026\nNext wave", 6.7, SUN,
         ["Odoo ERP integration", "Marketplace v2",
          "Registry expansion (15+ ctries)", "Portfolio analytics",
          "Verification fees"], None),
        ("2027\nScale", 8.9, SKY,
         ["All sub-Saharan registries", "Workflow configurator",
          "Predictive matching", "LatAm + MENA languages"], None),
        ("2028\nExpand", 10.7, MUTED,
         ["Latin America launch", "Course marketplace"], None),
    ]

    for label, cx, color, items, _ in phases:
        # Dot on timeline
        ax.scatter(cx, 3.5, s=200, color=color, edgecolors=NAVY, linewidths=1.5, zorder=4)
        # Period label
        ax.text(cx, 3.95, label, ha="center", va="bottom",
                color=NAVY, fontsize=10, fontweight="bold")
        # Item card
        n_items = len(items)
        card_h = 0.42 + n_items * 0.32
        card_y = 3.05 - card_h
        card_w = 1.95
        card_x = cx - card_w / 2
        box = FancyBboxPatch((card_x, card_y), card_w, card_h,
                             boxstyle="round,pad=0.03,rounding_size=0.06",
                             linewidth=1.2, edgecolor=color, facecolor=WHITE)
        ax.add_patch(box)
        for j, item in enumerate(items):
            ax.text(card_x + 0.1, card_y + card_h - 0.25 - j * 0.32,
                    "•  " + item, ha="left", va="top",
                    color=NAVY, fontsize=7.5)

    # Legend
    legend_items = [
        (GROW, "Shipped"),
        (SUN, "In flight"),
        (SKY, "Planned"),
        (MUTED, "Long-term"),
    ]
    for i, (c, l) in enumerate(legend_items):
        x = 0.5 + i * 2.0
        ax.scatter(x, 0.4, s=80, color=c, edgecolors=NAVY, linewidths=1)
        ax.text(x + 0.2, 0.4, l, ha="left", va="center",
                color=NAVY, fontsize=9)

    return _save(fig, "06_roadmap.png")


# ---------------------------------------------------------------------------
# 7. Two-pillar Trust Profile — simplified for deck
# ---------------------------------------------------------------------------

def chart_trust_profile():
    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 6)
    ax.set_axis_off()

    ax.text(5.5, 5.6, "The Organisation Trust Profile",
            ha="center", color=NAVY, fontsize=15, fontweight="bold")
    ax.text(5.5, 5.2,
            "Two pillars · one source of truth · travels with the organisation across every application",
            ha="center", color=MUTED, fontsize=10, style="italic")

    # Left pillar
    pillar_w = 4.7; pillar_h = 4.3; head_h = 0.7
    left_x = 0.4
    # header
    box = FancyBboxPatch((left_x, 1.0 + pillar_h - head_h), pillar_w, head_h,
                         boxstyle="round,pad=0.02,rounding_size=0.06",
                         linewidth=0, facecolor=NAVY, zorder=2)
    ax.add_patch(box)
    ax.text(left_x + pillar_w / 2, 1.0 + pillar_h - head_h / 2,
            "CAPACITY PROFILE", ha="center", va="center",
            color=WHITE, fontsize=13, fontweight="bold")
    # body
    body = FancyBboxPatch((left_x, 1.0), pillar_w, pillar_h - head_h - 0.05,
                          boxstyle="round,pad=0.02,rounding_size=0.06",
                          linewidth=1.4, edgecolor=NAVY, facecolor=SAND, zorder=1)
    ax.add_patch(body)
    ax.text(left_x + pillar_w / 2, 1.0 + pillar_h - head_h - 0.45,
            "Can this organisation execute?",
            ha="center", color=NAVY, fontsize=10, style="italic")
    cap_items = [
        "Framework results · Kuja, STEP, UN-HACT, CHS, NUPAS",
        "Pillar scores · Governance, Finance, M&E, Programme, Sustainability",
        "Supporting evidence · audits, board minutes, MEL plan",
        "Passport reuse across donor frameworks (with provenance)",
        "Gap roadmap · where to invest improvement, prioritised",
    ]
    for j, it in enumerate(cap_items):
        ax.text(left_x + 0.2, 1.0 + pillar_h - head_h - 1.05 - j * 0.45,
                "•  " + it, ha="left", va="top", color=NAVY, fontsize=8.5)

    # Right pillar
    right_x = 5.9
    box = FancyBboxPatch((right_x, 1.0 + pillar_h - head_h), pillar_w, head_h,
                         boxstyle="round,pad=0.02,rounding_size=0.06",
                         linewidth=0, facecolor=CLAY, zorder=2)
    ax.add_patch(box)
    ax.text(right_x + pillar_w / 2, 1.0 + pillar_h - head_h / 2,
            "DUE DILIGENCE PROFILE", ha="center", va="center",
            color=WHITE, fontsize=13, fontweight="bold")
    body = FancyBboxPatch((right_x, 1.0), pillar_w, pillar_h - head_h - 0.05,
                          boxstyle="round,pad=0.02,rounding_size=0.06",
                          linewidth=1.4, edgecolor=CLAY, facecolor=CLAY_SOFT, zorder=1)
    ax.add_patch(body)
    ax.text(right_x + pillar_w / 2, 1.0 + pillar_h - head_h - 0.45,
            "Is this organisation safe to fund?",
            ha="center", color=CLAY, fontsize=10, style="italic")
    dd_items = [
        "Sanctions / AML / CTF · UN, OFAC, EU + watchlists, continuous",
        "Registration & standing · 7 government registries (expanding)",
        "Tax-exempt status · per-country certification verification",
        "Beneficial ownership · officer disclosure + COI checks",
        "Adverse media · daily news scan with AI relevance + severity",
    ]
    for j, it in enumerate(dd_items):
        ax.text(right_x + 0.2, 1.0 + pillar_h - head_h - 1.05 - j * 0.45,
                "•  " + it, ha="left", va="top", color=NAVY, fontsize=8.5)

    # Bottom note
    ax.text(5.5, 0.45,
            "Each pillar is verified once and reused across applications. "
            "Donors see both side by side before committing capital.",
            ha="center", color=MUTED, fontsize=9, style="italic")

    return _save(fig, "07_trust_profile.png")


# ---------------------------------------------------------------------------
# 8. Compliance simplified for both sides
# ---------------------------------------------------------------------------

def chart_compliance_both_sides():
    fig, ax = plt.subplots(figsize=(11, 5.5), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 6.2)
    ax.set_axis_off()

    ax.text(5.5, 5.85, "Compliance Simplified for Both Sides",
            ha="center", color=NAVY, fontsize=15, fontweight="bold")
    ax.text(5.5, 5.5,
            "Same platform · both sides win",
            ha="center", color=MUTED, fontsize=10, style="italic")

    # Left card: NGO side
    pillar_w = 4.7; pillar_h = 4.6; head_h = 0.6
    left_x = 0.4
    box = FancyBboxPatch((left_x, 0.5 + pillar_h - head_h), pillar_w, head_h,
                         boxstyle="round,pad=0.02,rounding_size=0.06",
                         linewidth=0, facecolor=NAVY, zorder=2)
    ax.add_patch(box)
    ax.text(left_x + pillar_w / 2, 0.5 + pillar_h - head_h / 2,
            "FOR NGOs — Embedded AI as Working Partner",
            ha="center", va="center", color=WHITE,
            fontsize=11, fontweight="bold")
    body = FancyBboxPatch((left_x, 0.5), pillar_w, pillar_h - head_h - 0.05,
                          boxstyle="round,pad=0.02,rounding_size=0.06",
                          linewidth=1.4, edgecolor=NAVY, facecolor=SAND, zorder=1)
    ax.add_patch(body)
    ngo_items = [
        "Extracts donor reporting requirements into a calendar",
        "Proactive reminders ahead of every deadline",
        "Drafts report narratives from prior data",
        "Prompts for the right evidence at the right time",
        "Scores documents in real time as they upload",
        "Donor-perspective pre-flight before submission",
        "AI-drafted updates for revision responses",
    ]
    for j, it in enumerate(ngo_items):
        ax.text(left_x + 0.25, 0.5 + pillar_h - head_h - 0.5 - j * 0.42,
                "•  " + it, ha="left", va="top", color=NAVY, fontsize=9)

    # Right card: Donor side
    right_x = 5.9
    box = FancyBboxPatch((right_x, 0.5 + pillar_h - head_h), pillar_w, head_h,
                         boxstyle="round,pad=0.02,rounding_size=0.06",
                         linewidth=0, facecolor=CLAY, zorder=2)
    ax.add_patch(box)
    ax.text(right_x + pillar_w / 2, 0.5 + pillar_h - head_h / 2,
            "FOR DONORS — Pre-Assessed, Scored, Monitored",
            ha="center", va="center", color=WHITE,
            fontsize=11, fontweight="bold")
    body = FancyBboxPatch((right_x, 0.5), pillar_w, pillar_h - head_h - 0.05,
                          boxstyle="round,pad=0.02,rounding_size=0.06",
                          linewidth=1.4, edgecolor=CLAY, facecolor=CLAY_SOFT, zorder=1)
    ax.add_patch(body)
    donor_items = [
        "Reports arrive pre-assessed with quality score",
        "4-pillar compliance health (completion · timeliness · workflow · importance)",
        "Daily trajectory snapshots over the last 60 days",
        "Slips-in-N-days warnings for grants drifting off track",
        "Risk register with owners + due dates",
        "Portfolio insights: headline + anomalies + next decisions",
        "Plain-language explanation of every finding",
    ]
    for j, it in enumerate(donor_items):
        ax.text(right_x + 0.25, 0.5 + pillar_h - head_h - 0.5 - j * 0.42,
                "•  " + it, ha="left", va="top", color=NAVY, fontsize=9)

    return _save(fig, "08_compliance_both_sides.png")


# ---------------------------------------------------------------------------
# Bundle generator
# ---------------------------------------------------------------------------

def generate_all():
    return [
        chart_market_size_growth(),
        chart_tam_sam_som(),
        chart_sector_trends(),
        chart_competitive_2x2(),
        chart_feature_count(),
        chart_roadmap_timeline(),
        chart_trust_profile(),
        chart_compliance_both_sides(),
    ]


if __name__ == "__main__":
    for p in generate_all():
        print("ok", p)

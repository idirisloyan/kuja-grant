"""
Diagram generator for the Kuja BRD.

Produces clean architectural diagrams as PNG files that the BRD
generator embeds at the appropriate chapter. Uses matplotlib so the
diagrams are versioned and regenerable from this script — no external
tools required.

The diagrams render flat blocks with the Kuja palette
(deep navy header tone, soft sky shading, accent clay for AI
touchpoints) at 200 dpi so they're sharp in Word.
"""

from __future__ import annotations

import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch


# Kuja palette (matches the BRD's heading colours)
NAVY = "#1B3A5C"
SKY = "#2C5F8A"
SAND = "#F2F6FA"
CLAY = "#C2410C"
CLAY_SOFT = "#FFE4D6"
INK = "#1F2937"
MUTED = "#64748B"
WHITE = "#FFFFFF"

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(THIS_DIR, "brd_assets")
os.makedirs(OUT_DIR, exist_ok=True)


def _block(ax, x, y, w, h, label, fill=SAND, edge=NAVY, text=NAVY,
           bold=True, fontsize=9, sub=None):
    """A rounded block with a centred label, optional subtitle."""
    box = FancyBboxPatch(
        (x, y), w, h, boxstyle="round,pad=0.02,rounding_size=0.06",
        linewidth=1.3, edgecolor=edge, facecolor=fill, zorder=2,
    )
    ax.add_patch(box)
    ax.text(x + w / 2, y + h / 2 + (0.05 if sub else 0), label,
            ha="center", va="center", color=text, fontsize=fontsize,
            fontweight=("bold" if bold else "normal"), zorder=3)
    if sub:
        ax.text(x + w / 2, y + h / 2 - 0.12, sub,
                ha="center", va="center", color=MUTED, fontsize=fontsize - 1.5,
                zorder=3)


def _arrow(ax, x1, y1, x2, y2, color=NAVY, dashed=False, label=None):
    style = "->,head_length=8,head_width=5"
    arr = FancyArrowPatch(
        (x1, y1), (x2, y2), arrowstyle=style,
        mutation_scale=10, linewidth=1.1, color=color,
        linestyle=("--" if dashed else "-"),
        zorder=1,
    )
    ax.add_patch(arr)
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.06, label,
                ha="center", va="center", color=color,
                fontsize=7.5, fontweight="bold", zorder=3,
                bbox=dict(boxstyle="round,pad=0.15", facecolor=WHITE,
                          edgecolor="none"))


# ---------------------------------------------------------------------------
# 1. System overview
# ---------------------------------------------------------------------------

def diagram_system_overview():
    fig, ax = plt.subplots(figsize=(11, 6.5), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 7.5)
    ax.set_axis_off()

    # Title
    ax.text(5.5, 7.1, "Kuja Grant Management System — Architecture Overview",
            ha="center", va="center", color=NAVY, fontsize=13, fontweight="bold")

    # Left: user roles
    ax.text(1.4, 6.4, "USERS", ha="center", fontsize=8, color=MUTED, fontweight="bold")
    roles = [
        ("NGO", "Apply, report, monitor obligations"),
        ("Donor", "Publish, evaluate, monitor"),
        ("Reviewer", "Evaluate against rubric"),
        ("Administrator", "Operate the platform"),
    ]
    for i, (r, s) in enumerate(roles):
        _block(ax, 0.2, 5.6 - i * 1.35, 2.4, 1.0, r, sub=s)

    # Centre: Kuja platform
    plat = FancyBboxPatch((3.2, 0.9), 4.6, 5.5,
                          boxstyle="round,pad=0.04,rounding_size=0.08",
                          linewidth=1.6, edgecolor=NAVY, facecolor=WHITE, zorder=2)
    ax.add_patch(plat)
    ax.text(5.5, 6.05, "KUJA PLATFORM", ha="center", va="center",
            color=NAVY, fontsize=11, fontweight="bold")

    capabilities = [
        ("Identity &\nAccess", 3.4, 4.85),
        ("Grant\nLifecycle", 5.0, 4.85),
        ("Application\nLifecycle", 6.6, 4.85),
        ("Capacity\nPassport", 3.4, 3.65),
        ("AI\nCo-pilot", 5.0, 3.65),
        ("Documents\n& Evidence", 6.6, 3.65),
        ("Compliance\n& Risk", 3.4, 2.45),
        ("Collaboration\n& Notifications", 5.0, 2.45),
        ("Org Memory\n& Provenance", 6.6, 2.45),
        ("Reporting\n& Outcomes", 3.4, 1.25),
        ("Admin &\nObservability", 5.0, 1.25),
        ("i18n &\nLocalisation", 6.6, 1.25),
    ]
    for label, x, y in capabilities:
        fill = CLAY_SOFT if "AI" in label or "Memory" in label else SAND
        edge = CLAY if fill == CLAY_SOFT else NAVY
        _block(ax, x - 0.65, y - 0.45, 1.3, 0.9, label,
               fill=fill, edge=edge, text=NAVY, fontsize=8)

    # Right: external services
    ax.text(9.6, 6.4, "EXTERNAL SERVICES", ha="center", fontsize=8,
            color=MUTED, fontweight="bold")
    ext = [
        ("AI Provider", "Large language model"),
        ("Sanctions", "UN · OFAC · EU lists"),
        ("Registries", "7 country registries"),
        ("Web Push", "VAPID provider"),
    ]
    for i, (r, s) in enumerate(ext):
        _block(ax, 8.4, 5.6 - i * 1.35, 2.4, 1.0, r, sub=s,
               fill=SAND, edge=SKY)

    # Arrows: roles → platform
    for i in range(4):
        _arrow(ax, 2.65, 6.1 - i * 1.35, 3.15, 5.8 - i * 0.8)
    # Arrows: platform → ext
    for i in range(4):
        _arrow(ax, 7.85, 5.8 - i * 0.8, 8.35, 6.1 - i * 1.35,
               color=SKY, dashed=True)

    # Legend
    ax.text(5.5, 0.45, "Solid arrows = user requests · Dashed arrows = optional service integrations",
            ha="center", fontsize=7.5, color=MUTED, style="italic")

    fig.tight_layout()
    out = os.path.join(OUT_DIR, "01_system_overview.png")
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# 2. Grant lifecycle with AI touchpoints
# ---------------------------------------------------------------------------

def diagram_grant_lifecycle():
    fig, ax = plt.subplots(figsize=(11, 5.2), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 5.5)
    ax.set_axis_off()
    ax.text(5.5, 5.2, "End-to-End Grant Lifecycle",
            ha="center", color=NAVY, fontsize=13, fontweight="bold")

    # Main flow (8 stages)
    stages = [
        "Donor\npublishes",
        "NGO\ndiscovers",
        "NGO\napplies",
        "Reviewer\nevaluates",
        "Donor\ndecides",
        "Grant\nawarded",
        "NGO\nreports",
        "Compliance\nmonitored",
    ]
    n = len(stages); span = 10.4; pad = 0.3
    box_w = (span - pad * (n - 1)) / n; box_h = 0.95
    y = 2.9
    cx = []
    for i, s in enumerate(stages):
        x = 0.3 + i * (box_w + pad)
        _block(ax, x, y, box_w, box_h, s, fontsize=9)
        cx.append(x + box_w / 2)
    for i in range(n - 1):
        _arrow(ax, cx[i] + box_w / 2, y + box_h / 2,
               cx[i + 1] - box_w / 2, y + box_h / 2)

    # AI overlay above each stage
    ax.text(5.5, 4.65, "AI ASSISTANCE", ha="center", color=CLAY,
            fontsize=8.5, fontweight="bold")
    ai_touch = [
        "Brief generator\nBurden critique\nMedian-NGO preview",
        "Match scoring\nTop strength /\ntop blocker",
        "Co-author\nResponses\nDocument scoring\nPre-flight readiness",
        "Reviewer summary\nEvidence extraction\nDraft rationale",
        "Compliance\npre-empt\nDecision audit",
        "Outcome capture\nContract review",
        "Report co-author\nDonor pre-flight",
        "Trajectory forecast\nRisk detection\nNarrative health",
    ]
    for i, t in enumerate(ai_touch):
        x = 0.3 + i * (box_w + pad)
        ax.text(x + box_w / 2, 4.05, t, ha="center", va="center",
                color=CLAY, fontsize=6.8, style="italic")

    # Compliance overlay below each stage
    ax.text(5.5, 1.95, "COMPLIANCE & TRUST", ha="center", color=SKY,
            fontsize=8.5, fontweight="bold")
    comp = [
        "Eligibility &\ndoc requirements\ndefined",
        "Capacity passport\nshown to NGO",
        "Sanctions check\nRegistry verify\nDoc analysis",
        "Audit chain\nentry",
        "Audit chain\nentry",
        "Sanctions re-check\non award",
        "Evidence scoring\nIndicator data",
        "4-pillar health\nRisk register\nSlips forecast",
    ]
    for i, t in enumerate(comp):
        x = 0.3 + i * (box_w + pad)
        ax.text(x + box_w / 2, 1.25, t, ha="center", va="center",
                color=SKY, fontsize=6.8, style="italic")

    fig.tight_layout()
    out = os.path.join(OUT_DIR, "02_grant_lifecycle.png")
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# 3. NGO compliance journey — AI as compliance copilot
# ---------------------------------------------------------------------------

def diagram_ngo_compliance_journey():
    fig, ax = plt.subplots(figsize=(11, 6.5), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 7)
    ax.set_axis_off()
    ax.text(5.5, 6.7, "NGO Compliance Journey — How AI Supports the NGO Through Every Obligation",
            ha="center", color=NAVY, fontsize=12.5, fontweight="bold")

    # Timeline arrow background
    ax.annotate("", xy=(10.4, 5.5), xytext=(0.6, 5.5),
                arrowprops=dict(arrowstyle="-|>", color=NAVY, linewidth=2))

    phases = [
        ("Application", "Pre-submission",
         ["Capacity passport prefill", "AI compliance pre-empt",
          "Document scoring vs. donor req", "Pre-flight readiness check"]),
        ("Award", "Contract signing",
         ["Sanctions re-check", "Registry re-verify",
          "Reporting reqs auto-extracted"]),
        ("Active grant", "Day-to-day delivery",
         ["Action dashboard (what's due)", "Proactive deadline nudges",
          "Evidence prompts as you go", "Org memory captures learnings"]),
        ("Reporting", "Periodic milestones",
         ["Report co-author from prior data", "Donor pre-flight check",
          "Indicator tracking", "Budget reconciliation"]),
        ("Compliance health", "Continuous",
         ["4-pillar score", "Trajectory forecast",
          "Risk register collaboration", "Slips in N days warning"]),
    ]
    n = len(phases); span = 10.4
    box_w = span / n - 0.18
    for i, (phase, sub, items) in enumerate(phases):
        x = 0.6 + i * (span / n)
        # Phase label on timeline
        circle = mpatches.Circle((x + box_w / 2, 5.5), 0.15,
                                 facecolor=CLAY, edgecolor=NAVY, linewidth=1.3, zorder=4)
        ax.add_patch(circle)
        ax.text(x + box_w / 2, 5.5, str(i + 1), ha="center", va="center",
                color=WHITE, fontsize=9, fontweight="bold", zorder=5)
        # Phase title above
        ax.text(x + box_w / 2, 6.1, phase, ha="center", color=NAVY,
                fontsize=10, fontweight="bold")
        ax.text(x + box_w / 2, 5.85, sub, ha="center", color=MUTED,
                fontsize=7.5, style="italic")
        # AI items box below
        box_h = 2.4
        _block(ax, x, 5.5 - 0.5 - box_h, box_w, box_h, "",
               fill=CLAY_SOFT, edge=CLAY)
        # Header
        ax.text(x + box_w / 2, 5.5 - 0.7, "AI co-pilot",
                ha="center", color=CLAY, fontsize=8.5, fontweight="bold")
        for j, it in enumerate(items):
            ax.text(x + 0.12, 5.5 - 0.95 - j * 0.32,
                    "•  " + it, ha="left", va="top", color=NAVY, fontsize=7.5)

    ax.text(5.5, 0.3,
            "From application through award, delivery, reporting, and ongoing health — "
            "AI surfaces what to do next and helps the NGO actually do it.",
            ha="center", color=MUTED, fontsize=8.5, style="italic")

    fig.tight_layout()
    out = os.path.join(OUT_DIR, "03_ngo_compliance_journey.png")
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# 4. Capacity passporting flow
# ---------------------------------------------------------------------------

def diagram_passporting():
    fig, ax = plt.subplots(figsize=(11, 5.6), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 6)
    ax.set_axis_off()
    ax.text(5.5, 5.6, "Capacity Assessment Passporting",
            ha="center", color=NAVY, fontsize=13, fontweight="bold")

    # Step 1: NGO completes one passport
    _block(ax, 0.3, 2.8, 2.6, 1.5,
           "Step 1\nNGO completes\nKuja Capacity Framework",
           fill=SAND, fontsize=9.5)
    ax.text(1.6, 2.6, "once · stored on org profile",
            ha="center", color=MUTED, fontsize=7.5, style="italic")

    # Step 2: passport as source of truth
    _block(ax, 3.7, 2.5, 2.4, 2.0,
           "Step 2\nCapacity Passport\n(framework-neutral facts)",
           fill=CLAY_SOFT, edge=CLAY, fontsize=9.5)
    ax.text(4.9, 2.3, "AI maps across frameworks",
            ha="center", color=CLAY, fontsize=7.5, style="italic", fontweight="bold")

    # Step 3: passporting to target frameworks
    targets = ["UN-HACT", "STEP", "CHS", "NUPAS", "Donor custom"]
    base_y = 4.4
    for i, t in enumerate(targets):
        _block(ax, 7.2, base_y - i * 0.7, 1.8, 0.55, t,
               fill=SAND, edge=NAVY, fontsize=8.5)
        _arrow(ax, 6.15, 3.5, 7.15, base_y - i * 0.7 + 0.28,
               color=CLAY)

    _arrow(ax, 2.95, 3.55, 3.65, 3.55, color=NAVY)
    ax.text(3.3, 3.75, "informs", ha="center", color=NAVY,
            fontsize=7.5, fontweight="bold")

    # Step 4: applications consume the passport
    _block(ax, 9.3, 2.0, 1.5, 1.8,
           "Step 3\nApplications\nprefilled with\nprovenance",
           fill=SAND, fontsize=9)
    ax.text(10.05, 1.8, "1 hour vs 12 hours",
            ha="center", color=CLAY, fontsize=8, fontweight="bold")

    # Bottom note
    ax.text(5.5, 0.7,
            "The NGO does the work once. The system carries it forward across every donor's framework "
            "— with traceable provenance and inline coaching where the target framework asks something new.",
            ha="center", color=MUTED, fontsize=8.5, style="italic")

    fig.tight_layout()
    out = os.path.join(OUT_DIR, "04_capacity_passporting.png")
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# 5. AI integration map
# ---------------------------------------------------------------------------

def diagram_ai_integration_map():
    fig, ax = plt.subplots(figsize=(11, 6.5), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 7.2)
    ax.set_axis_off()
    ax.text(5.5, 6.9, "AI Integration Across Every Workspace",
            ha="center", color=NAVY, fontsize=13, fontweight="bold")

    # Three columns: NGO, Donor, Reviewer
    col_y = 5.8
    headers = [("NGO", 1.8, NAVY), ("Donor", 5.5, NAVY), ("Reviewer", 9.2, NAVY)]
    for label, cx, c in headers:
        _block(ax, cx - 1.5, col_y, 3.0, 0.6, label, fill=NAVY,
               edge=NAVY, text=WHITE, fontsize=11)

    ngo_items = [
        ("Match scoring", "Find grants you'll win"),
        ("Application co-author", "Draft grounded in your evidence"),
        ("Document real-time scoring", "Score against donor reqs as you upload"),
        ("Submission readiness", "Pre-flight gap analysis"),
        ("Compliance pre-empt", "Catch issues before submit"),
        ("Report co-author", "Draft from prior data"),
        ("Report donor pre-flight", "What will the donor ask?"),
        ("Compliance to-do list", "What's due this week"),
    ]
    donor_items = [
        ("Grant brief generator", "Draft from 2-line prompt"),
        ("Grant import from PDF", "Extract existing brief into wizard"),
        ("Median-NGO preview", "Predict applicant pool"),
        ("Burden critique", "Spot vague or unfair criteria"),
        ("Portfolio insights", "Headline + anomalies"),
        ("Cross-grant patterns", "Patterns across declines"),
        ("Compliance explanation", "Plain-language findings"),
        ("Health narrative", "Why this grant is on/off track"),
    ]
    rev_items = [
        ("One-screen summary", "Who, what, why, evidence"),
        ("Evidence extraction", "Verbatim per criterion"),
        ("Comparable signal", "How this rates vs cohort"),
        ("Decision-changers", "What would shift the score"),
        ("Per-criterion rationale", "Draft + paste"),
        ("Red-flag detection", "Inconsistencies surfaced"),
        ("Suggest-criteria", "When grant has no rubric"),
        ("Audit-ready record", "Why the decision was made"),
    ]
    for col_x, items in [(1.8, ngo_items), (5.5, donor_items), (9.2, rev_items)]:
        for i, (lbl, sub) in enumerate(items):
            y_ = 5.2 - i * 0.62
            _block(ax, col_x - 1.5, y_, 3.0, 0.55, lbl,
                   fill=CLAY_SOFT, edge=CLAY, fontsize=8.5, sub=None)
            ax.text(col_x, y_ - 0.05, sub, ha="center", va="bottom",
                    color=MUTED, fontsize=7)

    ax.text(5.5, 0.3,
            "Every surface above is grounded, traceable, action-oriented, and falls back gracefully when AI is unavailable.",
            ha="center", color=MUTED, fontsize=8.5, style="italic")

    fig.tight_layout()
    out = os.path.join(OUT_DIR, "05_ai_integration_map.png")
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# 6. Two paths to create a grant (donor)
# ---------------------------------------------------------------------------

def diagram_two_grant_paths():
    fig, ax = plt.subplots(figsize=(11, 4.8), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 5)
    ax.set_axis_off()
    ax.text(5.5, 4.7, "Two Paths to Create a Grant",
            ha="center", color=NAVY, fontsize=13, fontweight="bold")

    # Path A: prompt
    _block(ax, 0.3, 2.7, 2.5, 1.3,
           "Path A\nProvide a 2-line\ndonor brief",
           fill=SAND, fontsize=9.5)
    _arrow(ax, 2.85, 3.35, 3.65, 3.35, color=CLAY)
    ax.text(3.25, 3.55, "AI drafts", ha="center", color=CLAY,
            fontsize=7.5, fontweight="bold")

    # Path B: upload
    _block(ax, 0.3, 0.7, 2.5, 1.3,
           "Path B\nUpload existing brief\n(PDF / DOCX / TXT)",
           fill=SAND, fontsize=9.5)
    _arrow(ax, 2.85, 1.35, 3.65, 1.35, color=CLAY)
    ax.text(3.25, 1.55, "AI extracts", ha="center", color=CLAY,
            fontsize=7.5, fontweight="bold")

    # Centre: Wizard
    _block(ax, 3.7, 1.2, 3.5, 2.6,
           "Six-Step Wizard\n(prefilled by AI)",
           fill=CLAY_SOFT, edge=CLAY, fontsize=10)
    steps = ["Basics", "Eligibility", "Criteria & weights",
             "Document requirements", "Reporting config", "Review & publish"]
    for i, s in enumerate(steps):
        ax.text(5.45, 3.55 - i * 0.35, "✓  " + s,
                ha="center", color=NAVY, fontsize=8)

    _arrow(ax, 7.25, 2.5, 8.05, 2.5, color=NAVY)
    ax.text(7.65, 2.7, "Donor refines", ha="center", color=NAVY,
            fontsize=7.5, fontweight="bold")

    # Right: published grant
    _block(ax, 8.1, 1.7, 2.6, 1.6,
           "Grant published\nMatch engine\nnotifies aligned NGOs",
           fill=SAND, edge=NAVY, fontsize=9.5)

    ax.text(5.5, 0.3,
            "Either entry point lands the donor in the same editable wizard. AI assistance is a starting point, never the final word.",
            ha="center", color=MUTED, fontsize=8.5, style="italic")

    fig.tight_layout()
    out = os.path.join(OUT_DIR, "06_two_grant_paths.png")
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)
    return out


# ---------------------------------------------------------------------------
# 7. Organisation Trust Profile — two pillars
# ---------------------------------------------------------------------------

def diagram_trust_profile():
    fig, ax = plt.subplots(figsize=(11, 6.3), dpi=200)
    ax.set_xlim(0, 11); ax.set_ylim(0, 6.5)
    ax.set_axis_off()
    ax.text(5.5, 6.15, "Organisation Trust Profile",
            ha="center", color=NAVY, fontsize=13, fontweight="bold")
    ax.text(5.5, 5.85,
            "Two pillars · one source of truth · travels with the organisation across every application",
            ha="center", color=MUTED, fontsize=9, style="italic")

    # Left pillar — Capacity Profile
    pillar_w = 4.6; pillar_h = 4.5; gap = 0.4
    left_x = 0.4; right_x = left_x + pillar_w + gap + 0.4
    # Left header
    head_h = 0.65
    box = FancyBboxPatch((left_x, 1.0 + pillar_h - head_h), pillar_w, head_h,
                         boxstyle="round,pad=0.02,rounding_size=0.06",
                         linewidth=1.5, edgecolor=NAVY, facecolor=NAVY, zorder=2)
    ax.add_patch(box)
    ax.text(left_x + pillar_w / 2, 1.0 + pillar_h - head_h / 2,
            "CAPACITY PROFILE",
            ha="center", va="center", color=WHITE, fontsize=11, fontweight="bold")
    ax.text(left_x + pillar_w / 2, 1.0 + pillar_h - head_h - 0.25,
            "Can this organisation execute?",
            ha="center", va="center", color=NAVY, fontsize=8.5, style="italic")
    # Left body
    body = FancyBboxPatch((left_x, 1.0), pillar_w, pillar_h - head_h - 0.4,
                          boxstyle="round,pad=0.02,rounding_size=0.06",
                          linewidth=1.3, edgecolor=NAVY, facecolor=SAND, zorder=1)
    ax.add_patch(body)
    cap_items = [
        ("Framework results",
         "Kuja · STEP · UN-HACT · CHS · NUPAS · donor-custom"),
        ("Pillar scores",
         "Governance · Finance · M&E · Programme design · Sustainability"),
        ("Supporting evidence",
         "Audited financials, board minutes, MEL plan, policies"),
        ("Passport version",
         "Last updated, validity window, refresh prompt"),
        ("Gap roadmap",
         "Where to invest improvement, prioritised by likely impact"),
    ]
    y0 = 1.0 + pillar_h - head_h - 0.7
    for i, (k, v) in enumerate(cap_items):
        y = y0 - i * 0.55
        ax.text(left_x + 0.2, y, "•  " + k, ha="left", color=NAVY,
                fontsize=9, fontweight="bold")
        ax.text(left_x + 0.4, y - 0.22, v, ha="left", color=MUTED, fontsize=7.5)

    # Right pillar — Due Diligence Profile
    box = FancyBboxPatch((right_x, 1.0 + pillar_h - head_h), pillar_w, head_h,
                         boxstyle="round,pad=0.02,rounding_size=0.06",
                         linewidth=1.5, edgecolor=CLAY, facecolor=CLAY, zorder=2)
    ax.add_patch(box)
    ax.text(right_x + pillar_w / 2, 1.0 + pillar_h - head_h / 2,
            "DUE DILIGENCE PROFILE",
            ha="center", va="center", color=WHITE, fontsize=11, fontweight="bold")
    ax.text(right_x + pillar_w / 2, 1.0 + pillar_h - head_h - 0.25,
            "Is this organisation safe to fund?",
            ha="center", va="center", color=CLAY, fontsize=8.5, style="italic")
    body = FancyBboxPatch((right_x, 1.0), pillar_w, pillar_h - head_h - 0.4,
                          boxstyle="round,pad=0.02,rounding_size=0.06",
                          linewidth=1.3, edgecolor=CLAY, facecolor=CLAY_SOFT, zorder=1)
    ax.add_patch(body)
    dd_items = [
        ("Sanctions screening",
         "UN · OFAC · EU · continuous · re-checked on every change"),
        ("Registration & standing",
         "Government registry · legal name match · status verified"),
        ("Tax-exempt status",
         "Country-specific certification · valid through date"),
        ("Beneficial ownership",
         "Officer disclosure · ownership chain · conflict checks"),
        ("Adverse media monitoring",
         "Daily news scan · reputational signal · context summary"),
    ]
    for i, (k, v) in enumerate(dd_items):
        y = y0 - i * 0.55
        ax.text(right_x + 0.2, y, "•  " + k, ha="left", color=NAVY,
                fontsize=9, fontweight="bold")
        ax.text(right_x + 0.4, y - 0.22, v, ha="left", color=MUTED, fontsize=7.5)

    # Bottom: passporting note
    ax.text(5.5, 0.55,
            "Each pillar is verified once and reused across applications, "
            "with appropriate refresh cadence. The donor sees both side by "
            "side on the organisation page before committing capital.",
            ha="center", color=NAVY, fontsize=9, style="italic")

    fig.tight_layout()
    out = os.path.join(OUT_DIR, "07_trust_profile.png")
    fig.savefig(out, bbox_inches="tight", facecolor=WHITE)
    plt.close(fig)
    return out


def generate_all():
    paths = [
        diagram_system_overview(),
        diagram_grant_lifecycle(),
        diagram_ngo_compliance_journey(),
        diagram_passporting(),
        diagram_ai_integration_map(),
        diagram_two_grant_paths(),
        diagram_trust_profile(),
    ]
    return paths


if __name__ == "__main__":
    for p in generate_all():
        print("ok", p)

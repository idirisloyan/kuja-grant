/**
 * Phase 86 — Plain-language concept catalogue.
 *
 * Each entry is a 1-paragraph explainer for a domain concept that a
 * non-technical NGO might encounter in the UI without prior knowledge.
 *
 * Writing rules:
 *   - 2-4 sentences, conversational, second person
 *   - No jargon (no "MEAL," no "rubric," no "obligation")
 *   - Lead with what it IS, then why it matters TO THEM
 *   - Include a concrete example where useful
 *
 * Add new concepts here as the team identifies the next gap.
 */

export interface Concept {
  /** Display label as it should appear in the UI */
  label: string;
  /** 2-4 sentence plain-language definition */
  short: string;
  /** Optional concrete example */
  example?: string;
}

export const CONCEPTS = {
  // ---------------------------------------------------------------
  // Grant / application concepts
  // ---------------------------------------------------------------
  grant_window: {
    label: 'grant window',
    short: 'A grant window is the period during which a donor is actively accepting applications for one round of funding. Each window has its own deadline, budget pool, and rules. When a window closes, that round of funding is decided and you have to wait for the next window to open.',
    example: 'A donor might run a "Q1 2026 women-led NGO window" from January 15 to February 28 with a $2M total budget split across 20 grants.',
  },
  capacity_assessment: {
    label: 'capacity assessment',
    short: 'A capacity assessment is a one-time check of your organisation\'s ability to deliver and manage grant funding. It looks at governance, finance, programme delivery, and safeguarding. You complete it once, and every donor on the platform sees the same score — you do not have to redo it for each donor.',
    example: 'You answer 60-80 questions about how your Board makes decisions, how you handle money, and how you measure impact. Kuja scores you out of 100 and donors see the score on every application.',
  },
  due_diligence: {
    label: 'due diligence',
    short: 'Due diligence is the donor\'s check on whether you are a real, trustworthy organisation they can safely fund. It usually includes a registration verification, a sanctions check, and a quick look at your financials. Kuja runs most of this automatically — you just upload the documents once.',
    example: 'Verifying your NGO registration certificate is real, checking your name against international sanctions lists, and confirming you have audited financials.',
  },
  reporting_evidence: {
    label: 'reporting evidence',
    short: 'Reporting evidence is the proof that the work you described actually happened. Photos, attendance sheets, receipts, signed delivery notes, before-and-after pictures. Donors trust evidence more than narrative — every report with strong evidence scores 15-25 points higher than the same report without.',
    example: 'A photo of the attendance sheet from a training, a receipt for materials purchased, a before-and-after photo of a borehole.',
  },
  budget_line: {
    label: 'budget line',
    short: 'A budget line is one row in your grant budget: what is the cost, how much, for what purpose, in which category. Donors compare your budget lines against their funding caps and against what similar grants spend. Clear, specific budget lines score higher than vague ones.',
    example: '"Training materials for 50 women: $400" is a good budget line. "Misc programme costs: $5,000" is a bad one.',
  },

  // ---------------------------------------------------------------
  // NEAR / declaration concepts
  // ---------------------------------------------------------------
  declaration: {
    label: 'declaration',
    short: 'A declaration is a formal "this is a crisis, we are activating funds" signal from your network\'s oversight body. It commits a portion of the network\'s pooled fund to a specific crisis response. Multiple OB members must sign before money moves — this protects the network\'s integrity.',
    example: 'A drought hits Turkana County. The secretariat drafts a declaration. Three OB members review and sign. The committed funds are then released to shortlisted NGOs for response.',
  },
  ob_committee: {
    label: 'OB committee',
    short: 'The OB (Oversight Body) committee is the small group of trusted leaders who sign off on declarations and major decisions. Each declaration needs a minimum number of OB signatures before funds are released. This is how the network keeps fast-moving crisis response trustworthy.',
    example: 'A network might require 3 of 7 OB members to sign before a declaration moves to "active." For high-severity declarations, that might rise to 5 of 7.',
  },
  crisis_monitoring_report: {
    label: 'Crisis Monitoring Report',
    short: 'The Crisis Monitoring Report is your network\'s weekly evidence base. It tracks what crises are unfolding, how severe they are, and which ones the network is or should be watching. When an OB member creates a declaration, they usually pick a row from the latest report as the evidence basis.',
    example: 'A monthly report row: "Turkana County — drought — severity high — 280,000 affected — water sources at 12% capacity."',
  },
  severity: {
    label: 'severity',
    short: 'Severity is your assessment of how urgent and how big a crisis is. It drives how many OB members need to sign the declaration and how fast funds move. Use "critical" for life-threatening, "high" for serious disruption, "medium" for emerging concerns, "low" for early warning.',
    example: 'A flash flood killing dozens with thousands displaced = critical. A drought that may worsen if no rain in 30 days = medium.',
  },

  // ---------------------------------------------------------------
  // Compliance concepts
  // ---------------------------------------------------------------
  trust_profile: {
    label: 'Trust Profile',
    short: 'Your Trust Profile is the single record every donor on Kuja sees about your organisation. It bundles your registration, sanctions screening, capacity assessment, and uploaded policies. You fill it out once. Donors look at it on every application — you do not have to repeat yourself.',
    example: 'Your Trust Profile shows: registered in Kenya as NGO/2018/123, sanctions screen clear (last Mar 2026), capacity 82/100 on Kuja framework, child safeguarding policy uploaded, audited financials 2024 attached.',
  },
  compliance_score: {
    label: 'compliance score',
    short: 'Your compliance score is an AI-rated assessment of how well your report meets the donor\'s reporting requirements. It is out of 100. Above 80 is strong. Below 65 means key sections are missing or weak. The score is calculated per-requirement and you can see exactly which sections pulled you up or down.',
    example: 'A report scoring 82/100 might be 95 on activities, 90 on attendance evidence, but only 60 on financial breakdown — telling you where to strengthen for next time.',
  },
  sanctions_screening: {
    label: 'sanctions screening',
    short: 'Sanctions screening is an automatic check of your organisation name against international watch lists (UN, OFAC, EU). This is routine — almost every NGO comes back clear. If you do come back flagged, it is usually because of a name collision with a different organisation; Kuja support can clear that quickly.',
    example: 'Kuja runs the screening when you join and again every 6 months. Clear screenings let donors fund you faster.',
  },
} satisfies Record<string, Concept>;

export type ConceptKey = keyof typeof CONCEPTS;

/**
 * Phase 85 — Plain-language explainers for the most common compliance flags.
 *
 * Each entry is the { what, why, example, how_to_resolve } block the
 * ComplianceFlag component renders when the NGO clicks "What is this
 * and how do I fix it?"
 *
 * Backend code or hard-coded UI surfaces a string key here; the UI looks
 * up the explainer and renders consistent copy across the whole app.
 *
 * Add new keys here as the team identifies the next gap to translate.
 * Each block should be:
 *   - written for someone whose first language isn't English
 *   - free of jargon (no "MEAL," no "FCDO," no "Section IV(c)")
 *   - concrete in the example
 *   - actionable in the resolution
 */

import type { ComplianceExplain, ComplianceTone } from '@/components/shared/compliance-flag';

export interface ExplainerEntry {
  headline: string;
  tone: ComplianceTone;
  explain: ComplianceExplain;
}

export const COMPLIANCE_EXPLAINERS: Record<string, ExplainerEntry> = {
  // -------------------------------------------------------------------
  // Trust Profile gaps
  // -------------------------------------------------------------------
  registration_missing: {
    headline: 'Government registration certificate missing',
    tone: 'bad',
    explain: {
      what: 'A scan or photo of your government-issued NGO / CBO / trust / foundation registration certificate.',
      why: 'Donors must verify you are a real, legally-registered organisation before they can send you money. Most donors will not even score your application without this.',
      example: 'A PDF or photo of the certificate from your country\'s NGO Board / Registrar of Societies / equivalent. The certificate name should match your organisation name in Kuja.',
      how: 'Open your Trust Profile → "Registration" → "Upload certificate". A phone photo is fine if it is sharp and the seal is visible. If your certificate has expired, upload the renewal letter alongside.',
      who_can_help: 'Your Board secretary or finance officer usually has the certificate on file. If you cannot find it, your country\'s NGO Board can issue a certified duplicate (usually 5-10 business days, small fee). The Kuja help chat can talk you through the upload itself if the photo step gives you trouble.',
    },
  },
  registration_expired: {
    headline: 'Your government registration has expired',
    tone: 'bad',
    explain: {
      what: 'Most countries require NGOs to renew their registration every 1-3 years. Yours is past its expiry date.',
      why: 'Donors cannot send funds to an organisation whose legal registration is not current. Your applications may be paused until this is updated.',
      example: 'Upload the renewal certificate from your country\'s NGO Board, or an official "renewal in progress" letter from them.',
      how: 'Apply for renewal with your country\'s NGO Board (usually a one-page form + small fee). When you have the new certificate or the receipt, upload it under Trust Profile → Registration.',
      who_can_help: 'Your country\'s NGO Board (or Registrar of Societies / similar body) handles the renewal. Most have walk-in service desks or a one-page online form. The Kuja help chat can confirm what your specific country accepts as a "renewal in progress" letter.',
    },
  },
  audited_financials_missing: {
    headline: 'Audited financials missing',
    tone: 'warn',
    explain: {
      what: 'An external auditor\'s report on your most recent financial year (income, expenses, balance sheet, auditor opinion).',
      why: 'Donors use audited financials to confirm you can handle the size of grant you are applying for. Most donors require audits for any grant above ~$50,000.',
      example: 'A PDF from an external auditor (NOT prepared internally) containing: balance sheet, income statement, cash flow, auditor opinion letter, dated within the last 18 months.',
      how: 'If you have an auditor, request the latest signed report and upload under Trust Profile → Financials. If you do not have an auditor yet, that is a separate work item — most local accounting firms can audit a small NGO for $400-1,200.',
      who_can_help: 'Your existing auditor (request the signed PDF directly). If you don\'t have an auditor, ask peer NGOs in your network which firm they use — most local accounting practices in major Global South cities have an NGO-audit service line. The Kuja help chat can also suggest auditors who work with platform NGOs.',
    },
  },
  child_safeguarding_missing: {
    headline: 'Child safeguarding policy not uploaded',
    tone: 'warn',
    explain: {
      what: 'A written policy explaining how your organisation keeps children safe in your work, who is accountable, and how you respond to concerns.',
      why: 'Any donor funding work with children, schools, or families requires this. Some donors block all applications without one. It also protects the children you serve.',
      example: 'A 2-4 page document covering: scope (who the policy protects), code of conduct (what staff can and can\'t do), reporting (how someone raises a concern), response (who acts and when), training (how staff are trained). Signed by the Board.',
      how: 'Search "Keeping Children Safe coalition template" online for a free template you can adapt. Have your Board sign it. Upload under Trust Profile → Policies.',
      who_can_help: 'The Keeping Children Safe coalition (keepingchildrensafe.global) publishes free template policies for download. Your Board Chair or Executive Director should review and sign. Save the Children, Plan International, and UNICEF country offices also share template policies with smaller NGOs they partner with.',
    },
  },
  sanctions_screening_old: {
    headline: 'Sanctions screening is older than 6 months',
    tone: 'info',
    explain: {
      what: 'A check against international sanctions lists (UN, OFAC, EU) for your organisation and key leadership.',
      why: 'Donors must screen partners before disbursing. Kuja does this automatically — but if it is older than 6 months the donor may want a fresh check before disbursing your next grant.',
      example: 'A current clear screening from Kuja\'s screening service. Most NGOs come back clear; this is a routine check, not a flag of suspicion.',
      how: 'Click the "Refresh screening" button on Trust Profile → Compliance. Takes 5 seconds and is automatic. No action from you beyond clicking.',
      who_can_help: 'No outside help needed — this runs automatically. If the screening flags something you don\'t recognise (most often a name collision with an unrelated org), open the Kuja help chat and Kuja support can clear it within one business day.',
    },
  },

  // -------------------------------------------------------------------
  // Report pre-check findings
  // -------------------------------------------------------------------
  report_thin_evidence: {
    headline: 'A section is thin on evidence',
    tone: 'warn',
    explain: {
      what: 'Reviewers want concrete evidence (numbers, dates, names, photos, receipts) for every reported activity — not just a description.',
      why: 'Vague reports without evidence make donors nervous about whether the work actually happened the way you describe. Reports with concrete evidence score 15-25 points higher on donor scorecards.',
      example: '"We held a 3-day training for 47 women in Garissa County on 12-14 March 2026. Attendance sheet attached as evidence. Two attendees dropped out on day 2 because of family obligations."',
      how: 'Use the "Add photo evidence" button to attach an attendance sheet, receipt, or photo of the activity. The AI will pull the numbers and dates out of the image and add them to your report.',
      who_can_help: 'Your field officers usually have the source documents (attendance sheets, photos, receipts) on their phones. Ask them to send via WhatsApp; you can then upload directly. The Kuja help chat can walk you through the photo-upload step if it is your first time.',
    },
  },
  report_missing_section: {
    headline: 'A required section is empty',
    tone: 'bad',
    explain: {
      what: 'The donor\'s reporting framework requires this section to be filled, even if briefly. Most donors auto-reject reports with empty required sections.',
      why: 'Donors use these sections to track standardised outcomes across all their partners. An empty section breaks their roll-up reporting and signals "this NGO didn\'t read our requirements."',
      example: 'For "Risks identified this period": "Two community meetings were postponed because of heavy rain. We rescheduled them for the following week and informed beneficiaries via WhatsApp."',
      how: 'Use the "Voice draft" button and just talk about that period. The AI will fill in every section the donor requires. Then review and edit each section before submitting.',
      who_can_help: 'Your field officer or project manager will know what happened. A 5-minute phone call with them is usually enough context to draft the section. The Kuja AI Voice Draft button can also turn your spoken summary into a structured first draft.',
    },
  },

  // -------------------------------------------------------------------
  // Application eligibility / hard gates
  // -------------------------------------------------------------------
  budget_over_cap: {
    headline: 'Your budget exceeds the donor\'s per-grant cap',
    tone: 'bad',
    explain: {
      what: 'This donor sets a maximum grant size. Your budget is above it.',
      why: 'Donors hard-cap grant sizes for governance and risk reasons. Your application will be rejected automatically if the budget is over.',
      example: 'If the donor cap is $100,000 and your budget is $115,000, you need to either reduce activities, find co-funding for the difference, or apply to a different donor whose cap fits.',
      how: 'Open the Budget section and reduce line items until the total fits under the cap. The most common reduction is operational overhead (admin / office rent / vehicles) — try cutting there first.',
      who_can_help: 'Your finance officer is best placed to reduce a budget without breaking the work. If the cap really cannot work for your project, the Kuja AI Co-pilot can suggest similar grants with higher caps you may be a fit for.',
    },
  },
  operations_over_30: {
    headline: 'Operations & admin is over 30% of your budget',
    tone: 'warn',
    explain: {
      what: 'Most donors prefer that at most 25-30% of a grant goes to operations and admin (offices, vehicles, staff overhead). The rest should be direct programme activities.',
      why: 'Donors want most of the money reaching beneficiaries, not paying overheads. A high operations percentage suggests you might be a "consulting shop" rather than a delivery NGO.',
      example: 'For a $100K grant: aim for at most $30K combined across rent, vehicles, admin staff, equipment depreciation. The remaining $70K+ should be activities, beneficiary support, trainers, materials.',
      how: 'Open the Budget section. Move costs from "Operations" to "Activities" where defensibly true (e.g. a project officer\'s time IS an activity cost if they are running the activity). Reclassify line by line.',
      who_can_help: 'Your finance officer can reclassify line items. The Kuja AI Co-pilot can review your current budget and suggest which lines are commonly reclassified by approved NGOs.',
    },
  },
  prior_year_reporting_late: {
    headline: 'Your last grant report was late',
    tone: 'warn',
    explain: {
      what: 'A previous grant report was submitted past its due date. Some donors check reporting timeliness before scoring new applications.',
      why: 'Donors view late reporting as a signal you may be hard to work with. Even one late report can drop your score 5-10 points on a new application.',
      example: 'If your last report was 4 days late, write a short cover note in this application acknowledging it and what you changed (e.g. "We have set internal deadlines 7 days before donor deadlines since.").',
      how: 'Use the "Why this score" panel after submitting to see exactly how much this affected you. For future reports, turn on early deadline reminders in Settings → Notifications.',
      who_can_help: 'You — by acknowledging it briefly and explaining what changed. Donors respect honesty here. The Kuja Co-pilot can help you draft the acknowledgement sentence.',
    },
  },
};

/** Look up an explainer by string key. Returns null if not registered. */
export function getComplianceExplainer(key: string): ExplainerEntry | null {
  return COMPLIANCE_EXPLAINERS[key] ?? null;
}

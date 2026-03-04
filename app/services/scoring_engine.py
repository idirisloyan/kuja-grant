"""
Kuja Grant Management System - Scoring Engine
===============================================
Extracted from server.py section 7 (lines ~1898-2111)
and the _calculate_assessment_scores function (~lines 3711-3796).
Scores grant applications and organizational capacity assessments.
"""

import re
import logging

from app.extensions import db
from app.utils.helpers import _json_load

logger = logging.getLogger('kuja')


class ScoringEngine:
    """
    Scores grant applications based on:
    - Response quality per criterion (word count, keywords, completeness)
    - Document scores from AI analysis
    - Eligibility compliance
    - Weighted overall score
    """

    @staticmethod
    def score_application(application):
        """
        Score a full application and return detailed breakdown.

        Returns:
            dict with keys: criterion_scores, document_score, eligibility_score,
                            overall_score, breakdown
        """
        # Lazy import to avoid circular dependency
        from app.models.document import Document

        grant = application.grant
        if not grant:
            return {'error': 'Grant not found', 'overall_score': 0}

        criteria = grant.get_criteria() or []
        responses = application.get_responses() or {}
        eligibility_defs = grant.get_eligibility() or []
        eligibility_responses = application.get_eligibility_responses() or {}

        # --- Score each criterion ---
        criterion_scores = {}
        total_weight = 0
        weighted_sum = 0

        for idx, criterion in enumerate(criteria):
            # Support both id-based keys and index-based keys (criterion_0, criterion_1, etc.)
            cid = str(criterion.get('id', ''))
            index_key = f'criterion_{idx}'
            label = criterion.get('label', '')
            desc = criterion.get('desc', '')
            weight = criterion.get('weight', 1)
            max_words = criterion.get('maxWords', 500)
            response_text = responses.get(cid, '') if cid else ''
            if not response_text:
                response_text = responses.get(index_key, '')

            if not isinstance(response_text, str):
                response_text = str(response_text) if response_text else ''

            cscore = ScoringEngine._score_criterion_response(
                response_text, label, desc, weight, max_words
            )
            criterion_scores[cid] = cscore
            total_weight += weight
            weighted_sum += cscore['score'] * weight

        criteria_avg = (weighted_sum / total_weight) if total_weight > 0 else 0

        # --- Score documents ---
        documents = Document.query.filter_by(application_id=application.id).all()
        doc_scores = []
        for doc in documents:
            dscore = doc.score if doc.score is not None else 0
            doc_scores.append({'id': doc.id, 'filename': doc.original_filename, 'score': dscore})
        doc_avg = (sum(d['score'] for d in doc_scores) / len(doc_scores)) if doc_scores else 0

        # --- Score eligibility ---
        eligibility_score = ScoringEngine._score_eligibility(eligibility_defs, eligibility_responses)

        # --- Calculate overall ---
        # Weights: criteria 60%, documents 20%, eligibility 20%
        overall = (criteria_avg * 0.60) + (doc_avg * 0.20) + (eligibility_score * 0.20)
        overall = round(overall, 2)

        return {
            'criterion_scores': criterion_scores,
            'criteria_average': round(criteria_avg, 2),
            'document_scores': doc_scores,
            'document_average': round(doc_avg, 2),
            'eligibility_score': round(eligibility_score, 2),
            'overall_score': overall,
            'breakdown': {
                'criteria_weight': 0.60,
                'documents_weight': 0.20,
                'eligibility_weight': 0.20,
            },
        }

    @staticmethod
    def _score_criterion_response(text, label, desc, weight, max_words):
        """Score a single criterion response."""
        if not text or not text.strip():
            return {
                'score': 0,
                'word_count': 0,
                'feedback': 'No response provided',
                'sub_scores': {'completeness': 0, 'relevance': 0, 'depth': 0},
            }

        words = text.split()
        word_count = len(words)

        # Sub-score: Completeness (based on word count vs max)
        if max_words and max_words > 0:
            fill_ratio = min(word_count / max_words, 1.2)
            if fill_ratio >= 0.7:
                completeness = 90 + min(fill_ratio - 0.7, 0.3) * 33
            elif fill_ratio >= 0.4:
                completeness = 50 + (fill_ratio - 0.4) * 133
            else:
                completeness = fill_ratio * 125
        else:
            completeness = min(word_count / 3, 100)  # ~300 words for 100
        completeness = min(completeness, 100)

        # Sub-score: Relevance (keyword matching)
        combined = (label + ' ' + desc).lower()
        keywords = set(re.findall(r'\b[a-z]{4,}\b', combined))
        # Remove very common words
        stopwords = {'this', 'that', 'with', 'from', 'your', 'have', 'will', 'been',
                      'what', 'when', 'where', 'which', 'their', 'there', 'these',
                      'those', 'about', 'would', 'could', 'should', 'does', 'into',
                      'than', 'then', 'them', 'some', 'more', 'also', 'each', 'such'}
        keywords -= stopwords
        text_lower = text.lower()
        if keywords:
            matches = sum(1 for kw in keywords if kw in text_lower)
            relevance = min((matches / len(keywords)) * 120, 100)
        else:
            relevance = 50  # neutral

        # Sub-score: Depth (structure, evidence, analysis)
        depth = 30  # base
        # Structural indicators
        if re.search(r'(\d+\.|\-\s|\*\s|•)', text):
            depth += 10  # uses lists/numbering
        if len(text.split('\n')) > 2:
            depth += 5   # multiple paragraphs
        # Evidence indicators
        evidence_words = ['data', 'evidence', 'study', 'survey', 'report', 'percent',
                          'increase', 'decrease', 'result', 'outcome', 'impact', 'baseline',
                          'target', 'indicator', 'beneficiar', 'household', 'community']
        evidence_count = sum(1 for w in evidence_words if w in text_lower)
        depth += min(evidence_count * 5, 30)
        # Analytical words
        analysis_words = ['because', 'therefore', 'however', 'furthermore', 'consequently',
                          'specifically', 'strategy', 'approach', 'framework', 'methodology']
        analysis_count = sum(1 for w in analysis_words if w in text_lower)
        depth += min(analysis_count * 5, 20)
        depth = min(depth, 100)

        # Composite score
        score = (completeness * 0.35) + (relevance * 0.35) + (depth * 0.30)
        score = round(min(score, 100), 1)

        # Feedback generation
        feedback_parts = []
        if completeness < 50:
            feedback_parts.append(f'Response is too brief ({word_count} words). Aim for at least {int(max_words * 0.6)} words.')
        if relevance < 40:
            feedback_parts.append('Response does not sufficiently address the criterion topic. Include more relevant keywords and concepts.')
        if depth < 40:
            feedback_parts.append('Add more evidence, data points, and analytical depth.')
        if score >= 75:
            feedback_parts.append('Strong response overall.')
        elif score >= 50:
            feedback_parts.append('Adequate response with room for improvement.')

        return {
            'score': score,
            'word_count': word_count,
            'max_words': max_words,
            'feedback': ' '.join(feedback_parts) if feedback_parts else 'Response meets basic requirements.',
            'sub_scores': {
                'completeness': round(completeness, 1),
                'relevance': round(relevance, 1),
                'depth': round(depth, 1),
            },
        }

    @staticmethod
    def _score_eligibility(eligibility_defs, eligibility_responses):
        """
        Score eligibility compliance.
        Required items are pass/fail (0 or 100), optional items are weighted.
        """
        if not eligibility_defs:
            return 100  # No requirements means automatically eligible

        total_items = 0
        passed_items = 0
        required_passed = True

        for elig in eligibility_defs:
            eid = str(elig.get('id', ''))
            required = elig.get('required', True)
            response = eligibility_responses.get(eid)

            # Normalize response to boolean
            if isinstance(response, str):
                is_met = response.lower() in ('true', 'yes', '1', 'met')
            elif isinstance(response, bool):
                is_met = response
            else:
                is_met = bool(response)

            total_items += 1
            if is_met:
                passed_items += 1
            elif required:
                required_passed = False

        if not required_passed:
            return 0  # Failing a required item disqualifies

        return round((passed_items / total_items) * 100, 1) if total_items > 0 else 100


# ---------------------------------------------------------------------------
# Standalone helper used by the assessments route
# ---------------------------------------------------------------------------

def _calculate_assessment_scores(checklist, framework='kuja'):
    """
    Calculate assessment category scores, overall score, and identify gaps.
    Supports multiple assessment frameworks.
    """
    FRAMEWORK_CATEGORIES = {
        'kuja': {
            'governance': { 'weight': 0.20, 'items': ['board_exists', 'board_meets_regularly', 'strategic_plan', 'policies_documented', 'conflict_of_interest_policy'] },
            'financial_management': { 'weight': 0.25, 'items': ['financial_policies', 'annual_audit', 'budget_process', 'internal_controls', 'financial_reporting', 'procurement_policy'] },
            'program_management': { 'weight': 0.20, 'items': ['needs_assessment', 'project_planning', 'beneficiary_feedback', 'partnership_agreements', 'reporting_systems'] },
            'human_resources': { 'weight': 0.15, 'items': ['hr_policies', 'staff_contracts', 'safeguarding_policy', 'training_plan', 'code_of_conduct'] },
            'monitoring_evaluation': { 'weight': 0.20, 'items': ['me_framework', 'data_collection', 'indicator_tracking', 'evaluation_reports', 'learning_integration'] },
        },
        'step': {
            'organizational_governance': { 'weight': 0.20, 'items': ['legal_registration', 'governing_body', 'strategic_direction', 'succession_planning', 'stakeholder_engagement'] },
            'financial_systems': { 'weight': 0.25, 'items': ['accounting_system', 'financial_controls', 'audit_practice', 'asset_management', 'donor_compliance', 'cash_management'] },
            'administration': { 'weight': 0.15, 'items': ['admin_procedures', 'record_keeping', 'it_systems', 'office_management', 'procurement_systems'] },
            'human_resource_management': { 'weight': 0.20, 'items': ['recruitment_process', 'staff_development', 'performance_management', 'compensation_policy', 'safeguarding_psea'] },
            'program_quality': { 'weight': 0.20, 'items': ['program_design', 'implementation_quality', 'monitoring_systems', 'reporting_quality', 'sustainability_planning'] },
        },
        'un_hact': {
            'implementing_partner_info': { 'weight': 0.10, 'items': ['legal_status', 'governance_structure', 'mandate_alignment'] },
            'internal_control': { 'weight': 0.25, 'items': ['control_environment', 'risk_assessment', 'control_activities', 'info_communication', 'monitoring_controls'] },
            'accounting_policies': { 'weight': 0.25, 'items': ['accounting_standards', 'fund_accounting', 'reporting_procedures', 'cash_management_hact', 'asset_management_hact'] },
            'fixed_assets': { 'weight': 0.15, 'items': ['asset_register', 'asset_safeguarding', 'asset_disposal', 'asset_verification'] },
            'procurement': { 'weight': 0.25, 'items': ['procurement_policy', 'competitive_bidding', 'procurement_documentation', 'contract_management', 'supplier_management'] },
        },
        'chs': {
            'humanitarian_response': { 'weight': 0.15, 'items': ['needs_based_response', 'timeliness', 'appropriate_response', 'reaching_most_vulnerable'] },
            'effectiveness': { 'weight': 0.15, 'items': ['effective_programs', 'evidence_based', 'adaptive_management', 'innovation_learning'] },
            'accountability': { 'weight': 0.20, 'items': ['community_participation', 'feedback_mechanisms', 'complaint_handling', 'transparency_info'] },
            'coordination': { 'weight': 0.10, 'items': ['coordination_participation', 'complementarity', 'information_sharing'] },
            'staff_competency': { 'weight': 0.15, 'items': ['skilled_staff', 'wellbeing_support', 'code_of_conduct_chs', 'psea_policy'] },
            'management_support': { 'weight': 0.15, 'items': ['policies_processes', 'resource_management', 'environmental_impact', 'quality_management'] },
            'learning': { 'weight': 0.10, 'items': ['organizational_learning', 'evaluation_practice', 'knowledge_sharing', 'continuous_improvement'] },
        },
        'nupas': {
            'governance_leadership': { 'weight': 0.20, 'items': ['legal_framework', 'board_effectiveness', 'leadership_quality', 'accountability_systems', 'risk_management'] },
            'financial_stewardship': { 'weight': 0.25, 'items': ['financial_systems', 'budgeting', 'financial_reporting_nupas', 'audit_compliance', 'resource_mobilization', 'value_for_money'] },
            'program_delivery': { 'weight': 0.25, 'items': ['design_quality', 'delivery_effectiveness', 'beneficiary_engagement', 'partnership_management', 'innovation_scaling'] },
            'people_culture': { 'weight': 0.15, 'items': ['hr_systems', 'staff_development_nupas', 'diversity_inclusion', 'safeguarding_nupas', 'organizational_culture'] },
            'learning_adaptation': { 'weight': 0.15, 'items': ['me_systems', 'data_use', 'knowledge_management', 'adaptive_programming', 'impact_measurement'] },
        },
    }

    categories = FRAMEWORK_CATEGORIES.get(framework, FRAMEWORK_CATEGORIES['kuja'])

    category_scores = {}
    gaps = []
    weighted_total = 0

    for cat_name, cat_info in categories.items():
        items = cat_info['items']
        met = 0
        total = len(items)
        for item in items:
            response = checklist.get(item)
            if isinstance(response, str):
                is_met = response.lower() in ('true', 'yes', '1', 'met', 'complete')
            elif isinstance(response, bool):
                is_met = response
            elif isinstance(response, (int, float)):
                is_met = response > 0
            else:
                is_met = False
            if is_met:
                met += 1
            else:
                gaps.append({
                    'category': cat_name,
                    'item': item,
                    'label': item.replace('_', ' ').title(),
                    'priority': 'high' if cat_info['weight'] >= 0.20 else 'medium',
                })

        cat_score = round((met / total) * 100, 1) if total > 0 else 0
        category_scores[cat_name] = {
            'score': cat_score,
            'met': met,
            'total': total,
            'weight': cat_info['weight'],
        }
        weighted_total += cat_score * cat_info['weight']

    overall = round(weighted_total, 1)
    return category_scores, overall, gaps

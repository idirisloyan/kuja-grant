"""
Shared constants — controlled vocabularies + enum lookups used across
multiple services/routes. Centralizing here keeps DB enum values stable
while allowing display strings to be localised at render time.
"""

# Phase 14 — Win/loss debrief controlled vocab (PMO transfer pattern).
# Stable English machine codes; frontend translates to localized labels.
#
# These cover both directions (award / rejected). The same vocab works
# for both because the value of an "award" reason and a "decline" reason
# is the same insight — the donor recorded WHY.
WIN_LOSS_REASONS: list[dict] = [
    # Award-leaning
    {'code': 'strong_alignment',
     'label': 'Strong fit with our strategy',
     'tone': 'win'},
    {'code': 'strong_track_record',
     'label': 'Strong track record / past delivery',
     'tone': 'win'},
    {'code': 'innovative_approach',
     'label': 'Innovative or differentiated approach',
     'tone': 'win'},
    {'code': 'high_value_for_money',
     'label': 'High value for money',
     'tone': 'win'},
    {'code': 'clear_me_plan',
     'label': 'Clear monitoring & evaluation plan',
     'tone': 'win'},

    # Loss-leaning
    {'code': 'misaligned_strategy',
     'label': 'Not aligned with strategy',
     'tone': 'loss'},
    {'code': 'eligibility_gap',
     'label': 'Eligibility gap',
     'tone': 'loss'},
    {'code': 'budget_over_scope',
     'label': 'Budget over scope',
     'tone': 'loss'},
    {'code': 'weak_me',
     'label': 'Weak monitoring & evaluation plan',
     'tone': 'loss'},
    {'code': 'insufficient_track_record',
     'label': 'Insufficient track record / capacity concerns',
     'tone': 'loss'},
    {'code': 'risk_flags',
     'label': 'Risk flags (compliance / governance)',
     'tone': 'loss'},
    {'code': 'limited_funds',
     'label': 'Limited funds available',
     'tone': 'loss'},
    {'code': 'unclear_outcomes',
     'label': 'Outcomes / targets unclear',
     'tone': 'loss'},

    # Both
    {'code': 'other',
     'label': 'Other (see notes)',
     'tone': 'both'},
]

WIN_LOSS_CODES: set[str] = {r['code'] for r in WIN_LOSS_REASONS}

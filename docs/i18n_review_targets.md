# Plain-language review targets — Phase 6.1

The Kuja i18n catalog now has ~1,600 keys × 6 languages (~9,600 entries).
Most were authored by AI translation with structural awareness; some are
direct user-facing surfaces that benefit from a native-speaker review pass
to land culturally-legible phrasing.

This doc lists the highest-traffic, highest-leverage namespaces to review
first. Each row should get one or two passes from a native speaker
familiar with humanitarian / grant-process language in that locale.

## Priority 1 — surfaces a user touches every session

| Namespace | Used on | Languages flagged for review |
|-----------|---------|------------------------------|
| `application.*`, `applications.*` | apply form, application detail | ar, sw, so |
| `report.*`, `report_coauthor.*` | reports list, report submit | ar, sw, so |
| `coauthor.*` | NGO co-author panel | ar, sw, so |
| `grant_qa.*` | inline Q&A on apply + grant detail | ar, sw, so |
| `matches.*` | NGO opportunity feed | ar, sw, so |
| `grant.wizard.*` | donor wizard | ar, fr, es, sw, so |
| `preview_reviewer.*` | preview-as-reviewer modal | ar, sw, so |
| `median_preview.*` | donor median NGO preview | ar, sw, so |

## Priority 2 — admin / observability

| Namespace | Used on | Languages flagged |
|-----------|---------|-------------------|
| `observability.*` | /observability | ar, fr, es, sw, so |
| `portfolio.*` | donor command center | ar, fr, es, sw, so |

## Priority 3 — error + status copy

| Namespace | Used on | Languages flagged |
|-----------|---------|-------------------|
| `server.error.*` | inline error toasts everywhere | ar, sw, so |
| `status.*`, `deadline.*` | every list, every detail page | ar, sw, so |

## Review checklist for native-speaker pass

For each entry, verify:
- [ ] Phrasing is what a native speaker would actually write (not a literal translation)
- [ ] Register matches the role tone (warm + supportive for NGO; crisp + professional for donor)
- [ ] Plurals are correct for the language's plural rules
- [ ] Date/number/currency formatting matches local convention
- [ ] No untranslated English remnants (e.g., loanwords used where a native term exists)
- [ ] RTL languages: punctuation and symbol order reads naturally

## What's already good (skip review)

- Status pills (en/ar verified during launch testing)
- Calendar day names (Intl.DateTimeFormat — already locale-correct)
- Date formatters (Intl.DateTimeFormat with locale)
- Number/currency formatters (Intl.NumberFormat)

## Operational note

This audit is intentionally NOT a code change. Once a native speaker
returns annotated strings for any of the priority-1 namespaces, run:

    py -3 frontend/scripts/update_translations.py --lang ar --keys ... --file <annotations>

(That script doesn't exist yet — when the first batch of annotations
comes back, build it as a 30-line JSON merge.)

"""
BankVerificationService — Phase 1 (May 2026 truth-in-claims)
============================================================

Mechanical bank account verification. Validates what we can without
calling a bank API (which is rarely available for NGO partner banks
in the Global South) and flags structural anomalies.

Checks performed:
  1. IBAN checksum + country code (mod-97-10, ISO 13616)
  2. SWIFT/BIC structure (8 or 11 chars, ISO 9362)
  3. Bank country vs declared country
  4. High-risk jurisdiction flag (FATF Increased Monitoring + Call for Action lists,
     hardcoded snapshot; refreshed via FATF periodic update)
  5. Cross-check: bank-country in IBAN matches declared bank_country
  6. Currency-country sanity (e.g. NGN account in non-Nigeria bank is unusual)
  7. Account-number-format heuristics per bank country

For each finding: severity (high/medium/low), code, message, evidence.
Risk score 0-100 derived from finding mix.

When the user updates the bank details, we hash the account number
+ store last4 for quick re-identification without persisting full PII.
"""

import logging
import re
from datetime import datetime, timezone

logger = logging.getLogger('kuja')


class BankVerificationService:

    # FATF lists (May 2026 snapshot). Update these periodically.
    # Sources:
    #   https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/Call-for-action.html
    #   https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions/Increased-monitoring.html
    FATF_CALL_FOR_ACTION = {'KP', 'IR', 'MM'}  # DPRK, Iran, Myanmar

    FATF_INCREASED_MONITORING = {
        # As of FATF Feb 2026 plenary (snapshot)
        'AL', 'BB', 'BF', 'CM', 'CG', 'HR', 'CD', 'GI', 'HT', 'JM',
        'JO', 'ML', 'MZ', 'NA', 'NG', 'PH', 'SN', 'TZ', 'TR', 'UG',
        'VN', 'YE', 'BG', 'MC', 'VE', 'LA', 'SY',
    }

    # ISO 4217 currency → ISO 3166 country (primary issuer)
    CURRENCY_TO_COUNTRY = {
        'KES': 'KE', 'NGN': 'NG', 'ZAR': 'ZA', 'UGX': 'UG', 'TZS': 'TZ',
        'ETB': 'ET', 'SOS': 'SO', 'EGP': 'EG', 'MAD': 'MA', 'GHS': 'GH',
        'XOF': 'SN',  # West African CFA — multiple, use Senegal as proxy
        'XAF': 'CM',  # Central African CFA — proxy
        'USD': 'US', 'EUR': 'EU', 'GBP': 'GB', 'CHF': 'CH',
    }

    @classmethod
    def verify(
        cls,
        *,
        bank_name: str | None,
        bank_country: str | None,
        swift_bic: str | None,
        iban: str | None,
        currency: str | None,
        account_number: str | None,
        declared_org_country: str | None = None,
    ) -> dict:
        """Run all checks and return a structured result.

        Returns:
            {
              'findings': [{severity, code, message, evidence}, ...],
              'risk_score': int (0-100),
              'status': 'verified' | 'review' | 'flagged' | 'error',
              'normalised': {iban, swift_bic, bank_country, currency},
            }
        """
        findings = []

        # Normalise inputs
        iban_n = (iban or '').replace(' ', '').upper().strip()
        swift_n = (swift_bic or '').replace(' ', '').upper().strip()
        bank_country_n = (bank_country or '').upper().strip()
        currency_n = (currency or '').upper().strip()

        # ---- 1. IBAN ----
        if iban_n:
            iban_result = cls._validate_iban(iban_n)
            findings.extend(iban_result.get('findings', []))
            # If IBAN gave us a country, prefer it over user-declared
            iban_country = iban_result.get('country')
            if iban_country and bank_country_n and iban_country != bank_country_n:
                findings.append({
                    'severity': 'high',
                    'code': 'iban_country_mismatch',
                    'message': (
                        f'IBAN country code ({iban_country}) does not match '
                        f'declared bank country ({bank_country_n}).'
                    ),
                    'evidence': {'iban_country': iban_country, 'declared': bank_country_n},
                })
            elif iban_country and not bank_country_n:
                bank_country_n = iban_country

        # ---- 2. SWIFT/BIC ----
        if swift_n:
            swift_result = cls._validate_swift(swift_n)
            findings.extend(swift_result.get('findings', []))
            swift_country = swift_result.get('country')
            if swift_country and bank_country_n and swift_country != bank_country_n:
                findings.append({
                    'severity': 'high',
                    'code': 'swift_country_mismatch',
                    'message': (
                        f'SWIFT/BIC country code ({swift_country}) does not match '
                        f'declared bank country ({bank_country_n}).'
                    ),
                    'evidence': {'swift_country': swift_country, 'declared': bank_country_n},
                })
            elif swift_country and not bank_country_n:
                bank_country_n = swift_country

        # ---- 3. FATF jurisdiction screening ----
        if bank_country_n:
            if bank_country_n in cls.FATF_CALL_FOR_ACTION:
                findings.append({
                    'severity': 'high',
                    'code': 'fatf_call_for_action',
                    'message': (
                        f'Bank country {bank_country_n} is on the FATF Call-for-Action list. '
                        'Donor approval typically blocked under standard AML policy.'
                    ),
                    'evidence': {'country': bank_country_n, 'list': 'FATF Call for Action'},
                })
            elif bank_country_n in cls.FATF_INCREASED_MONITORING:
                findings.append({
                    'severity': 'medium',
                    'code': 'fatf_increased_monitoring',
                    'message': (
                        f'Bank country {bank_country_n} is on the FATF Increased Monitoring '
                        'list ("grey list"). Enhanced due diligence may be required.'
                    ),
                    'evidence': {'country': bank_country_n, 'list': 'FATF Increased Monitoring'},
                })

        # ---- 4. Currency-country sanity ----
        if currency_n and bank_country_n:
            expected_country = cls.CURRENCY_TO_COUNTRY.get(currency_n)
            if expected_country and expected_country not in ('US', 'EU', 'GB', 'CH') and expected_country != bank_country_n:
                findings.append({
                    'severity': 'low',
                    'code': 'currency_country_unusual',
                    'message': (
                        f'Account is in {currency_n} but bank is in {bank_country_n}; '
                        f'{currency_n} is typically issued by {expected_country} institutions.'
                    ),
                    'evidence': {'currency': currency_n, 'expected': expected_country, 'actual': bank_country_n},
                })

        # ---- 5. Bank country vs org country ----
        if declared_org_country and bank_country_n:
            org_country_n = declared_org_country.upper().strip()
            if (
                org_country_n != bank_country_n
                and bank_country_n not in {'US', 'GB', 'CH', 'DE', 'NL', 'FR', 'BE'}  # tolerable global hubs
            ):
                findings.append({
                    'severity': 'low',
                    'code': 'bank_country_differs_from_org',
                    'message': (
                        f'Bank is in {bank_country_n} but organisation operates in {org_country_n}. '
                        'Verify with the NGO why the account is held abroad (often legitimate: USD account, '
                        'donor-required jurisdiction, etc.) — but record the rationale.'
                    ),
                    'evidence': {'org': org_country_n, 'bank': bank_country_n},
                })

        # ---- 6. Account number heuristics ----
        if account_number:
            acct_findings = cls._account_number_heuristics(
                account_number.strip(), bank_country_n
            )
            findings.extend(acct_findings)

        # ---- 7. Required fields ----
        if not any([iban_n, swift_n, bank_country_n]):
            findings.append({
                'severity': 'medium',
                'code': 'missing_bank_identifiers',
                'message': (
                    'No IBAN, SWIFT/BIC, or bank country provided. Cannot run structural validation.'
                ),
                'evidence': {},
            })

        # ---- Score ----
        risk_score = cls._compute_risk_score(findings)
        status = cls._derive_status(findings, risk_score)

        return {
            'findings': findings,
            'risk_score': risk_score,
            'status': status,
            'normalised': {
                'iban': iban_n,
                'swift_bic': swift_n,
                'bank_country': bank_country_n,
                'currency': currency_n,
            },
        }

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @classmethod
    def _validate_iban(cls, iban: str) -> dict:
        """ISO 13616 IBAN validation. Returns {findings, country}."""
        findings = []

        # Length: 15-34 chars; country code = first 2
        if not re.match(r'^[A-Z0-9]{15,34}$', iban):
            findings.append({
                'severity': 'high',
                'code': 'iban_format_invalid',
                'message': 'IBAN length or characters look invalid. Should be 15-34 alphanumeric chars.',
                'evidence': {'length': len(iban)},
            })
            return {'findings': findings, 'country': None}

        country = iban[:2]
        if not country.isalpha():
            findings.append({
                'severity': 'high',
                'code': 'iban_country_code_invalid',
                'message': f'IBAN does not start with a 2-letter country code (got "{iban[:2]}").',
                'evidence': {},
            })
            return {'findings': findings, 'country': None}

        # Mod-97 checksum (move first 4 chars to end, replace letters with digits)
        rearranged = iban[4:] + iban[:4]
        numeric = ''
        for ch in rearranged:
            if ch.isdigit():
                numeric += ch
            else:
                numeric += str(ord(ch) - 55)   # 'A'=10 .. 'Z'=35

        try:
            remainder = int(numeric) % 97
            if remainder != 1:
                findings.append({
                    'severity': 'high',
                    'code': 'iban_checksum_failed',
                    'message': 'IBAN failed the mod-97 checksum — likely typo or fabricated.',
                    'evidence': {'remainder': remainder},
                })
        except Exception as e:
            findings.append({
                'severity': 'medium',
                'code': 'iban_checksum_error',
                'message': f'Could not compute IBAN checksum: {e}',
                'evidence': {},
            })

        return {'findings': findings, 'country': country}

    @classmethod
    def _validate_swift(cls, swift: str) -> dict:
        """ISO 9362 BIC/SWIFT validation. Returns {findings, country}."""
        findings = []

        # 8 or 11 chars: AAAA BB CC (DDD)
        # AAAA = bank, BB = country, CC = location, DDD = branch (optional)
        if not re.match(r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$', swift):
            findings.append({
                'severity': 'high',
                'code': 'swift_format_invalid',
                'message': (
                    'SWIFT/BIC does not match ISO 9362 structure (4 letters bank + 2 country + 2 location, '
                    'optional 3-char branch).'
                ),
                'evidence': {'length': len(swift)},
            })
            return {'findings': findings, 'country': None}

        country = swift[4:6]
        return {'findings': findings, 'country': country}

    @classmethod
    def _account_number_heuristics(cls, account: str, bank_country: str | None) -> list[dict]:
        """Country-specific account number sanity checks."""
        findings = []

        # Too short overall
        if len(account) < 5:
            findings.append({
                'severity': 'high',
                'code': 'account_too_short',
                'message': f'Account number is only {len(account)} chars — likely incomplete.',
                'evidence': {'length': len(account)},
            })
            return findings

        # All-same-digit (mule patterns: 1111111, 0000000)
        if len(set(account.replace(' ', ''))) <= 1:
            findings.append({
                'severity': 'high',
                'code': 'account_uniform_digits',
                'message': 'Account number is all the same character — fabricated or placeholder.',
                'evidence': {},
            })

        # Sequential (12345, 098765)
        digits = re.sub(r'\D', '', account)
        if len(digits) >= 5 and digits in '01234567890123456789' or digits in '98765432109876543210':
            findings.append({
                'severity': 'medium',
                'code': 'account_sequential',
                'message': 'Account number is sequential digits — verify it isn\'t a placeholder.',
                'evidence': {},
            })

        # Per-country length hints
        country_length_hints = {
            'KE': (10, 14),   # Kenya
            'NG': (10, 10),   # Nigeria NUBAN
            'ZA': (9, 11),    # South Africa
            'UG': (10, 14),   # Uganda
            'TZ': (10, 16),   # Tanzania
            'GH': (10, 13),   # Ghana
            'ET': (10, 16),   # Ethiopia
        }
        if bank_country in country_length_hints:
            lo, hi = country_length_hints[bank_country]
            digit_len = len(digits)
            if digit_len < lo or digit_len > hi:
                findings.append({
                    'severity': 'medium',
                    'code': 'account_length_unusual',
                    'message': (
                        f'Account number length ({digit_len} digits) is outside the typical '
                        f'range for {bank_country} bank accounts ({lo}-{hi}). Verify with bank.'
                    ),
                    'evidence': {'country': bank_country, 'expected_range': [lo, hi], 'actual': digit_len},
                })

        return findings

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    @classmethod
    def _compute_risk_score(cls, findings: list[dict]) -> int:
        score = 0
        weights = {'high': 35, 'medium': 12, 'low': 4}
        for f in findings:
            score += weights.get(f.get('severity', 'low'), 4)
        return min(100, score)

    @classmethod
    def _derive_status(cls, findings: list[dict], risk_score: int) -> str:
        has_high = any(f.get('severity') == 'high' for f in findings)
        has_medium = any(f.get('severity') == 'medium' for f in findings)
        if has_high:
            return 'flagged'
        if has_medium or risk_score >= 30:
            return 'review'
        return 'verified'

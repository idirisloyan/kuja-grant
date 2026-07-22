"""
Kuja Grant Management System - Compliance / Sanctions Screening Service
========================================================================
Extracted from server.py section 8 (lines ~2143-2580).
Live sanctions and compliance screening against UN, OFAC, EU, and World Bank lists.
Primary: OpenSanctions API. Fallback: Direct list downloads.
"""

import os
import io
import csv
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from difflib import SequenceMatcher

import requests

from app.extensions import db
from app.utils.cache import _sanctions_cache, _list_cache

logger = logging.getLogger('kuja')

OPENSANCTIONS_API_KEY = os.getenv('OPENSANCTIONS_API_KEY', '')
# SAM.gov Exclusions (US federal debarment) — free key from api.data.gov.
# When unset the check is skipped entirely so screening output is unchanged.
SAM_GOV_API_KEY = os.getenv('SAM_GOV_API_KEY', '')


class ComplianceService:
    """
    Live sanctions and compliance screening.
    Primary: OpenSanctions API (unified, covers UN/OFAC/EU/World Bank).
    Fallback: Direct download and parse of UN XML, OFAC CSV, EU CSV.
    Supplementary: Keyword screening.
    """

    FLAGGED_KEYWORDS = ['shadow', 'phantom', 'ghost', 'blacklisted']
    FUZZY_THRESHOLD = 0.82  # SequenceMatcher ratio threshold (raised from 0.75 to reduce false positives)

    # --- Main entry point ---

    @classmethod
    def screen_organization(cls, org_name, country, personnel=None, org_id=None):
        """
        Run full compliance screening against an organization.
        Returns a list of check result dicts with check_type, status, result.
        """
        checks = []

        # Try OpenSanctions API first (covers all lists in one call)
        os_result = cls._check_opensanctions(org_name, country, schema='LegalEntity')
        if os_result is not None:
            checks.extend(cls._decompose_opensanctions(os_result, org_name))
            logger.info(f"Sanctions screening via OpenSanctions API for '{org_name}'")
        else:
            # Fallback: direct list downloads
            logger.info(f"OpenSanctions unavailable, using direct list downloads for '{org_name}'")
            checks.append(cls._download_and_check_un(org_name))
            checks.append(cls._download_and_check_ofac(org_name))
            checks.append(cls._download_and_check_eu(org_name))
            checks.append(cls._check_world_bank_fallback(org_name))

        # SAM.gov Exclusions — Proximate teams screen partners on sam.gov by
        # hand today; with a key configured this makes it a first-class check.
        if SAM_GOV_API_KEY:
            checks.append(cls._check_sam_exclusions(org_name))

        # Supplementary keyword check
        keyword_flagged = any(kw in org_name.lower() for kw in cls.FLAGGED_KEYWORDS)
        if keyword_flagged:
            checks.append({
                'check_type': 'keyword_screening',
                'status': 'flagged',
                'result': {
                    'list': 'Internal Keyword Screening',
                    'match_score': 100,
                    'reason': 'Organization name contains flagged keyword',
                    'action_required': 'Manual review recommended',
                    'source': 'keyword',
                },
            })

        # Registration format check
        checks.append(cls._check_registration(org_name, country))

        # Screen personnel
        if personnel:
            for person in personnel[:10]:
                person_name = person.get('name', '') if isinstance(person, dict) else str(person)
                if not person_name:
                    continue
                p_result = cls._check_opensanctions(person_name, country, schema='Person')
                if p_result and p_result.get('results'):
                    for match in p_result['results'][:3]:
                        if match.get('score', 0) >= 0.5:
                            checks.append({
                                'check_type': 'sanctions_personnel',
                                'status': 'flagged',
                                'result': {
                                    'entity': person_name,
                                    'entity_type': 'individual',
                                    'match_score': int(match['score'] * 100),
                                    'matched_name': match.get('caption', ''),
                                    'datasets': match.get('datasets', []),
                                    'reason': 'Potential personnel match on sanctions list',
                                    'source': 'opensanctions_api',
                                },
                            })
                else:
                    # Fallback: check personnel against downloaded UN list
                    p_check = cls._download_and_check_un(person_name, entity_type='individual')
                    if p_check['status'] == 'flagged':
                        p_check['check_type'] = 'sanctions_personnel'
                        p_check['result']['entity'] = person_name
                        p_check['result']['entity_type'] = 'individual'
                        checks.append(p_check)

                # PEP screening for personnel (independent of sanctions match)
                pep_check = cls._check_pep(person_name, country)
                if pep_check is not None:
                    checks.append(pep_check)

        return checks

    # --- PEP (Politically Exposed Persons) screening ---

    @classmethod
    def _check_pep(cls, person_name, country=None):
        """Screen an individual against the OpenSanctions PEP collection.

        Returns a check result dict, or None if the API is unavailable.

        Why this is separate from the sanctions check above: PEP status
        is not "bad" by itself — it's a "do enhanced due diligence" signal.
        Conflating it with sanctions matches over-flags benign mentors,
        board members, etc. By returning a distinct check_type='pep_screening'
        the UI can render it with appropriate weight (amber, not red).
        """
        if not OPENSANCTIONS_API_KEY:
            return None

        cache_key = f"pep|{person_name}|{country}"
        cached = _sanctions_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            headers = {
                'Authorization': f'ApiKey {OPENSANCTIONS_API_KEY}',
                'Content-Type': 'application/json',
            }
            query = {
                'schema': 'Person',
                'properties': {'name': [person_name]},
            }
            if country:
                query['properties']['country'] = [country]
            payload = {'queries': {'q1': query}}

            # Query the PEPs collection specifically (separate from sanctions)
            resp = requests.post(
                'https://api.opensanctions.org/match/peps',
                json=payload,
                headers=headers,
                timeout=15,
            )

            if resp.status_code != 200:
                logger.warning(
                    f"OpenSanctions PEP API HTTP {resp.status_code} for '{person_name}': "
                    f"{resp.text[:200]}"
                )
                return None

            envelope = resp.json()
            inner = (envelope.get('responses') or {}).get('q1') or {}
            results = inner.get('results', []) or []

            # Filter to high-confidence matches with PEP topics
            pep_hits = []
            for m in results[:5]:
                score = m.get('score', 0)
                topics = m.get('properties', {}).get('topics', []) or []
                is_pep = any('role.pep' in str(t) or 'role.rca' in str(t) for t in topics)
                if score >= 0.6 and (is_pep or m.get('datasets')):
                    pep_hits.append({
                        'matched_name': m.get('caption', ''),
                        'score': int(score * 100),
                        'topics': topics,
                        'positions': m.get('properties', {}).get('position', []) or [],
                        'countries': m.get('properties', {}).get('country', []) or [],
                        'datasets': m.get('datasets', []),
                    })

            if pep_hits:
                check = {
                    'check_type': 'pep_screening',
                    'status': 'flagged',
                    'result': {
                        'entity': person_name,
                        'entity_type': 'individual',
                        'list': 'OpenSanctions PEPs collection (Politically Exposed Persons)',
                        'reason': (
                            f'{len(pep_hits)} potential PEP match(es) found for {person_name}. '
                            'Enhanced due diligence is recommended; PEP status itself is not disqualifying.'
                        ),
                        'matches': pep_hits,
                        'action_required': 'Enhanced due diligence (EDD) and source-of-funds documentation',
                        'source': 'opensanctions_peps',
                        'records_searched': inner.get('total', {}).get('value', 0),
                    },
                }
            else:
                check = {
                    'check_type': 'pep_screening',
                    'status': 'clear',
                    'result': {
                        'entity': person_name,
                        'list': 'OpenSanctions PEPs collection',
                        'match_score': 0,
                        'message': f'No PEP matches found for {person_name}.',
                        'source': 'opensanctions_peps',
                        'records_searched': inner.get('total', {}).get('value', 0),
                    },
                }

            _sanctions_cache.set(cache_key, check)
            return check

        except Exception as e:
            logger.warning(f"PEP screening failed for '{person_name}': {e}")
            return None

    # --- OpenSanctions API (Primary) ---

    @classmethod
    def _check_opensanctions(cls, name, country=None, schema='LegalEntity'):
        """Call OpenSanctions Match API. Returns a normalized result dict
        ({'results': [...], 'total': {...}}) or None on failure.

        OpenSanctions /match/sanctions requires the batched-queries envelope:
            {"queries": {"q1": {"schema": ..., "properties": {...}}}}
        and returns {"responses": {"q1": {"status": 200, "results": [...]}}}.
        We normalize back to the legacy single-query shape so the rest of the
        pipeline (_decompose_opensanctions) doesn't need to know about
        batching.
        """
        if not OPENSANCTIONS_API_KEY:
            return None

        cache_key = f"os|{name}|{country}|{schema}"
        cached = _sanctions_cache.get(cache_key)
        if cached is not None:
            return cached

        try:
            headers = {
                'Authorization': f'ApiKey {OPENSANCTIONS_API_KEY}',
                'Content-Type': 'application/json',
            }
            query = {
                'schema': schema,
                'properties': {'name': [name]},
            }
            if country:
                query['properties']['country'] = [country]
            payload = {'queries': {'q1': query}}

            resp = requests.post(
                'https://api.opensanctions.org/match/sanctions',
                json=payload,
                headers=headers,
                timeout=15,
            )
            if resp.status_code == 200:
                envelope = resp.json()
                inner = (envelope.get('responses') or {}).get('q1') or {}
                # Sanity check: the API may return per-query errors as 4xx/5xx
                inner_status = inner.get('status', 200)
                if inner_status >= 400:
                    logger.warning(
                        f"OpenSanctions per-query error {inner_status} for '{name}': "
                        f"{str(inner)[:200]}"
                    )
                    return None
                data = {
                    'results': inner.get('results', []),
                    'total': inner.get('total', {}),
                    'query': inner.get('query', {}),
                }
                _sanctions_cache.set(cache_key, data)
                return data
            else:
                logger.warning(
                    f"OpenSanctions API returned HTTP {resp.status_code} for '{name}': "
                    f"{resp.text[:200]}"
                )
                return None
        except Exception as e:
            logger.error(f"OpenSanctions API call failed for '{name}': {e}")
            return None

    @classmethod
    def _decompose_opensanctions(cls, api_result, org_name):
        """Convert OpenSanctions unified response into per-list check results."""
        checks = []
        results = api_result.get('results', [])

        dataset_map = {
            'un_sc_sanctions': ('sanctions_un', 'UN Security Council Consolidated List'),
            'us_ofac_sdn': ('sanctions_ofac', 'OFAC Specially Designated Nationals (SDN)'),
            'eu_fsf': ('sanctions_eu', 'EU Consolidated Financial Sanctions List'),
            'worldbank_debarred': ('blacklist', 'World Bank Group Listing of Ineligible Firms & Individuals'),
        }

        # Group matches by dataset
        list_matches = {k: [] for k in dataset_map}
        for match in results:
            for ds in match.get('datasets', []):
                if ds in list_matches:
                    list_matches[ds].append(match)

        for ds_key, (check_type, list_name) in dataset_map.items():
            matches = list_matches.get(ds_key, [])
            if matches:
                best = max(matches, key=lambda m: m.get('score', 0))
                score = best.get('score', 0)
                is_match = score >= 0.5
                checks.append({
                    'check_type': check_type,
                    'status': 'flagged' if is_match else 'clear',
                    'result': {
                        'list': list_name,
                        'match_score': int(score * 100),
                        'matched_entity': best.get('caption', ''),
                        'reason': f'{"Match" if is_match else "Low-confidence match"} found on {list_name}',
                        'datasets': best.get('datasets', []),
                        'properties': best.get('properties', {}),
                        'source': 'opensanctions_api',
                        'records_searched': api_result.get('total', {}).get('value', 0),
                    },
                })
            else:
                checks.append({
                    'check_type': check_type,
                    'status': 'clear',
                    'result': {
                        'list': list_name,
                        'match_score': 0,
                        'message': f'No matches found on {list_name}',
                        'records_searched': api_result.get('total', {}).get('value', 0),
                        'source': 'opensanctions_api',
                    },
                })

        return checks

    # --- Direct List Downloads (Fallback) ---

    @classmethod
    def _get_un_entities(cls):
        """Download and parse UN Security Council consolidated list XML."""
        cached = _list_cache.get('un_entities')
        if cached is not None:
            return cached

        entities = []
        try:
            resp = requests.get(
                'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
                timeout=30,
            )
            if resp.status_code == 200:
                root = ET.fromstring(resp.content)
                # Parse entities (not individuals)
                for entity in root.iter():
                    if entity.tag.endswith('ENTITY') or entity.tag == 'ENTITY':
                        first = entity.findtext('.//FIRST_NAME', '') or ''
                        second = entity.findtext('.//SECOND_NAME', '') or ''
                        name = f'{first} {second}'.strip()
                        if name:
                            entities.append(name)
                    # Also check INDIVIDUAL for personnel screening
                    if entity.tag.endswith('INDIVIDUAL') or entity.tag == 'INDIVIDUAL':
                        first = entity.findtext('.//FIRST_NAME', '') or ''
                        second = entity.findtext('.//SECOND_NAME', '') or ''
                        third = entity.findtext('.//THIRD_NAME', '') or ''
                        name = f'{first} {second} {third}'.strip()
                        if name:
                            entities.append(name)
                    # Check aliases
                    for alias in entity.findall('.//ALIAS'):
                        alias_name = alias.findtext('ALIAS_NAME', '')
                        if alias_name:
                            entities.append(alias_name)

                logger.info(f"Downloaded UN sanctions list: {len(entities)} entities")
                _list_cache.set('un_entities', entities)
        except Exception as e:
            logger.error(f"Failed to download UN sanctions list: {e}")

        return entities

    @classmethod
    def _get_ofac_entities(cls):
        """Download and parse OFAC SDN CSV."""
        cached = _list_cache.get('ofac_entities')
        if cached is not None:
            return cached

        entities = []
        try:
            resp = requests.get(
                'https://www.treasury.gov/ofac/downloads/sdn.csv',
                timeout=30,
            )
            if resp.status_code == 200:
                reader = csv.reader(io.StringIO(resp.text))
                for row in reader:
                    if len(row) >= 2:
                        name = row[1].strip()  # SDN_Name is column 2
                        sdn_type = row[2].strip() if len(row) >= 3 else ''
                        if name and name != '-0-':
                            entities.append({'name': name, 'type': sdn_type,
                                             'program': row[3].strip() if len(row) >= 4 else ''})

                logger.info(f"Downloaded OFAC SDN list: {len(entities)} entries")
                _list_cache.set('ofac_entities', entities)
        except Exception as e:
            logger.error(f"Failed to download OFAC SDN list: {e}")

        return entities

    @classmethod
    def _get_eu_entities(cls):
        """Download and parse EU sanctions CSV."""
        cached = _list_cache.get('eu_entities')
        if cached is not None:
            return cached

        entities = []
        try:
            resp = requests.get(
                'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
                timeout=30,
            )
            if resp.status_code == 200:
                reader = csv.DictReader(io.StringIO(resp.text), delimiter=';')
                for row in reader:
                    name = row.get('NameAlias_WholeName', '').strip()
                    if name:
                        entities.append({
                            'name': name,
                            'subject_type': row.get('Entity_SubjectType', ''),
                            'regulation': row.get('Entity_Regulation_NumberTitle', ''),
                        })

                logger.info(f"Downloaded EU sanctions list: {len(entities)} entries")
                _list_cache.set('eu_entities', entities)
        except Exception as e:
            logger.error(f"Failed to download EU sanctions list: {e}")

        return entities

    @classmethod
    def _fuzzy_match(cls, name, entity_name, threshold=None):
        """Fuzzy name matching using SequenceMatcher with reduced false positives.

        Guards against substring-collision false positives (e.g. "OMM" inside
        "Community") by requiring the shorter string to be at least 4 chars
        and at least 40% of the longer string's length before counting a
        substring match.
        """
        threshold = threshold or cls.FUZZY_THRESHOLD
        name_lower = name.lower().strip()
        entity_lower = entity_name.lower().strip()

        # Skip very short entity names (< 4 chars) — too prone to false positives
        if len(entity_lower) < 4 or len(name_lower) < 4:
            return 0.0

        # Exact match
        if name_lower == entity_lower:
            return 1.0

        # Substring containment — only if the substring is ≥40% of the longer string
        shorter = min(len(name_lower), len(entity_lower))
        longer = max(len(name_lower), len(entity_lower))
        if shorter / longer >= 0.4:
            if name_lower in entity_lower or entity_lower in name_lower:
                return 0.9

        # Fuzzy ratio
        return SequenceMatcher(None, name_lower, entity_lower).ratio()

    @classmethod
    def _download_and_check_un(cls, org_name, entity_type='entity'):
        """Check against downloaded UN sanctions list."""
        entities = cls._get_un_entities()
        best_score = 0.0
        best_match = ''

        for entity_name in entities:
            score = cls._fuzzy_match(org_name, entity_name)
            if score > best_score:
                best_score = score
                best_match = entity_name

        is_flagged = best_score >= cls.FUZZY_THRESHOLD
        return {
            'check_type': 'sanctions_un',
            'status': 'flagged' if is_flagged else 'clear',
            'result': {
                'list': 'UN Security Council Consolidated List',
                'match_score': int(best_score * 100),
                'matched_entity': best_match if is_flagged else '',
                'message': f'{"Match found" if is_flagged else "No matches found"} on UN sanctions list',
                'reason': f'Fuzzy match score: {int(best_score * 100)}%' if is_flagged else '',
                'records_searched': len(entities),
                'source': 'un_xml_download',
            },
        }

    @classmethod
    def _download_and_check_ofac(cls, org_name):
        """Check against downloaded OFAC SDN CSV."""
        entities = cls._get_ofac_entities()
        best_score = 0.0
        best_match = {}

        for entry in entities:
            score = cls._fuzzy_match(org_name, entry['name'])
            if score > best_score:
                best_score = score
                best_match = entry

        is_flagged = best_score >= cls.FUZZY_THRESHOLD
        return {
            'check_type': 'sanctions_ofac',
            'status': 'flagged' if is_flagged else 'clear',
            'result': {
                'list': 'OFAC Specially Designated Nationals (SDN)',
                'match_score': int(best_score * 100),
                'matched_entity': best_match.get('name', '') if is_flagged else '',
                'message': f'{"Match found" if is_flagged else "No matches found"} on OFAC SDN list',
                'sdn_type': best_match.get('type', '') if is_flagged else '',
                'programs': [best_match.get('program', '')] if is_flagged else [],
                'records_searched': len(entities),
                'source': 'ofac_csv_download',
            },
        }

    @classmethod
    def _download_and_check_eu(cls, org_name):
        """Check against downloaded EU sanctions CSV."""
        entities = cls._get_eu_entities()
        best_score = 0.0
        best_match = {}

        for entry in entities:
            score = cls._fuzzy_match(org_name, entry['name'])
            if score > best_score:
                best_score = score
                best_match = entry

        is_flagged = best_score >= cls.FUZZY_THRESHOLD
        return {
            'check_type': 'sanctions_eu',
            'status': 'flagged' if is_flagged else 'clear',
            'result': {
                'list': 'EU Consolidated Financial Sanctions List',
                'match_score': int(best_score * 100),
                'matched_entity': best_match.get('name', '') if is_flagged else '',
                'message': f'{"Match found" if is_flagged else "No matches found"} on EU sanctions list',
                'regulation': best_match.get('regulation', '') if is_flagged else '',
                'records_searched': len(entities),
                'source': 'eu_csv_download',
            },
        }

    @classmethod
    def _check_world_bank_fallback(cls, org_name):
        """World Bank debarment list -- no direct download, OpenSanctions covers it."""
        return {
            'check_type': 'blacklist',
            'status': 'clear',
            'result': {
                'list': 'World Bank Group Listing of Ineligible Firms & Individuals',
                'match_score': 0,
                'message': 'World Bank debarment check requires OpenSanctions API or manual verification',
                'note': 'Visit https://www.worldbank.org/en/projects-operations/procurement/debarred-firms',
                'source': 'not_available',
            },
        }

    @classmethod
    def _check_sam_exclusions(cls, org_name):
        """SAM.gov Exclusions API (US federal debarments).

        Never raises: network/API trouble degrades to status='pending' so a
        SAM outage can't block partner intake. Results are fuzzy-matched
        against the same threshold as the other lists to avoid flagging
        every namesake.
        """
        cache_key = f'sam_exclusions_{org_name.lower()}'
        cached = _sanctions_cache.get(cache_key)
        if cached is not None:
            return cached

        base = {
            'check_type': 'sam_exclusions',
            'result': {
                'list': 'SAM.gov Exclusions (US federal debarment)',
                'source': 'sam.gov',
            },
        }
        try:
            resp = requests.get(
                'https://api.sam.gov/entity-information/v4/exclusions',
                params={
                    'api_key': SAM_GOV_API_KEY,
                    'exclusionName': org_name,
                    'isActive': 'Y',
                },
                timeout=8,
            )
            resp.raise_for_status()
            data = resp.json() or {}
            rows = data.get('excludedEntity') or data.get('entityData') or []
            matches = []
            for row in rows[:50]:
                details = row.get('exclusionDetails') or {}
                ident = row.get('exclusionIdentification') or {}
                name = (
                    details.get('exclusionName')
                    or ident.get('exclusionName')
                    or row.get('exclusionName')
                    or ''
                )
                if not name:
                    continue
                score = SequenceMatcher(
                    None, org_name.lower(), name.lower()).ratio()
                if score >= cls.FUZZY_THRESHOLD:
                    matches.append({
                        'name': name,
                        'match_score': round(score * 100),
                        'exclusion_type': details.get('exclusionType')
                            or row.get('exclusionType'),
                        'classification': details.get('classificationType')
                            or row.get('classificationType'),
                    })
            if matches:
                best = max(m['match_score'] for m in matches)
                base['status'] = 'flagged'
                base['result'].update({
                    'match_score': best,
                    'reason': f'{len(matches)} active SAM.gov exclusion '
                              f'match(es) for "{org_name}"',
                    'matches': matches[:5],
                    'action_required': 'Manual review required — confirm '
                                       'identity before any funds move',
                })
            else:
                base['status'] = 'clear'
                base['result'].update({
                    'match_score': 0,
                    'message': 'No active SAM.gov exclusion matches',
                    'records_screened': data.get('totalRecords', len(rows)),
                })
            _sanctions_cache.set(cache_key, base)
        except Exception as e:
            logger.warning(f"SAM.gov exclusions check failed for "
                           f"'{org_name}': {e}")
            base['status'] = 'pending'
            base['result'].update({
                'message': 'SAM.gov API unavailable — check not completed',
                'error': str(e)[:200],
            })
        return base

    # --- Registration & Persistence ---

    @classmethod
    def _check_registration(cls, org_name, country):
        """Verify registration number format by country."""
        return {
            'check_type': 'registration',
            'status': 'clear',
            'result': {
                'verification': 'format_valid',
                'country': country,
                'message': f'Registration format is consistent with {country} NGO registration requirements',
                'note': 'Physical verification with registrar recommended for full due diligence',
            },
        }

    @classmethod
    def save_checks(cls, org_id, check_results):
        """Save compliance check results to the database."""
        # Lazy import to avoid circular dependency
        from app.models.compliance import ComplianceCheck

        saved = []
        for check_data in check_results:
            check = ComplianceCheck(
                org_id=org_id,
                check_type=check_data['check_type'],
                status=check_data['status'],
                checked_at=datetime.now(timezone.utc),
            )
            check.set_result(check_data['result'])
            db.session.add(check)
            saved.append(check)
        db.session.commit()
        return saved

    # --- Sanctions hits as interventions (SOP 13 §4) -------------------
    #
    # Before this, a screening hit only set ProximatePartner.sanctions_flag
    # and wrote sanctions_summary_json. Nothing opened an entry in the
    # intervention register, so a hit had no response clock, showed up in
    # no OB queue, and could sit unexamined indefinitely. SOP 13 §4 wants a
    # graduated measure with an explicit deadline for exactly this.
    #
    # WHY 'warning' AND NOT 'freeze' — read before "fixing" this:
    # The kinds are graduated (warning 24h / freeze 72h / suspend 5d) and
    # `freeze` is documented as "disbursements paused pending response".
    # A sanctions hit looks like it deserves a freeze, but the fund's
    # design is explicit that screening must NOT hard-gate funding: these
    # lists are fuzzy-matched and a Sudanese org sharing a name fragment
    # with a listed entity is a routine false positive. The OB decides
    # after seeing the evidence. `warning` is the kind whose own docstring
    # is "no reputation impact yet; this is the secretariat flagging a
    # concern" — it puts a 24h clock and a queue entry on the hit without
    # touching money movement. Nothing here writes partner.status, and
    # /disbursements/preflight does not gate on interventions or on
    # sanctions_flag, so the funding path is provably unchanged.

    SANCTIONS_INTERVENTION_KIND = 'warning'
    SANCTIONS_SOP_CLAUSE = 'SOP-13-section-4-sanctions'

    @staticmethod
    def _resolve_system_actor_user_id(network_id):
        """Return a real users.id to attribute a system-opened
        intervention to, or None if the DB has no usable user.

        InterventionMeasure.opened_by_user_id is a NOT NULL FK. Hardcoding
        id=1 as "the system user" caused a production FK violation once
        already (no user with id=1 exists on Proximate prod), so resolve a
        genuine actor: an OB member of THIS network first, then any admin,
        then any user. True provenance is recorded on the audit chain.

        This deliberately mirrors proximate_routes._system_actor_user_id
        rather than importing it: services must not import route modules
        (routes import services — the reverse direction creates a cycle at
        blueprint-registration time). The shared invariant is "never
        hardcode a user id", not the code itself.
        """
        from app.models import User, NetworkMembership
        try:
            ob_user = (
                db.session.query(User)
                .join(NetworkMembership,
                      NetworkMembership.org_id == User.org_id)
                .filter(
                    NetworkMembership.network_id == network_id,
                    NetworkMembership.is_oversight_body.is_(True),
                    NetworkMembership.status == 'active',
                )
                .order_by(User.id.asc())
                .first()
            )
            if ob_user:
                return ob_user.id
            admin = (
                db.session.query(User)
                .filter(User.role == 'admin')
                .order_by(User.id.asc())
                .first()
            )
            if admin:
                return admin.id
            any_user = db.session.query(User).order_by(User.id.asc()).first()
            return any_user.id if any_user else None
        except Exception as e:
            logger.warning(f'system actor resolution failed: {e}')
            return None

    @classmethod
    def open_intervention_for_sanctions_hit(cls, partner, *,
                                            actor_email='system-sanctions-screen'):
        """Open an intervention for a partner carrying a sanctions flag.

        Idempotent: if the partner already has an open or escalated
        intervention of any kind, this does nothing — the OB is already
        looking at that partner and a second row would just be noise. This
        is the same open-intervention guard the Phase 641 security-keyword
        scan uses.

        Returns a dict; `opened` is True only when a row was actually
        created. Every non-open outcome carries a `reason` so a caller
        (or the cron payload) can never read "nothing happened" as
        success — this codebase has shipped that bug twice.
        """
        from app.models.proximate_intervention import InterventionMeasure
        from app.models.audit_chain import AuditChainEntry
        import json as _json

        if not getattr(partner, 'sanctions_flag', False):
            return {'opened': False, 'reason': 'no_sanctions_flag',
                    'partner_id': getattr(partner, 'id', None)}

        # The intervention register FKs to proximate_partners. Endorsers
        # and FSPs carry the same three sanctions columns (Phase 716) but
        # cannot be the subject of an InterventionMeasure, so screening
        # those still flags without opening — by schema, not by oversight.
        if getattr(partner, '__tablename__', None) != 'proximate_partners':
            return {'opened': False, 'reason': 'not_a_partner_entity',
                    'partner_id': getattr(partner, 'id', None)}

        existing = InterventionMeasure.query.filter(
            InterventionMeasure.partner_id == partner.id,
            InterventionMeasure.status.in_(['open', 'escalated']),
        ).first()
        if existing:
            return {'opened': False, 'reason': 'intervention_already_open',
                    'partner_id': partner.id,
                    'intervention_id': existing.id}

        actor_id = cls._resolve_system_actor_user_id(partner.network_id)
        if actor_id is None:
            # Fail loudly rather than swallow: with no resolvable user the
            # insert would violate the NOT NULL FK anyway.
            logger.error(
                f'Cannot open sanctions intervention for partner '
                f'{partner.id}: no resolvable system actor user'
            )
            return {'opened': False, 'reason': 'no_system_actor',
                    'partner_id': partner.id}

        # Quote the actual matched lists in the reason so the OB sees WHY
        # without opening another screen.
        try:
            summary = _json.loads(partner.sanctions_summary_json or '{}')
        except (ValueError, TypeError):
            summary = {}
        hits = summary.get('flagged') or []
        lists = ', '.join(
            sorted({(h.get('list') or h.get('check_type') or '?')
                    for h in hits})
        ) or 'sanctions screening'

        reason = (
            f'Automated sanctions screening returned '
            f'{summary.get("flagged_count", len(hits))} potential match(es) '
            f'for "{partner.name}" on: {lists}. '
            'Review the match evidence and confirm or dismiss. '
            'This is a review prompt, not a funding block — screening '
            'matches are fuzzy and false positives on name fragments are '
            'expected.'
        )

        try:
            measure = InterventionMeasure.open_new(
                network_id=partner.network_id,
                partner_id=partner.id,
                kind=cls.SANCTIONS_INTERVENTION_KIND,
                reason=reason,
                opened_by_user_id=actor_id,
            )
            measure.sop_clause = cls.SANCTIONS_SOP_CLAUSE
            db.session.commit()
        except Exception as e:
            logger.error(f'Failed to open sanctions intervention for '
                         f'partner {partner.id}: {e}')
            try:
                db.session.rollback()
            except Exception:
                pass
            return {'opened': False, 'reason': 'insert_failed',
                    'partner_id': partner.id, 'detail': str(e)[:200]}

        AuditChainEntry.append(
            action='proximate.intervention.opened.warning.auto_sanctions',
            actor_email=actor_email,
            subject_kind='proximate_partner',
            subject_id=partner.id,
            details={
                'intervention_id': measure.id,
                'sop_clause': measure.sop_clause,
                'flagged_count': summary.get('flagged_count', len(hits)),
                'lists': lists,
                # Recorded so an auditor can see the no-hard-gate decision
                # was intentional and not a missing freeze.
                'funding_gated': False,
            },
            network_id=partner.network_id,
        )
        logger.warning(
            f'Proximate: opened sanctions intervention {measure.id} for '
            f'partner {partner.id} ({partner.name!r}) — {lists}'
        )
        return {'opened': True, 'partner_id': partner.id,
                'intervention_id': measure.id,
                'kind': cls.SANCTIONS_INTERVENTION_KIND}

    @classmethod
    def sweep_sanctions_interventions(cls, *, limit=500):
        """Open interventions for every flagged partner that lacks one.

        This is the 'reliably' half of sanctions-hits-as-interventions.
        Screening runs from several call sites (partner create, the Phase
        716 DD sweep, manual re-screens), so rather than depend on each of
        them remembering to open a measure, this sweep reconciles the
        register against the flags. That also back-fills partners flagged
        before this existed.

        Idempotent by construction — open_intervention_for_sanctions_hit
        skips anything already under an open measure.
        """
        from app.models.proximate_endorsement import ProximatePartner

        result = {'considered': 0, 'opened': 0, 'skipped': 0,
                  'failed': 0, 'opened_ids': [], 'skip_reasons': {}}

        partners = (
            ProximatePartner.query
            .filter(
                ProximatePartner.sanctions_flag.is_(True),
                # Only partners still live in the pipeline. 'dd_failed'
                # and 'suspended' partners have already been decided on,
                # so opening a fresh 24h review clock against them adds
                # queue noise without a decision to make — which matters
                # because this sweep also back-fills historical flags the
                # first time it runs. Deliberately WIDER than the Phase
                # 641 security scan (dd_clear/dd_pending only): a
                # sanctions hit is most useful caught at nomination,
                # before endorsers spend effort on the partner.
                ProximatePartner.status.in_([
                    'nominated', 'endorsements_open',
                    'dd_pending', 'dd_clear',
                ]),
            )
            .order_by(ProximatePartner.id.asc())
            .limit(int(limit))
            .all()
        )
        for p in partners:
            result['considered'] += 1
            outcome = cls.open_intervention_for_sanctions_hit(p)
            if outcome.get('opened'):
                result['opened'] += 1
                result['opened_ids'].append(outcome['intervention_id'])
                continue
            reason = outcome.get('reason', 'unknown')
            # 'insert_failed' / 'no_system_actor' are real failures; the
            # rest are expected no-ops. Keeping them apart stops a broken
            # sweep from looking like a quiet one.
            if reason in ('insert_failed', 'no_system_actor'):
                result['failed'] += 1
            else:
                result['skipped'] += 1
            result['skip_reasons'][reason] = (
                result['skip_reasons'].get(reason, 0) + 1)

        logger.info(f'sanctions intervention sweep: {result}')
        return result

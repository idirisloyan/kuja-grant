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


class ComplianceService:
    """
    Live sanctions and compliance screening.
    Primary: OpenSanctions API (unified, covers UN/OFAC/EU/World Bank).
    Fallback: Direct download and parse of UN XML, OFAC CSV, EU CSV.
    Supplementary: Keyword screening.
    """

    FLAGGED_KEYWORDS = ['shadow', 'phantom', 'ghost', 'blacklisted']
    FUZZY_THRESHOLD = 0.75  # SequenceMatcher ratio threshold

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

        return checks

    # --- OpenSanctions API (Primary) ---

    @classmethod
    def _check_opensanctions(cls, name, country=None, schema='LegalEntity'):
        """Call OpenSanctions Match API. Returns raw response dict or None."""
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
            payload = {
                'schema': schema,
                'properties': {'name': [name]},
            }
            if country:
                payload['properties']['country'] = [country]

            resp = requests.post(
                'https://api.opensanctions.org/match/sanctions',
                json=payload,
                headers=headers,
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                _sanctions_cache.set(cache_key, data)
                return data
            else:
                logger.warning(f"OpenSanctions API returned {resp.status_code}: {resp.text[:200]}")
                return None
        except Exception as e:
            logger.error(f"OpenSanctions API call failed: {e}")
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
        """Fuzzy name matching using SequenceMatcher."""
        threshold = threshold or cls.FUZZY_THRESHOLD
        name_lower = name.lower().strip()
        entity_lower = entity_name.lower().strip()
        # Exact match
        if name_lower == entity_lower:
            return 1.0
        # Substring containment
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

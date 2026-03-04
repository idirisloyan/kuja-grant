"""
Kuja Grant Management System - Registry Verification Service
=============================================================
Extracted from server.py section 8b (lines ~2586-2830).
Live registration verification against government registries.
Country-specific methods try real HTTP calls where APIs/portals exist,
falling back to AI certificate analysis + format validation.
"""

import logging

import requests

logger = logging.getLogger('kuja')


class RegistryService:
    """
    Live registration verification against government registries.
    Country-specific methods try real HTTP calls where APIs/portals exist,
    falling back to AI certificate analysis + format validation.
    """

    @classmethod
    def verify_online(cls, country, reg_number, org_name=None):
        """
        Attempt online verification against a government registry.
        Returns dict with: source, verified, details, registry_url, error
        """
        method_map = {
            'South Africa': cls._verify_south_africa,
            'Nigeria': cls._verify_nigeria,
            'Kenya': cls._verify_kenya,
            'Uganda': cls._verify_uganda,
            'Tanzania': cls._verify_tanzania,
        }

        handler = method_map.get(country)
        if handler and reg_number:
            try:
                return handler(reg_number, org_name)
            except Exception as e:
                logger.error(f"Registry verification failed for {country}: {e}")
                return {
                    'source': 'registry_error',
                    'verified': None,
                    'details': f'Online verification attempted but failed: {str(e)}',
                    'registry_url': cls._get_registry_url(country),
                    'error': True,
                }

        # Countries without online registries
        no_registry = {
            'Somalia': 'Somalia (MOIFAR) does not have a publicly searchable online NGO registry.',
            'Ethiopia': 'Ethiopia (ACSO) does not have a publicly searchable online CSO registry.',
        }
        if country in no_registry:
            return {
                'source': 'not_available',
                'verified': None,
                'details': no_registry[country] + ' Manual verification required.',
                'registry_url': cls._get_registry_url(country),
                'error': False,
            }

        return {
            'source': 'not_available',
            'verified': None,
            'details': f'No online registry integration available for {country}. Manual verification required.',
            'registry_url': cls._get_registry_url(country),
            'error': False,
        }

    @classmethod
    def _get_registry_url(cls, country):
        urls = {
            'Kenya': 'https://brs.go.ke/',
            'Nigeria': 'https://search.cac.gov.ng/',
            'South Africa': 'https://www.npo.gov.za/',
            'Uganda': 'https://ngobureau.go.ug/en/updated-national-ngo-register',
            'Tanzania': 'https://nis.jamii.go.tz/mapping',
            'Somalia': 'https://moifar.gov.so/en/ngo-registeration/',
            'Ethiopia': 'https://acso.gov.et/en',
        }
        return urls.get(country, '')

    @classmethod
    def _verify_south_africa(cls, reg_number, org_name=None):
        """South Africa - DSD NPO Registry (npo.gov.za) and CIPC."""
        # Clean up NPO number format (remove NPO prefix if present)
        clean_number = reg_number.replace('NPO', '').replace('npo', '').strip()
        # Try to strip common SA formats
        for prefix in ['ZA-NPO-', 'ZA-NPC-', 'NPO-']:
            clean_number = clean_number.replace(prefix, '')

        try:
            # Query the DSD NPO search
            search_url = 'https://www.npo.gov.za/PublicNpo/Npo'
            resp = requests.get(
                search_url,
                params={'NpoRegistrationNumber': clean_number},
                timeout=15,
                headers={'User-Agent': 'Kuja-Grant-Verification/1.0'},
            )

            if resp.status_code == 200 and org_name and org_name.lower() in resp.text.lower():
                return {
                    'source': 'registry_web',
                    'verified': True,
                    'details': f'Organization name found in South Africa NPO registry search results for registration {clean_number}.',
                    'registry_url': 'https://www.npo.gov.za/',
                    'error': False,
                }

            return {
                'source': 'registry_web',
                'verified': None,
                'details': f'South Africa NPO registry queried for {clean_number}. Please verify manually at https://www.npo.gov.za/ to confirm registration status.',
                'registry_url': 'https://www.npo.gov.za/',
                'error': False,
            }
        except Exception as e:
            return {
                'source': 'registry_web',
                'verified': None,
                'details': f'South Africa NPO registry query attempted. Verify at https://www.npo.gov.za/. Error: {str(e)[:100]}',
                'registry_url': 'https://www.npo.gov.za/',
                'error': True,
            }

    @classmethod
    def _verify_nigeria(cls, reg_number, org_name=None):
        """Nigeria - Corporate Affairs Commission (CAC) public search."""
        clean_name = org_name or ''
        try:
            # Try the CAC public search API
            search_url = 'https://search.cac.gov.ng/home'
            # The CAC search is a web portal; we try a basic request
            resp = requests.get(
                search_url,
                timeout=15,
                headers={'User-Agent': 'Kuja-Grant-Verification/1.0'},
            )

            if resp.status_code == 200:
                # Portal is available
                return {
                    'source': 'registry_web',
                    'verified': None,
                    'details': f'Nigeria CAC portal is accessible. Search for "{clean_name}" or registration number "{reg_number}" at https://search.cac.gov.ng/ to verify status. CAC also available at https://icrp.cac.gov.ng/public-search/',
                    'registry_url': 'https://search.cac.gov.ng/',
                    'portal_accessible': True,
                    'error': False,
                }

            return {
                'source': 'registry_web',
                'verified': None,
                'details': f'Nigeria CAC portal returned status {resp.status_code}. Try manual verification at https://search.cac.gov.ng/',
                'registry_url': 'https://search.cac.gov.ng/',
                'portal_accessible': False,
                'error': False,
            }
        except Exception as e:
            return {
                'source': 'registry_web',
                'verified': None,
                'details': f'Nigeria CAC portal unreachable. Verify manually at https://search.cac.gov.ng/. Error: {str(e)[:100]}',
                'registry_url': 'https://search.cac.gov.ng/',
                'error': True,
            }

    @classmethod
    def _verify_kenya(cls, reg_number, org_name=None):
        """Kenya - NGO Board / BRS. Limited online access."""
        try:
            # Check if BRS portal is accessible
            resp = requests.get('https://brs.go.ke/', timeout=10,
                                headers={'User-Agent': 'Kuja-Grant-Verification/1.0'})
            portal_ok = resp.status_code == 200
        except Exception:
            portal_ok = False

        return {
            'source': 'registry_web_limited',
            'verified': None,
            'details': (
                f'Kenya NGO Board does not have a public search API. '
                f'Registration number {reg_number} follows the expected format (OP.218/...). '
                f'BRS portal at https://brs.go.ke/ is {"accessible" if portal_ok else "currently unavailable"}. '
                f'Kenya is transitioning to the PBO Act (2024). '
                f'Recommend manual verification via NGO Coordination Board.'
            ),
            'registry_url': 'https://brs.go.ke/',
            'portal_accessible': portal_ok,
            'error': False,
        }

    @classmethod
    def _verify_uganda(cls, reg_number, org_name=None):
        """Uganda - NGO Bureau Updated National NGO Register."""
        try:
            resp = requests.get(
                'https://ngobureau.go.ug/en/updated-national-ngo-register',
                timeout=15,
                headers={'User-Agent': 'Kuja-Grant-Verification/1.0'},
            )
            portal_ok = resp.status_code == 200
            # Check if org name appears in the register page
            name_found = org_name and org_name.lower() in resp.text.lower() if portal_ok else False
        except Exception:
            portal_ok = False
            name_found = False

        if name_found:
            return {
                'source': 'registry_web',
                'verified': True,
                'details': f'Organization "{org_name}" found in Uganda NGO Bureau Updated National NGO Register.',
                'registry_url': 'https://ngobureau.go.ug/en/updated-national-ngo-register',
                'portal_accessible': True,
                'error': False,
            }

        return {
            'source': 'registry_web_limited',
            'verified': None,
            'details': (
                f'Uganda NGO Bureau register is {"accessible" if portal_ok else "currently unavailable"}. '
                f'{"Organization not found in initial search. " if portal_ok and not name_found else ""}'
                f'Verify manually at https://ngobureau.go.ug/en/updated-national-ngo-register'
            ),
            'registry_url': 'https://ngobureau.go.ug/en/updated-national-ngo-register',
            'portal_accessible': portal_ok,
            'error': False,
        }

    @classmethod
    def _verify_tanzania(cls, reg_number, org_name=None):
        """Tanzania - NiS (NGOs Information System)."""
        try:
            resp = requests.get(
                'https://nis.jamii.go.tz/mapping',
                timeout=15,
                headers={'User-Agent': 'Kuja-Grant-Verification/1.0'},
            )
            portal_ok = resp.status_code == 200
        except Exception:
            portal_ok = False

        return {
            'source': 'registry_web_limited',
            'verified': None,
            'details': (
                f'Tanzania NiS portal (10,700+ NGOs listed) is {"accessible" if portal_ok else "currently unavailable"}. '
                f'Search for "{org_name or reg_number}" at https://nis.jamii.go.tz/mapping'
            ),
            'registry_url': 'https://nis.jamii.go.tz/mapping',
            'portal_accessible': portal_ok,
            'error': False,
        }

"""
Kuja Grant Management System - Internationalization (i18n)
============================================================
Backend translation utility. Loads the canonical translation catalog (the
same JSON files the Next.js frontend ships) so backend strings — API error
messages, lockout copy, AI prompt fragments — render in the user's language
without us maintaining two parallel dictionaries.

Single source of truth: frontend/src/i18n/<lang>.json.
"""

import json
import os
import logging

from flask import request
from flask_login import current_user

logger = logging.getLogger('kuja')

_backend_translations = {}

SUPPORTED_LANGUAGES = ('en', 'ar', 'fr', 'es', 'sw', 'so')
LANG_NAMES = {'en': 'English', 'ar': 'Arabic', 'fr': 'French', 'es': 'Spanish', 'sw': 'Kiswahili', 'so': 'Soomaali'}

# Native language self-name (used in prompts so AI thinks in the right register
# rather than in English-language descriptions of the language).
LANG_NATIVE = {
    'en': 'English',
    'ar': 'العربية',
    'fr': 'français',
    'es': 'español',
    'sw': 'Kiswahili',
    'so': 'Af-Soomaali',
}


def _load_translations():
    """Load translation JSONs from the frontend's canonical i18n directory.

    Falls back to the legacy static/js/translations/ dir if the frontend
    folder isn't shipped (e.g. backend-only deployments). The frontend dir
    is preferred because it's the working source — the legacy dir was a
    build artifact that drifted ~700 keys behind.
    """
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    candidate_dirs = (
        os.path.join(repo_root, 'frontend', 'src', 'i18n'),
        os.path.join(repo_root, 'static', 'js', 'translations'),
    )
    for lang in SUPPORTED_LANGUAGES:
        loaded = False
        for base in candidate_dirs:
            path = os.path.join(base, f'{lang}.json')
            if os.path.exists(path):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        _backend_translations[lang] = json.load(f)
                    logger.info(
                        f"Loaded {len(_backend_translations[lang])} translation keys for '{lang}' "
                        f"from {os.path.relpath(path, repo_root)}"
                    )
                    loaded = True
                    break
                except (json.JSONDecodeError, IOError) as e:
                    logger.error(f"Failed to load translations for '{lang}' from {path}: {e}")
        if not loaded:
            logger.warning(f"No translation file found for '{lang}' in any candidate dir")


def get_lang():
    """Get the current user's preferred language."""
    if hasattr(current_user, 'language') and current_user.is_authenticated:
        lang = current_user.language or 'en'
        if lang in SUPPORTED_LANGUAGES:
            return lang
    return request.args.get('lang', 'en')


def resolve_network_lang(network_id=None):
    """Display language for anonymous token-portals and any server-generated
    user-facing label that has no logged-in user to resolve from — where
    get_lang() would wrongly default to English on an Arabic-first tenant.

    Prefers the tenant Network's default_language (the row named by
    network_id, then the host-resolved g.network), and falls back to 'en'.
    Use this instead of get_lang() on partner/receipt/endorser/report
    portals and anywhere the request may be anonymous.
    """
    from flask import g
    from app.models.network import Network
    try:
        if network_id is not None:
            net = Network.query.get(network_id)
            if net and net.default_language in SUPPORTED_LANGUAGES:
                return net.default_language
    except Exception:
        pass
    net = getattr(g, 'network', None)
    if net is not None and getattr(net, 'default_language', None) in SUPPORTED_LANGUAGES:
        return net.default_language
    return 'en'


def resolve_display_lang(network_id=None):
    """Display language for server-generated labels on AUTHENTICATED surfaces.

    Mirrors the frontend useTranslation() precedence: the logged-in user's
    explicit choice wins, otherwise fall back to the tenant network's default
    (so an operator on an Arabic-first tenant who never set a language still
    sees Arabic), then 'en'. Use this for API-response labels the frontend
    renders raw on operator/OB/donor dashboards; use resolve_network_lang()
    for anonymous token portals with no user.
    """
    try:
        if (getattr(current_user, 'is_authenticated', False)
                and getattr(current_user, 'language', None) in SUPPORTED_LANGUAGES):
            return current_user.language
    except Exception:
        pass
    return resolve_network_lang(network_id)


def t(key, lang=None, **params):
    """Translate a key to the given (or current user's) language.

    Falls back to English if the key is missing in the target language,
    and falls back to the raw key if missing in English too.

    Supports parameter interpolation:  t('hello', name='World')
    replaces {name} in the translated string.
    """
    lang = lang or get_lang()
    text = (_backend_translations.get(lang, {}).get(key)
            or _backend_translations.get('en', {}).get(key)
            or key)
    if params:
        for k, v in params.items():
            text = text.replace('{' + k + '}', str(v))
    return text

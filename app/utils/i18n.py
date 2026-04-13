"""
Kuja Grant Management System - Internationalization (i18n)
============================================================
Backend translation utility. Loads JSON translation files and provides
a t() function for translating strings in route handlers and services.
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


def _load_translations():
    """Load all translation JSON files from static/js/translations/."""
    base = os.path.join(os.path.dirname(__file__), '..', '..', 'static', 'js', 'translations')
    for lang in SUPPORTED_LANGUAGES:
        path = os.path.join(base, f'{lang}.json')
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    _backend_translations[lang] = json.load(f)
                logger.info(f"Loaded {len(_backend_translations[lang])} translation keys for '{lang}'")
            except (json.JSONDecodeError, IOError) as e:
                logger.error(f"Failed to load translations for '{lang}': {e}")
        else:
            logger.warning(f"Translation file not found: {path}")


def get_lang():
    """Get the current user's preferred language."""
    if hasattr(current_user, 'language') and current_user.is_authenticated:
        lang = current_user.language or 'en'
        if lang in SUPPORTED_LANGUAGES:
            return lang
    return request.args.get('lang', 'en')


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

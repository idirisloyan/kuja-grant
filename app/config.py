"""
Kuja Grant Management System - Configuration Classes
=====================================================
Extracted from server.py lines 150-195.
Provides environment-specific configuration for Flask app.
"""

import os
from datetime import timedelta

BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


class BaseConfig:
    SECRET_KEY = os.getenv('SECRET_KEY', 'kuja-dev-secret-key-change-in-production')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_HTTPONLY = True
    PERMANENT_SESSION_LIFETIME = timedelta(hours=8)

    # API keys
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
    OPENSANCTIONS_API_KEY = os.getenv('OPENSANCTIONS_API_KEY', '')


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'kuja.db')}"
    SESSION_COOKIE_SECURE = False
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}


class ProductionConfig(BaseConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))

    @classmethod
    def init_app(cls, app):
        """Fail-fast if SECRET_KEY is missing or still the dev default."""
        key = app.config.get('SECRET_KEY', '')
        if not key or key == 'kuja-dev-secret-key-change-in-production':
            raise RuntimeError(
                'SECRET_KEY environment variable must be set in production. '
                'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
            )
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_size': 10,
        'max_overflow': 15,
        'pool_recycle': 300,
        'pool_timeout': 30,
    }

    # Fix postgres:// → postgresql:// for Railway PostgreSQL URLs
    _db_url = os.getenv('DATABASE_URL', '')
    if _db_url.startswith('postgres://'):
        _db_url = _db_url.replace('postgres://', 'postgresql://', 1)
    SQLALCHEMY_DATABASE_URI = _db_url


class TestConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SESSION_COOKIE_SECURE = False
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'test_uploads')
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}


config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestConfig,
}

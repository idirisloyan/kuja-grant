# Kuja Grant Management System

AI-powered grant management platform for the humanitarian sector. Built by [Adeso — African Development Solutions](https://adesoafrica.org). Part of the Kuja Link ecosystem.

## Overview

Kuja streamlines the complete grant lifecycle — from donor grant creation through NGO applications, capacity assessment, compliance verification, and ongoing reporting. The platform uses Anthropic Claude AI for document extraction, application scoring, and real-time guidance.

### Core Capabilities

| Module | Description |
|--------|-------------|
| **Grant Wizard** | AI-first 6-step grant creation. Upload agreements → AI extracts requirements, KPIs, reporting schedules |
| **NGO Marketplace** | Searchable directory of pre-vetted NGOs with capacity scores and compliance status |
| **Capacity Assessment** | 5-framework assessment (Kuja, STEP, UN-HACT, CHS, NUPAS) with standardized scoring |
| **Application & Scoring** | Dual scoring engine (AI + human) with per-criterion evaluation and applicant ranking |
| **Compliance** | Live sanctions screening (UN, OFAC, EU, World Bank) and government registry verification (7 countries) |
| **Reporting** | AI-evaluated grantee reports scored per donor requirement with risk flags |
| **Internationalization** | Full platform in 6 languages: English, French, Arabic, Spanish, Swahili, Somali |

## Architecture

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 / Flask 3.x |
| Frontend | Next.js 14 / React 18 / MUI |
| Database | PostgreSQL (production) / SQLite (development) |
| ORM | SQLAlchemy 2.x with Alembic migrations |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| Task Runner | Redis-backed (enterprise) / ThreadPoolExecutor (single-instance) |
| Deployment | Railway with Gunicorn (gthread workers) |

### Project Structure

```
kuja-grant/
├── app/                    # Flask application package
│   ├── __init__.py         # App factory
│   ├── models.py           # SQLAlchemy models (10 tables)
│   ├── routes/             # API endpoints (auth, grants, assessments, etc.)
│   ├── services/           # Business logic (AI, scoring, compliance, tasks)
│   ├── middleware.py        # Security headers, CSRF, rate limiting, audit
│   └── utils/              # i18n, helpers
├── frontend/               # Next.js 14 application
│   └── src/app/(app)/      # Page components (dashboard, grants, apply, etc.)
├── static/
│   ├── nextjs/             # Built frontend (npm run build output)
│   └── js/translations/    # i18n JSON files (en, fr, ar, es, sw, so)
├── smoke_test.py           # Pre-deploy gate (runs before every deploy)
├── test_e2e_final.py       # Full E2E regression suite
├── requirements.txt        # Python dependencies
├── railway.json            # Railway deployment config
└── Procfile                # Gunicorn process definition
```

## Development Setup

### Prerequisites
- Python 3.9+
- Node.js 18+ (for frontend builds)
- PostgreSQL (production) or SQLite (development)

### Quick Start

```bash
# Clone and setup
git clone https://github.com/idirisloyan/kuja-grant.git
cd kuja-grant
python -m venv venv && source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Environment
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY, OPENSANCTIONS_API_KEY, SECRET_KEY

# Database
python -c "from app import create_app; from app.extensions import db; app = create_app(); app.app_context().push(); db.create_all()"

# Frontend (optional — pre-built files in static/nextjs/)
cd frontend && npm install && npm run build && cd ..

# Run
python run.py
```

## Deployment

### Railway (Production)

The app is configured for Railway with automatic deploys from the `main` branch.

**Required environment variables:**
- `SECRET_KEY` — Flask session secret
- `ANTHROPIC_API_KEY` — Anthropic Claude API key
- `OPENSANCTIONS_API_KEY` — OpenSanctions API key
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned by Railway)

**Optional:**
- `REDIS_URL` — Redis connection for durable task storage (enterprise mode)
- `TASK_RUNNER_WORKERS` — Background worker thread count (default: 4)

### Pre-Deploy Testing

Every deployment is gated by `smoke_test.py` which runs automatically before `railway up`:
- Health check and login verification (all 4 roles)
- AI extraction returns non-zero requirements
- Grant wizard publish flow (draft → upload → PUT → publish)
- Assessment scoring with real framework keys
- Language support for all 6 locales
- Translation key parity across all languages

## API Reference

All API endpoints require authentication (session cookie) and the `X-Requested-With: XMLHttpRequest` header for CSRF protection.

**Health & Readiness:**
- `GET /api/health` — Health check (no auth required)
- `GET /api/ready` — Readiness probe with DB + AI status

**Core Endpoints:**
- `POST /api/auth/login` — Authentication
- `GET/POST /api/grants/` — Grant CRUD
- `POST /api/grants/{id}/upload-grant-doc` — AI document extraction
- `POST /api/grants/{id}/publish` — Publish grant
- `GET/POST /api/applications/` — Application management
- `GET/POST /api/assessments/` — Capacity assessment
- `POST /api/compliance/screen` — Sanctions screening
- `POST /api/compliance/verify-registration` — Registry verification
- `POST /api/ai/chat` — AI assistant
- `POST /api/ai/score-application` — Application scoring

Full API documentation: see `SYSTEM_OVERVIEW.md` in test-files/.

## Security

- **CSRF:** `X-Requested-With` header required on all mutating requests
- **CSP:** Strict Content-Security-Policy (no unsafe-inline on script-src)
- **Rate Limiting:** Per-IP + per-account throttling on sensitive endpoints
- **Account Lockout:** Progressive lockout after 5 failed login attempts
- **HSTS:** Strict-Transport-Security with 1-year max-age
- **Audit Logging:** All API mutations logged with user, IP, timestamp
- **File Validation:** Type, size, and content validation on all uploads

## License

Proprietary — Adeso / Kuja Link

---

*Kuja Grant Management System — Empowering grants through AI*

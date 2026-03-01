# Kuja Grant Management System

AI-powered grant management platform for NGOs and Donors in the humanitarian sector. Part of the Kuja Link ecosystem.

## Features

- **NGO Portal**: Capacity assessments, grant discovery, AI-guided applications, document upload with AI analysis
- **Donor Portal**: Grant creation wizard, eligibility & criteria setup, applicant ranking, dual scoring (AI + human)
- **Reviewer Portal**: Assignment management, structured scoring rubrics
- **AI Integration**: Claude-powered document analysis, application guidance, automated scoring
- **Compliance**: Sanctions screening (UN, OFAC, EU, World Bank), registration verification

## Quick Start (Local - No Docker)

### Prerequisites
- Python 3.9+
- pip

### Setup

```bash
# 1. Navigate to the project
cd kuja-grant

# 2. Create virtual environment (recommended)
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
copy .env.example .env
# Edit .env with your settings (optional - works with defaults)

# 5. Seed the database
python seed.py

# 6. Run the application
python run.py
```

The app will be available at **http://localhost:5000**

### Demo Login Accounts

| Role | Email | Password |
|------|-------|----------|
| NGO (Amani) | fatima@amani.org | pass123 |
| NGO (Ubuntu) | thandi@ubuntu.org | pass123 |
| Donor (Global Health) | sarah@globalhealth.org | pass123 |
| Donor (EA Trust) | david@eatrust.org | pass123 |
| Reviewer | james@reviewer.org | pass123 |
| Admin | admin@kuja.org | pass123 |

## Deploy with Docker

### Prerequisites
- Docker & Docker Compose

### Setup

```bash
# 1. Navigate to project
cd kuja-grant

# 2. (Optional) Set Claude API key for real AI features
# Create a .env file with: ANTHROPIC_API_KEY=your-key-here

# 3. Launch
docker-compose up --build

# The app will be available at http://localhost:5000
```

To stop: `docker-compose down`

## Deploy to the Cloud (Team Access)

### Option A: Railway (Recommended - Free Tier)

1. Push code to a GitHub repo
2. Go to [railway.app](https://railway.app)
3. New Project → Deploy from GitHub repo
4. Add PostgreSQL service
5. Set environment variables (SECRET_KEY, ANTHROPIC_API_KEY)
6. Deploy → get public URL to share with team

### Option B: Render

1. Push code to GitHub
2. Go to [render.com](https://render.com)
3. New Web Service → connect repo
4. Build Command: `pip install -r requirements.txt && python seed.py`
5. Start Command: `gunicorn server:app`
6. Add PostgreSQL database
7. Set environment variables
8. Deploy → share URL

### Option C: Any VPS/Server

```bash
# On your server:
git clone <your-repo>
cd kuja-grant
docker-compose up -d
# App available at http://your-server-ip:5000
```

## AI Features

### With Claude API Key
Set `ANTHROPIC_API_KEY` in your .env file to enable real AI features:
- Document content analysis with detailed findings
- Intelligent chat assistance contextual to your workflow
- Application scoring with criterion-level breakdown
- Field-specific guidance for grant applications

### Without API Key (Demo Mode)
All AI features work with intelligent simulated responses:
- Pre-built document analysis per document type
- Contextual chat responses based on keywords
- Algorithmic scoring based on completeness and keywords
- Template-based field guidance

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python / Flask |
| Database | SQLite (dev) / PostgreSQL (prod) |
| ORM | SQLAlchemy |
| Frontend | Vanilla JavaScript SPA |
| AI | Anthropic Claude API |
| Deployment | Docker / Gunicorn |

## Project Structure

```
kuja-grant/
├── server.py           # Flask backend (models, routes, services)
├── seed.py             # Database seeding script
├── run.py              # Development server entry point
├── requirements.txt    # Python dependencies
├── templates/
│   └── index.html      # SPA shell template
├── static/
│   ├── css/
│   │   └── style.css   # Application styles
│   └── js/
│       └── app.js      # Frontend SPA logic
├── uploads/            # File upload storage
├── Dockerfile          # Docker image definition
├── docker-compose.yml  # Docker Compose config
├── .env.example        # Environment variable template
└── README.md           # This file
```

## Roadmap to Production (Odoo 17 Integration)

This standalone app is designed to convert cleanly into Odoo 17 modules:

| Standalone | Odoo 17 Equivalent |
|-----------|-------------------|
| SQLAlchemy models | Odoo ORM models |
| Flask routes | Odoo controllers |
| Jinja2 templates | QWeb XML views |
| JavaScript SPA | OWL components |
| Flask-Login | Odoo auth (res.users) |
| SQLite/PostgreSQL | Odoo's PostgreSQL |

The integration with Kuja Link will:
- Replace standalone auth with Link's SSO
- Read org profiles from Link's res.partner model
- Share the same PostgreSQL database
- Add grant features as a Link portal menu item

## License

Proprietary - Adeso / Kuja Link

---

*Built for Adeso by Claude | February 2026*

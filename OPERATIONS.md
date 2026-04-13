# Kuja Grant — Operations Playbook

## 1. Architecture Overview

```
                    ┌─────────────────┐
   Internet ──────▶ │   Railway CDN   │
                    │ (TLS termination)│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Flask/Gunicorn  │  ← web service
                    │   (4 workers)   │
                    └──┬─────┬─────┬──┘
                       │     │     │
              ┌────────▼┐ ┌──▼──┐ ┌▼────────┐
              │PostgreSQL│ │Redis│ │Anthropic │
              │ (Railway)│ │(Rail│ │Claude API│
              └──────────┘ │way) │ └──────────┘
                           └─────┘
```

**Services:**
- **Web:** Python/Flask on Gunicorn (4 workers, gevent)
- **Database:** PostgreSQL (Railway-managed, auto-backup)
- **Cache/Queue:** Redis (Railway-managed)
- **AI:** Anthropic Claude API (claude-sonnet-4-20250514)
- **Sanctions:** OpenSanctions API + direct UN/OFAC/EU downloads

## 2. Health Endpoints

| Endpoint | Auth | Purpose | Expected |
|----------|------|---------|----------|
| `GET /api/health` | None | Load balancer probe | `{"status":"healthy"}` |
| `GET /api/ready` | None | Readiness check (DB + AI) | `{"ready":true}` |
| `GET /api/version` | None | Build info, uptime | `{"build":"...","version":"3.x"}` |
| `GET /api/admin/canary` | Admin | External dependency check | `{"overall":"healthy"}` |

## 3. Incident Response

### Severity Levels

| Level | Description | Response Time | Examples |
|-------|-------------|---------------|----------|
| **P0** | Service down, data loss risk | 15 min | DB unreachable, app crash loop |
| **P1** | Major feature broken | 1 hour | AI extraction failing, auth broken |
| **P2** | Degraded but functional | 4 hours | Sanctions API down (fallback active) |
| **P3** | Minor issue | Next business day | UI glitch, translation missing |

### P0 Response Procedure

1. **Confirm outage** — Check `/api/health` and `/api/ready`
2. **Check Railway dashboard** — Look for deploy failures, resource exhaustion
3. **Check logs** — `railway logs --tail 100` or Railway dashboard → Deployments → Logs
4. **Rollback if needed** — `git revert HEAD && git push origin main` (Railway auto-deploys)
5. **Notify stakeholders** — Email team with status, ETA
6. **Root cause** — After recovery, document in incident log

### Common Issues & Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `/api/health` returns 503 | App not started | Check Railway logs for startup errors |
| `/api/ready` shows `database: error` | PostgreSQL down | Check Railway PostgreSQL service health |
| AI extraction returns fallback data | Anthropic API key expired/quota | Check `ANTHROPIC_API_KEY` in Railway variables |
| Sanctions screening returns 404 | OpenSanctions API issue | System auto-falls back to direct UN/OFAC/EU downloads |
| Login returns 429 for all users | Rate limiter triggered | Check Redis connectivity; wait 5min for lockout to expire |

## 4. Dependency Outage Procedures

### Anthropic Claude API Down
- **Impact:** AI chat, scoring guidance, document extraction degrade
- **Fallback:** All AI functions have rule-based fallbacks built in
- **Detection:** `/api/admin/canary` shows `anthropic: degraded`
- **Action:** No immediate action needed. Fallbacks activate automatically. Monitor for recovery.

### OpenSanctions API Down
- **Impact:** Sanctions screening uses fallback
- **Fallback:** Direct downloads from UN XML, OFAC CSV, EU CSV
- **Detection:** `/api/admin/canary` shows `opensanctions: degraded`
- **Action:** Fallback is automatic. Direct list downloads cover UN, OFAC, EU. World Bank debarment list unavailable during outage.

### Redis Down
- **Impact:** Task state falls back to in-memory; rate limiting becomes per-instance
- **Fallback:** ThreadPoolExecutor with in-memory state
- **Detection:** Application logs will show Redis connection errors
- **Action:** Check Railway Redis service. Restart if needed. App continues functioning.

### PostgreSQL Down
- **Impact:** Full service outage (no auth, no data)
- **Fallback:** None — this is a P0
- **Detection:** `/api/ready` returns `database: error`
- **Action:** Check Railway PostgreSQL service immediately. Contact Railway support if persistent.

## 5. Security Operations

### Secret Rotation

| Secret | Location | Rotation Frequency | Procedure |
|--------|----------|-------------------|-----------|
| `ANTHROPIC_API_KEY` | Railway env var | 90 days | Generate new key at console.anthropic.com → Update Railway variable → Auto-redeploy |
| `OPENSANCTIONS_API_KEY` | Railway env var | 90 days | Generate at opensanctions.org → Update Railway variable |
| `DATABASE_URL` | Railway auto-managed | N/A | Railway manages PostgreSQL credentials |
| `REDIS_URL` | Railway auto-managed | N/A | Railway manages Redis credentials |
| Flask session secret | Generated at startup | Per deploy | Auto-generated; no manual rotation needed |

### Backup & Restore

- **Database:** Railway PostgreSQL includes automatic daily backups with 7-day retention
- **Manual backup:** `railway connect postgres` then `pg_dump > backup.sql`
- **Restore:** `railway connect postgres` then `psql < backup.sql`
- **File uploads:** Stored in `/uploads/` directory on Railway volume. Consider S3 migration for durability.

### Access Control

| Resource | Who Has Access | Least Privilege |
|----------|---------------|-----------------|
| Railway dashboard | Project owner (Idiris) | Limit to ops team only |
| Database (direct) | Via `railway connect` only | No external connections |
| Redis | Internal only | No public endpoint |
| GitHub repo | Private repo, owner access | Add collaborators as needed |
| Anthropic console | API key holder | Separate keys per environment |

### Audit Log Retention

- **Application audit logs:** Stored in PostgreSQL `audit_log` entries (via `log_action()`)
- **Login attempts:** Stored in `login_attempts` table, no automatic purge
- **Recommendation:** Implement 90-day retention policy for login_attempts, keep audit_log indefinitely
- **Railway logs:** Available via dashboard, retention per Railway plan

## 6. Monitoring & Alerts

### Recommended Monitoring Setup

| Check | Frequency | Alert If |
|-------|-----------|----------|
| `/api/health` | 60s | Non-200 for 2+ consecutive checks |
| `/api/ready` | 5min | `ready: false` |
| `/api/admin/canary` | 15min | `overall: degraded` for 30+ min |
| Railway metrics | Continuous | CPU > 80%, Memory > 90% |
| Error rate | 5min | > 5% of requests return 5xx |

### Auth Abuse Detection

The admin stats endpoint (`/api/admin/stats`) provides:
- `login_attempts_1h` / `login_attempts_24h` — spike detection
- `unique_ips_1h` — distributed attack detection
- `top_ips` — individual IP abuse
- `locked_accounts` — accounts under active lockout

**Note:** Test account traffic is automatically filtered from these metrics.

## 7. Deployment

### Standard Deploy
```bash
git push origin main  # Railway auto-deploys from GitHub
```

### Manual Deploy (if auto-deploy is off)
```bash
cd C:\Users\IdirisLoyan\kuja-grant
railway up --detach
```

### Pre-Deploy Gate
The smoke test hook runs automatically before `railway up`:
```bash
python smoke_test.py  # 14 tests, blocks deploy on failure
```

### Rollback
```bash
# Option 1: Git revert (preferred)
git revert HEAD
git push origin main

# Option 2: Railway dashboard → Deployments → select previous → Redeploy
```

### Database Migrations
```bash
# Run via Railway shell
railway run python -c "from app import create_app; from app.extensions import db; app = create_app(); app.app_context().push(); db.create_all()"
```

## 8. Support Workflows

### User Reports "Can't Login"
1. Check if account is locked: `GET /api/admin/stats` → `locked_accounts`
2. Lockout expires automatically after 15 minutes
3. If persistent: check `login_attempts` table for the email
4. If password forgotten: currently no self-service reset (manual DB update needed)

### User Reports "AI Not Working"
1. Check `/api/admin/canary` → Anthropic status
2. If `degraded`: API key may be expired or quota exceeded
3. If `ok`: Check specific endpoint logs for the user's request
4. All AI features have fallbacks — if AI is down, rule-based results still appear

### User Reports "Sanctions Check Failed"
1. Check `/api/admin/canary` → OpenSanctions status
2. If OpenSanctions is down, fallback to direct UN/OFAC/EU downloads activates automatically
3. If false positive: review the match score and matched entity in the compliance check detail

### User Reports "Upload Failed"
1. Check file size (max 16MB)
2. Check file type (PDF, DOCX, TXT, XLSX allowed)
3. Check if file has readable content (empty PDFs are rejected)
4. Check Railway logs for the specific upload error

## 9. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Railway auto-set) |
| `REDIS_URL` | Yes | Redis connection string (Railway auto-set) |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI features |
| `OPENSANCTIONS_API_KEY` | Yes | OpenSanctions API key for sanctions screening |
| `FLASK_SECRET_KEY` | No | Auto-generated if not set |
| `PORT` | No | Railway sets automatically |

## 10. Contact & Escalation

| Level | Contact | When |
|-------|---------|------|
| L1 — App issues | Development team | Feature bugs, UI issues |
| L2 — Infrastructure | Railway support | Service outages, scaling |
| L3 — AI/API | Anthropic support | API issues, quota |
| L4 — Security | Security team | Breach, unauthorized access |

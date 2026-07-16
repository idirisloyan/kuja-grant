# Proximate tenant domain + go-live setup

Status (2026-07-16): the Railway side is DONE — `proximate.adesoafrica.org`
is registered on the `web` service and the backend already routes that
hostname to the Proximate tenant (`host_aliases` seeded since Phase 627).
**The only remaining step for the domain is two DNS records at
adesoafrica.org's DNS provider.**

The same day, the shared `CRON_SECRET` was set on Railway + GitHub —
every scheduled job (grant reporting cadence, report nudges, sanctions
re-screen, donor retrospectives, …) had been failing auth since the
workflows were created. Verified fixed: the grant-reporting run now
returns `{"grants_walked":9,"reports_created":2,"success":true}`.

---

## 1. DNS records to add (owner: whoever manages adesoafrica.org DNS)

| Type  | Name                        | Value | TTL |
|-------|-----------------------------|-------|-----|
| CNAME | `proximate`                 | `2483qpw6.up.railway.app` | 300 |
| TXT   | `_railway-verify.proximate` | `railway-verify=railway-verify=d1ea0bbcb17004deb6e5cc4c0c7103c01a408ddf768524859a3233b006466c90` | 300 |

Values above are what the Railway CLI returned at registration. If the
DNS provider rejects the TXT value, copy it verbatim from
Railway → project `clever-cooperation` → service `web` →
Settings → Networking → Domains (that panel is the source of truth).

Railway auto-issues a Let's Encrypt certificate once the CNAME
resolves — usually < 5 minutes, up to 30. No app restart needed.

## 2. Verify (anyone, after DNS propagates)

```bash
dig +short proximate.adesoafrica.org
# → CNAME chain ending in *.up.railway.app

curl -s https://proximate.adesoafrica.org/api/network/current
# → JSON with "slug": "proximate"
```

Then in a browser: `https://proximate.adesoafrica.org` should show the
Proximate-branded login with Arabic as the default language — no tenant
switcher, no override header. Log in with any Proximate account and
confirm the data is the Proximate tenant's.

Gotcha: a tester whose browser was previously used with the tenant
switcher may have `kuja_network_override` in localStorage, which wins
over the hostname. Dev tools → Application → Local Storage → delete
that key.

## 3. Remaining go-live setups (priority order)

1. **Email delivery — currently log-only.** Set on Railway (`web`):
   `SENDGRID_API_KEY`, `MAIL_FROM=noreply@adesoafrica.org`,
   `MAIL_FROM_NAME=Proximate Fund`; authenticate the sender domain in
   SendGrid (their SPF/DKIM CNAMEs — add them in the same DNS session
   as step 1). Railway blocks outbound SMTP, so the SendGrid Web API
   path (which `EmailService` prefers) is the one that works. Until
   this is set, report nudges / retrospective notices / closing packs
   are recorded but not emailed.
2. **WhatsApp** — sender +254705529285 is live; six message templates
   are pending Meta approval. Once approved, wire the template SIDs
   into `app/services/messaging_service.py` (tracked backlog item).
3. **QCF donor seat** — QCF should change the temporary password on
   first login (grants@qc.foundation).
4. **Demo-data policy** — `SEED_PROXIMATE_ON_BOOT=true` refreshes demo
   fixtures on every restart. Keep while demoing; before external
   users land on the real domain, set it `false` on Railway and prune
   the UAT/demo rounds so OB consoles show only real data.
5. **Branding** — `brand_color_hex` is placeholder violet (#7C3AED);
   update it + logo when the Proximate brand spec lands.
6. **Optional second alias** — `proximate.kuja.org` is already in
   `host_aliases`; if wanted, repeat step 1 on kuja.org's DNS after
   `railway domain proximate.kuja.org --service web`.

## Code reference

Same wiring as NEAR (see `NEAR_DNS_SETUP.md`):
`Network.resolve_from_host()` in `app/models/network.py`, middleware in
`app/middleware.py::resolve_network_context`, Proximate `host_aliases`
seeded in `app/__init__.py` (Phase 627 block).

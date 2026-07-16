# Proximate tenant domain + go-live setup

Status (2026-07-16): the Railway side is DONE — `proximate.kuja.org`
(Idiris's decision, over the earlier adesoafrica.org option) is
registered on the `web` service and the backend already routes that
hostname to the Proximate tenant (`host_aliases` seeded since Phase 627).
**The only remaining step for the domain is two DNS records at
kuja.org's DNS provider.**

The same day, the shared `CRON_SECRET` was set on Railway + GitHub —
every scheduled job (grant reporting cadence, report nudges, sanctions
re-screen, donor retrospectives, …) had been failing auth since the
workflows were created. Verified fixed: the grant-reporting run now
returns `{"grants_walked":9,"reports_created":2,"success":true}`.

---

## 1. DNS records to add (owner: whoever manages kuja.org DNS)

| Type  | Name                        | Value | TTL |
|-------|-----------------------------|-------|-----|
| CNAME | `proximate`                 | `1zj8ev6l.up.railway.app` | 300 |
| TXT   | `_railway-verify.proximate` | `railway-verify=railway-verify=d1510a5526b115edfbe2d1d752728da76dce403f758b46334a5b41710d545e2a` | 300 |

Values above are what the Railway CLI returned at registration. If the
DNS provider rejects the TXT value, copy it verbatim from
Railway → project `clever-cooperation` → service `web` →
Settings → Networking → Domains (that panel is the source of truth).

Railway auto-issues a Let's Encrypt certificate once the CNAME
resolves — usually < 5 minutes, up to 30. No app restart needed.

## 2. Verify (anyone, after DNS propagates)

```bash
dig +short proximate.kuja.org
# → CNAME chain ending in *.up.railway.app

curl -s https://proximate.kuja.org/api/network/current
# → JSON with "slug": "proximate"
```

Then in a browser: `https://proximate.kuja.org` should show the
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
6. **Optional second alias** — `proximate.adesoafrica.org` is also in
   `host_aliases` and was registered on Railway earlier the same day
   (superseded by the kuja.org decision). It sits harmlessly as
   "pending" until DNS records exist; either add the records at
   adesoafrica.org's provider to activate it too, or delete the domain
   in Railway → web → Settings → Networking to keep the panel clean.

## Code reference

Same wiring as NEAR (see `NEAR_DNS_SETUP.md`):
`Network.resolve_from_host()` in `app/models/network.py`, middleware in
`app/middleware.py::resolve_network_context`, Proximate `host_aliases`
seeded in `app/__init__.py` (Phase 627 block).

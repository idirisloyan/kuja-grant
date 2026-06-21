# Mobile + low-bandwidth testing (Phase 615)

The Global South NGO target hits Kuja from phones, often on 3G, sometimes on edge of coverage. Desktop Playwright on a dev machine cannot reproduce the failure modes those users see: 60s timeouts, half-loaded JS chunks, stalled font loads, sticky CTAs that vanish when the keyboard pops up.

This doc describes how we test for those conditions before the team has to flag them.

## What `mobile_test.py` runs

`mobile_test.py` is a Playwright-Python script (sibling to `browser_test.py`) that:

1. Boots Chromium in a fresh context with a Pixel 5 viewport (393×851, devicePixelRatio 2.75) and the corresponding mobile UA string.
2. Throttles the network using CDP `Network.emulateNetworkConditions` to a "slow-3G" profile: 400kbps down, 400kbps up, 400ms latency.
3. Loads the critical user journeys end-to-end:
   - `/login` cold load → time-to-interactive < 15s, sign-in form visible, demo cards visible
   - `/dashboard/` after NGO login → first attention item visible < 12s, no JS error in console
   - `/applications/<id>/` for an NGO-owned draft → StickyMobileCta visible at viewport bottom, primary action `aria-label` includes "Continue editing"
   - `/applications/<id>/` for the same draft after scrolling 1500px → StickyMobileCta still visible (sticky behavior intact)
4. Captures three artifacts per scenario:
   - Screenshot of the loaded viewport (mobile dimensions)
   - HAR of the network exchange (for analyzing chunk fetch sequence)
   - Console-error log (so first-paint JS errors are visible)

Exit code 0 on all-pass, 1 on any failure.

## Running locally

```bash
# Against prod (most realistic — Railway latency + real chunk sizes)
KUJA_URL=https://web-production-6f8a.up.railway.app py -3 mobile_test.py

# Against a running local dev server (fastest iteration)
py -3 mobile_test.py --base http://127.0.0.1:5000
```

The script lazy-installs Playwright Chromium if the binary is missing (one-time cost ~150MB).

## Why this exists

Symptom we kept hitting before Phase 615: every 2-3 UAT cycles the team flagged a login or dashboard timeout from a teammate's phone, but the desktop suite saw nothing because desktop has 100Mbps and zero packet loss. We had no way to triage "is this a real bug or a one-off network blip" without asking the user to record screen and resend.

`mobile_test.py` lets us:
- **Reproduce** mobile timeouts deterministically (the slow-3G profile is a documented CDP standard, not a moving target).
- **Catch regressions** when a deploy ships extra JS to /login or makes the NetworkProvider bootstrap blocking.
- **Quantify wins**: Phase 614 added immutable cache headers on `_next/static/*`, so /login second-visit in `mobile_test.py` should now be under 1s. If it isn't, the cache header change regressed.

## What this does NOT test

- Real-device specifics (battery throttling, low-RAM swap pressure, browser variants like Samsung Internet) — those still need a real phone, but at least we no longer find the broken-network class of bugs there.
- Push notifications on iOS Safari.
- Offline mode beyond a single page reload — the PWA SW test belongs in `browser_test.py`'s offline suite.

## When to add a scenario

Add a new scenario to `mobile_test.py` whenever:
- A new flagship surface ships (e.g. a new sticky CTA target)
- A user reports a phone-only failure that the desktop suite missed
- We want a perf budget for a specific page (e.g. /apply/[id])

The pattern: write the assertion in terms of *what the NGO needs to see*, not *what the DOM happens to expose*. Visible CTA in the thumb zone, not "selector `[data-slot=sticky-cta]` exists in DOM."

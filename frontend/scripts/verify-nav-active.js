#!/usr/bin/env node
/**
 * Guard for the sidebar's active-item rule.
 *
 * PRX-UI-PARTNERS-001: standing on /proximate/admin/partners lit up BOTH
 * Dashboard and Partners, because the dashboard's href is a strict prefix of
 * the partners href and the old test was `pathname.startsWith(href + '/')`.
 * The user could not tell which section they were in.
 *
 * There is no test runner in the frontend, so this lifts the shipped
 * `activeNavHref` out of sidebar.tsx and exercises it against the real nav
 * shapes. Lifting the source rather than re-implementing it is the point: a
 * copy of the logic would keep passing after the real one regressed.
 *
 * Run: node frontend/scripts/verify-nav-active.js   (also `npm run verify:nav`)
 */

const fs = require('fs');
const path = require('path');

const SIDEBAR = path.join(__dirname, '..', 'src', 'components', 'layout', 'sidebar.tsx');

function loadActiveNavHref() {
  const src = fs.readFileSync(SIDEBAR, 'utf8');
  const match = src.match(/export function activeNavHref[\s\S]*?\n\}/);
  if (!match) {
    console.error('✗ Could not find activeNavHref in sidebar.tsx — did it move or get renamed?');
    process.exit(1);
  }
  const js = match[0]
    .replace('export function', 'function')
    .replace(/: string \| null/g, '')
    .replace(/: string\[\]/g, '');
  // eslint-disable-next-line no-eval
  return eval(`${js}; activeNavHref`);
}

const activeNavHref = loadActiveNavHref();

// The Proximate operator nav — the shape that exposed the bug. Dashboard is a
// strict prefix of partners, endorsers and messages.
const PROXIMATE = [
  '/proximate/admin',
  '/proximate/grants',
  '/proximate/rounds',
  '/proximate/admin/partners',
  '/proximate/admin/endorsers',
  '/proximate/admin/messages',
  '/proximate/crisis-selector',
  '/proximate/disbursements',
  '/proximate/donor#ask',
];

const CASES = [
  [PROXIMATE, '/proximate/admin', '/proximate/admin', 'dashboard itself'],
  [PROXIMATE, '/proximate/admin/', '/proximate/admin', 'trailing slash is not a different route'],
  [PROXIMATE, '/proximate/admin/partners/', '/proximate/admin/partners', 'THE BUG: partners must beat dashboard'],
  [PROXIMATE, '/proximate/admin/partners/new/', '/proximate/admin/partners', 'a child page still marks its section'],
  [PROXIMATE, '/proximate/admin/endorsers/', '/proximate/admin/endorsers', 'endorsers: same collision shape'],
  [PROXIMATE, '/proximate/admin/messages/', '/proximate/admin/messages', 'messages: same collision shape'],
  [PROXIMATE, '/proximate/disbursements/', '/proximate/disbursements', 'sibling section unaffected'],
  [PROXIMATE, '/proximate/rounds/15/', '/proximate/rounds', 'round detail marks rounds'],
  [PROXIMATE, '/proximate/donor', null, 'a hash-only entry addresses a section, not a route'],
  [PROXIMATE, '/settings/', null, 'unrelated path marks nothing'],
  [PROXIMATE, null, null, 'null pathname (first paint) marks nothing'],
  // Generic: a prefix must never win over a longer match, whatever the tenant.
  [['/a', '/a/b', '/a/b/c'], '/a/b/c/d', '/a/b/c', 'longest match always wins'],
];

let pass = 0;
const failures = [];
for (const [nav, pathname, want, why] of CASES) {
  const got = activeNavHref(pathname, nav);
  if (got === want) {
    pass++;
  } else {
    failures.push(`  ✗ ${String(pathname)} → ${String(got)} (wanted ${String(want)}) — ${why}`);
  }
}

if (failures.length) {
  console.error(`✗ sidebar active-state: ${failures.length} failed, ${pass} passed`);
  failures.forEach((f) => console.error(f));
  console.error('\nExactly one nav item may be active. See PRX-UI-PARTNERS-001.');
  process.exit(1);
}
console.log(`✓ sidebar active-state: ${pass}/${CASES.length} — exactly one nav item active, longest match wins.`);

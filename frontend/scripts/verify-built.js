#!/usr/bin/env node
/**
 * Guard: fail if the committed static/nextjs/ export is stale relative to the
 * frontend source. Railway serves the committed export and does NOT rebuild
 * the frontend, so a source-only change silently ships nothing. This is the
 * gate that makes that impossible to miss.
 *
 * Run locally:  cd frontend && npm run verify:built
 * Run in CI:    node frontend/scripts/verify-built.js   (see .github/workflows/frontend-build-sync.yml)
 *
 * Passes when static/nextjs/.source-hash matches the current source
 * fingerprint; exits 1 (with a fix hint) otherwise.
 */
const fs = require('fs');
const path = require('path');
const { fingerprint } = require('./source-fingerprint');

const STAMP = path.join(__dirname, '..', '..', 'static', 'nextjs', '.source-hash');

function fail(msg) {
  console.error(`✗ ${msg}`);
  console.error('  Fix: cd frontend && npm run build, then commit the regenerated static/nextjs/.');
  process.exit(1);
}

if (!fs.existsSync(STAMP)) {
  fail('static/nextjs/.source-hash is missing — the committed export predates the build-sync guard.');
}

const committed = fs.readFileSync(STAMP, 'utf8').trim();
const current = fingerprint();

if (committed !== current) {
  console.error('✗ Frontend source changed but static/nextjs/ was NOT rebuilt.');
  console.error(`  committed build fingerprint: ${committed.slice(0, 16)}…`);
  console.error(`  current source fingerprint:  ${current.slice(0, 16)}…`);
  fail('The live site would keep serving the old UI.');
}

console.log(`✓ static/nextjs/ is in sync with frontend source (${current.slice(0, 12)}…).`);

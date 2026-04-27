#!/usr/bin/env node
/**
 * Build pipeline copy step. Replaces the inline `node -e` from package.json.
 *
 * Critical: cleans `../static/nextjs/` BEFORE copying so old chunks from
 * prior builds don't accumulate. Without this, a browser holding an old
 * cached HTML reference can fetch obsolete chunks (e.g., a stale 926-*.js)
 * that contain hardcoded English from before the i18n wiring — which is
 * exactly the regression the team flagged ("phrases still visible in
 * English during live language-switch retest").
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'out');
const DST = path.join(__dirname, '..', '..', 'static', 'nextjs');

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) {
      rmrf(full);
      fs.rmdirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
}

function cp(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const f of fs.readdirSync(s)) {
    const sp = path.join(s, f);
    const dp = path.join(d, f);
    if (fs.statSync(sp).isDirectory()) cp(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`Build output missing: ${SRC} — run 'next build' first.`);
  process.exit(1);
}

console.log(`Cleaning ${DST} (removes stale chunks from prior builds)…`);
rmrf(DST);

console.log(`Copying ${SRC} → ${DST}…`);
cp(SRC, DST);

// Sanity report — lets the deploy log show which chunks the new build ships.
const chunksDir = path.join(DST, '_next', 'static', 'chunks');
if (fs.existsSync(chunksDir)) {
  const count = (function walk(p) {
    let n = 0;
    for (const f of fs.readdirSync(p, { withFileTypes: true })) {
      if (f.isDirectory()) n += walk(path.join(p, f.name));
      else n += 1;
    }
    return n;
  })(chunksDir);
  console.log(`Shipped ${count} chunk file(s).`);
}

console.log('Copied Next.js output to static/nextjs/');

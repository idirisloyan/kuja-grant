#!/usr/bin/env node
/**
 * Deterministic fingerprint of the frontend BUILD INPUTS (source that
 * affects the exported output). Shared by:
 *   - copy-build.js   → stamps the fingerprint into static/nextjs/.source-hash
 *   - verify-built.js → recomputes it and fails if the committed export is stale
 *
 * Why this exists: Railway serves the *committed* static/nextjs/ export and
 * never rebuilds the frontend. So editing frontend/src without re-running
 * `npm run build` silently ships nothing. This fingerprint makes that drift
 * detectable in CI and locally.
 *
 * The fingerprint is line-ending agnostic (text files are normalised to LF)
 * so a Windows CRLF working tree and a Linux LF CI checkout hash identically.
 * The Next build ID / chunk hashes are OUTPUT, not inputs, so their
 * per-build randomness never affects this value.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FRONTEND = path.join(__dirname, '..');

// Extensions treated as text (line endings normalised before hashing).
// Anything else (fonts, raster images) is hashed as raw bytes.
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json',
  '.css', '.scss', '.sass', '.md', '.mdx', '.svg', '.txt',
  '.html', '.yml', '.yaml', '.webmanifest',
]);

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
}

/** Return a sha256 hex fingerprint of the frontend build inputs. */
function fingerprint() {
  const files = [];
  // Directory inputs — everything the build reads to produce the export.
  walk(path.join(FRONTEND, 'src'), files);
  walk(path.join(FRONTEND, 'public'), files);
  walk(path.join(FRONTEND, 'messages'), files); // i18n catalogs, if present
  // Single-file inputs that change output when edited.
  for (const f of ['package-lock.json', 'next.config.js', 'tailwind.config.ts', 'tailwind.config.js']) {
    const abs = path.join(FRONTEND, f);
    if (fs.existsSync(abs)) files.push(abs);
  }

  const hash = crypto.createHash('sha256');
  // Sort by repo-relative POSIX path so ordering is OS-independent.
  const sorted = files
    .map((abs) => ({ abs, rel: path.relative(FRONTEND, abs).split(path.sep).join('/') }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  for (const { abs, rel } of sorted) {
    hash.update(rel);
    hash.update('\0');
    let buf = fs.readFileSync(abs);
    if (TEXT_EXT.has(path.extname(rel).toLowerCase())) {
      buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    }
    hash.update(buf);
    hash.update('\0');
  }
  return hash.digest('hex');
}

module.exports = { fingerprint };

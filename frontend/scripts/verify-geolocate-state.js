#!/usr/bin/env node
/**
 * Guard for the coarse "which Sudanese state is this position in?" lookup.
 *
 * The lookup uses nearest-state-centre rather than boundary polygons, so its
 * accuracy is a real question rather than an assumption. This checks it against
 * the true coordinates of a town in each of the 18 states, and asserts that a
 * position outside Sudan is reported as outside rather than snapped to the
 * least-wrong state.
 *
 * It also asserts the ambiguity behaviour: near a border the function must
 * return confident:false so the UI asks the person to confirm. Silently
 * choosing between two adjacent states is how a register fills with data that
 * looks precise and is wrong.
 *
 * Run: node frontend/scripts/verify-geolocate-state.js  (npm run verify:geo)
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'lib', 'geography.ts');
const src = fs.readFileSync(SRC, 'utf8');

// Pull the shipped state table and the shipped functions out of the TS, so this
// exercises the real thing rather than a copy that can drift.
const SUDAN_STATES = [];
const stateRe = /\{\s*code:\s*'(SD-[A-Z]{2})',\s*name:\s*'([^']+)',\s*nameAr:\s*'([^']*)',\s*centre:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*\}/g;
let m;
while ((m = stateRe.exec(src)) !== null) {
  SUDAN_STATES.push({ code: m[1], name: m[2], nameAr: m[3], centre: [Number(m[4]), Number(m[5])] });
}
if (SUDAN_STATES.length !== 18) {
  console.error(`✗ Expected 18 states with centres, parsed ${SUDAN_STATES.length}.`);
  process.exit(1);
}

/**
 * Extract one function by counting braces. A regex cannot find the end of a
 * function body reliably, and an over-matching one silently swallowed the next
 * function when this was first written — which produced a confident, wrong
 * "2 towns failed" result. Count the braces.
 */
function lift(name) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) { console.error(`✗ Could not find ${name}() in geography.ts`); process.exit(1); }
  const bodyStart = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) { console.error(`✗ Unbalanced braces reading ${name}()`); process.exit(1); }
  // Strip the TypeScript annotations this file uses; the bodies are plain JS.
  // Return types sit between the arg list and the body, so they must go too.
  return src.slice(start, end)
    .replace(/\)\s*:\s*[A-Za-z]+\s*\{/, ') {')
    .replace(/(\w+)\s*:\s*number/g, '$1');
}
// eslint-disable-next-line no-eval
// NOTE: direct eval() shares this scope, so the binding we assign into must not
// share a name with the function being declared inside it.
const resolveState = eval(`${lift('haversineKm')}; ${lift('stateFromCoords')}; stateFromCoords`);

// One real town per state, with the state it is actually in.
const TOWNS = [
  ['Khartoum', 15.5007, 32.5599, 'Khartoum'],
  ['Omdurman', 15.6445, 32.4777, 'Khartoum'],
  ['Wad Madani', 14.4012, 33.5199, 'Al Jazirah'],
  ['Atbara', 17.7022, 33.9865, 'River Nile'],
  ['Dongola', 19.1680, 30.4750, 'Northern'],
  ['Port Sudan', 19.6158, 37.2164, 'Red Sea'],
  ['Kassala', 15.4510, 36.4000, 'Kassala'],
  ['Gedaref', 14.0354, 35.3837, 'Al Qadarif'],
  ['Sennar town', 13.5500, 33.6000, 'Sennar'],
  ['Ed Damazin', 11.7890, 34.3598, 'Blue Nile'],
  ['Kosti', 13.1629, 32.6635, 'White Nile'],
  ['El Obeid', 13.1842, 30.2167, 'North Kordofan'],
  ['Kadugli', 11.0111, 29.7183, 'South Kordofan'],
  ['El Fula', 11.7333, 28.3500, 'West Kordofan'],
  ['El Fasher', 13.6279, 25.3494, 'North Darfur'],
  ['Nyala', 12.0489, 24.8807, 'South Darfur'],
  ['El Geneina', 13.4526, 22.4450, 'West Darfur'],
  ['Ed Daein', 11.4614, 26.1250, 'East Darfur'],
  ['Zalingei', 12.9092, 23.4706, 'Central Darfur'],
];

const OUTSIDE = [['Cairo', 30.04, 31.24], ['Nairobi', -1.29, 36.82], ['Juba', 4.85, 31.58]];

let correct = 0; let flagged = 0; const wrong = [];
for (const [town, lat, lng, want] of TOWNS) {
  const r = resolveState(lat, lng);
  const got = r.kind === 'suggestion' ? r.state.name : r.kind;
  if (got === want) {
    correct++;
    if (r.kind === 'suggestion' && !r.confident) flagged++;
  } else {
    // A wrong answer is only tolerable if the function ADMITS it is unsure and
    // the true state is the alternative it offers.
    const rescued = r.kind === 'suggestion' && !r.confident && r.alternative && r.alternative.name === want;
    if (rescued) { correct++; flagged++; } else wrong.push(`  ✗ ${town}: got ${got}, expected ${want}`);
  }
}

const outsideOk = OUTSIDE.every(([, lat, lng]) => resolveState(lat, lng).kind === 'outside_known_area');

if (wrong.length || !outsideOk) {
  console.error(`✗ state lookup: ${wrong.length} wrong of ${TOWNS.length}`);
  wrong.forEach((w) => console.error(w));
  if (!outsideOk) console.error('  ✗ a position outside Sudan was snapped to a Sudanese state instead of being reported as outside');
  process.exit(1);
}
console.log(`✓ state lookup: ${correct}/${TOWNS.length} towns resolved (${flagged} correctly asked the user to confirm), and Cairo/Nairobi/Juba all report outside_known_area.`);

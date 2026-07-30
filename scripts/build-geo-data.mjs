#!/usr/bin/env node
/**
 * Generate src/data/counties.generated.ts from authoritative US Census data.
 *
 *   npm run geo:build              # download from the Census Bureau
 *   npm run geo:build -- <file>    # use an already-downloaded gazetteer file
 *
 * Why this is a script and not a checked-in hand-written list: there are ~3,143
 * counties and county-equivalents, the names have irregular spellings
 * (St. vs Saint, DeKalb vs De Kalb, Doña Ana), and Louisiana uses parishes
 * while Alaska uses boroughs and census areas. Transcribing that by hand
 * produces data that is wrong in ways nobody notices — a misspelled county
 * silently returns no search results rather than raising an error.
 *
 * Source: US Census Bureau Gazetteer Files (public domain), counties record.
 * https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html
 *
 * The generated file is committed, so a fresh clone works without running this.
 * Re-run it when the Census publishes a new vintage (county changes are rare —
 * Connecticut's 2022 switch to planning regions is the notable recent one).
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const YEAR = process.env.GAZETTEER_YEAR ?? "2023";
const GAZETTEER_URL = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${YEAR}_Gazetteer/${YEAR}_Gaz_counties_national.zip`;
const PLAIN_URL = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${YEAR}_Gazetteer/${YEAR}_Gaz_counties_national.txt`;

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, "src/data/counties.generated.ts");

/**
 * The gazetteer is a tab-separated file whose columns are:
 *   USPS  GEOID  ANSICODE  NAME  ALAND  AWATER  ALAND_SQMI  AWATER_SQMI  INTPTLAT  INTPTLONG
 * We need USPS, GEOID (the 5-digit FIPS) and NAME.
 */
function parseGazetteer(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines[0].split("\t").map((h) => h.trim());

  const uspsIndex = header.indexOf("USPS");
  const geoidIndex = header.indexOf("GEOID");
  const nameIndex = header.indexOf("NAME");
  if (uspsIndex === -1 || geoidIndex === -1 || nameIndex === -1) {
    throw new Error(`Unexpected gazetteer columns: ${header.join(", ")}`);
  }

  const byState = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    const state = cols[uspsIndex]?.trim();
    const fips = cols[geoidIndex]?.trim();
    const name = cols[nameIndex]?.trim();
    if (!state || !fips || !name) continue;

    if (!byState.has(state)) byState.set(state, []);
    byState.get(state).push({ fips, name });
  }

  for (const list of byState.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "en"));
  }
  return byState;
}

async function loadSource() {
  const argPath = process.argv[2];
  if (argPath) {
    const path = resolve(process.cwd(), argPath);
    if (!existsSync(path)) throw new Error(`No such file: ${path}`);
    console.log(`Reading ${path}`);
    return readFileSync(path, "utf8");
  }

  console.log(`Downloading ${PLAIN_URL}`);
  const response = await fetch(PLAIN_URL);
  if (!response.ok) {
    throw new Error(
      `Census download failed (${response.status}). Download the counties gazetteer manually ` +
        `from ${GAZETTEER_URL}, unzip it, and pass the .txt path as an argument.`,
    );
  }
  // The gazetteer files are Latin-1, not UTF-8 — "Doña Ana" arrives mangled if
  // you decode them as UTF-8.
  const buffer = await response.arrayBuffer();
  return new TextDecoder("latin1").decode(buffer);
}

function render(byState) {
  const states = [...byState.keys()].sort();
  const entries = states
    .map((state) => {
      const counties = byState
        .get(state)
        .map((c) => `    ["${c.fips}", ${JSON.stringify(c.name)}],`)
        .join("\n");
      return `  ${state}: [\n${counties}\n  ],`;
    })
    .join("\n");

  const total = states.reduce((sum, s) => sum + byState.get(s).length, 0);

  return `// GENERATED FILE — do not edit by hand.
//
// Source: US Census Bureau ${YEAR} Gazetteer Files, counties national record
// (public domain). Regenerate with: npm run geo:build
//
// ${total} counties and county-equivalents across ${states.length} states and territories.
// Names are exactly as the Census publishes them, including the "County",
// "Parish", "Borough", "Census Area" and "city" suffixes — those are part of
// the official name and are needed to build a correct Places query.

/** State code -> [FIPS, official county name] pairs, sorted by name. */
export const COUNTIES_BY_STATE: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
${entries}
};

export const COUNTY_COUNT = ${total};
export const GAZETTEER_VINTAGE = "${YEAR}";
`;
}

const source = await loadSource();
const byState = parseGazetteer(source);
const total = [...byState.values()].reduce((sum, list) => sum + list.length, 0);

if (total < 3000) {
  throw new Error(
    `Only parsed ${total} counties — expected ~3,143. Refusing to write a partial file.`,
  );
}

writeFileSync(outputPath, render(byState), "utf8");
console.log(`Wrote ${outputPath}: ${total} counties across ${byState.size} states.`);

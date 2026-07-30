/**
 * Pure geographic lookups over the bundled datasets. No I/O.
 *
 * This module — not `zips.seed.ts` directly — is what the rest of the app
 * imports, so swapping the seed for a full generated dataset later touches one
 * file. It also owns the small amount of math (radius filtering, distance)
 * that turns "a list of ZIPs" into "ZIPs within N miles of this one".
 *
 * `zips.seed.ts` is intentionally not re-exported wholesale: pulling the
 * dataset into a client bundle would be the bug this file exists to prevent
 * once a full ~41,700-row dataset replaces the seed. Reach it only through the
 * functions here, and reach *those* only from server code
 * (`src/lib/geo.functions.ts`), never from a route or component directly.
 */

import { areaCodesForState } from "@/data/area-codes";
import { countiesForState, countyDisplayName } from "@/data/counties";
import { ZIP_SEED, type ZipEntry } from "@/data/zips.seed";

const BY_ZIP = new Map(ZIP_SEED.map((z) => [z.zip, z]));

export function zipToEntry(zip: string | null | undefined): ZipEntry | null {
  if (typeof zip !== "string") return null;
  return BY_ZIP.get(zip.trim()) ?? null;
}

export function zipToCentroid(zip: string | null | undefined): { lat: number; lng: number } | null {
  const entry = zipToEntry(zip);
  return entry ? { lat: entry.lat, lng: entry.lng } : null;
}

export function zipToCounty(zip: string | null | undefined): string | null {
  return zipToEntry(zip)?.county ?? null;
}

export function isValidZip(zip: string | null | undefined): boolean {
  return typeof zip === "string" && /^\d{5}$/.test(zip.trim());
}

/** Is this ZIP one we have geo data for? Distinct from `isValidZip`, which is only a shape check. */
export function isKnownZip(zip: string | null | undefined): boolean {
  return zipToEntry(zip) !== null;
}

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance between two points, in miles. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function milesToMeters(miles: number): number {
  return miles * 1609.344;
}

/**
 * Every known ZIP within `radiusMiles` of `zip`, nearest first, including
 * `zip` itself.
 *
 * Returns `[]` for a ZIP with no bundled centroid rather than throwing —
 * callers (the discover phase of a search job) treat that as "nothing to
 * expand from" and fall back to the bare ZIP.
 */
export function zipsWithinRadius(
  zip: string | null | undefined,
  radiusMiles: number,
): readonly ZipEntry[] {
  const center = zipToCentroid(zip);
  if (!center) return [];

  return ZIP_SEED.filter((z) => haversineMiles(center, z) <= radiusMiles).sort(
    (a, b) => haversineMiles(center, a) - haversineMiles(center, b),
  );
}

/**
 * ZIPs in a given county, for the State + County search mode.
 *
 * `stateCounties`/`countyDisplayName` accept the bare county name ("Knox");
 * this compares case-insensitively against the ZIP dataset's stored county
 * field, which is also bare.
 */
export function zipsForCounty(state: string, county: string): readonly ZipEntry[] {
  const upperState = state.trim().toUpperCase();
  const needle = county.trim().toLowerCase();
  return ZIP_SEED.filter((z) => z.state === upperState && z.county.toLowerCase() === needle);
}

/**
 * A representative ZIP queue for an area code — one entry per known city the
 * code serves, since a full area-code-to-ZIP mapping isn't in the seed data.
 *
 * This queue seeds the discover phase of an area-code search
 * (`searches.cursor.zipQueue`); the *actual* filter that makes area-code
 * results correct is the phone-number post-filter applied to each candidate,
 * not this queue's precision — see verification.ts / the search job engine.
 */
export function zipsForAreaCodeCities(
  code: string,
  cities: readonly string[],
): readonly ZipEntry[] {
  const wanted = new Set(cities.map((c) => c.toLowerCase()));
  return ZIP_SEED.filter((z) => wanted.has(z.city.toLowerCase()));
}

export { countiesForState, countyDisplayName, areaCodesForState };

/**
 * Server functions that expose src/data/geo.ts (and the ZIP dataset behind it)
 * to the browser.
 *
 * This indirection exists because the ZIP dataset is meant to grow to the full
 * ~41,700-row USPS set (see zips.seed.ts), which must never enter the client
 * bundle. `eslint.config.js` blocks a direct import of `@/data/zips.seed`
 * outside server files as a second line of defence — this file is the one
 * approved way the UI reaches it.
 *
 * States and counties are small enough to ship to the browser directly
 * (`@/data/states`, `@/data/counties`) and don't need a round trip; only the
 * ZIP-backed lookups are server functions.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isKnownZip,
  listKnownAreas,
  zipToEntry,
  zipsForAreaCodeCities,
  zipsForCounty,
  zipsWithinRadius,
} from "@/data/geo";
import { areaCodeInfo } from "@/data/area-codes";

const zipSchema = z.object({ zip: z.string().regex(/^\d{5}$/, "Enter a 5-digit ZIP code") });

/** Look up a ZIP's city, state and county for live form feedback. */
export const lookupZip = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(zipSchema)
  .handler(async ({ data }) => {
    const entry = zipToEntry(data.zip);
    return entry
      ? { found: true as const, city: entry.city, state: entry.state, county: entry.county }
      : { found: false as const };
  });

const zipRadiusSchema = z.object({
  zip: z.string().regex(/^\d{5}$/),
  radiusMiles: z.number().int().min(1).max(100),
});

/** ZIPs within a radius, nearest first. Used by the discover phase's ZIP queue. */
export const listZipsInRadius = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(zipRadiusSchema)
  .handler(async ({ data }) => {
    return zipsWithinRadius(data.zip, data.radiusMiles).map((z) => z.zip);
  });

const countyZipsSchema = z.object({ state: z.string().length(2), county: z.string().min(1) });

/** ZIPs in a county. Used to seed the queue for a State + County search. */
export const listZipsInCounty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(countyZipsSchema)
  .handler(async ({ data }) => {
    return zipsForCounty(data.state, data.county).map((z) => z.zip);
  });

const areaCodeZipsSchema = z.object({ areaCode: z.string().regex(/^[2-9][0-9]{2}$/) });

/**
 * A representative ZIP queue for an area code's known cities.
 *
 * See `zipsForAreaCodeCities` — this seeds discovery only; the actual
 * area-code correctness comes from a post-filter on the candidate's phone
 * number, applied in the search job's verify phase.
 */
export const listZipsForAreaCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(areaCodeZipsSchema)
  .handler(async ({ data }) => {
    const info = areaCodeInfo(data.areaCode);
    if (!info) return { found: false as const, zips: [] as string[] };
    return {
      found: true as const,
      zips: zipsForAreaCodeCities(data.areaCode, info.cities).map((z) => z.zip),
    };
  });

/** Known city/state areas for the "choose a known area" ZIP form shortcut. */
export const listAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => listKnownAreas());

/** Whether the bundled ZIP data covers a code at all — used to warn the user. */
export const checkZipCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(zipSchema)
  .handler(async ({ data }) => ({ known: isKnownZip(data.zip) }));

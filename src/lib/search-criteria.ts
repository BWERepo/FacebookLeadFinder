/**
 * Zod schemas for the three search modes, shared by the client form and the
 * `startSearch` server function so validation can never diverge between them.
 */

import { z } from "zod";

import { isValidStateCode } from "@/data/states";

// A comma-joined list of one or more category labels — the Find Leads form's
// category picker supports selecting several presets (plus one custom entry)
// at once. Generous max length since several full preset labels can be
// joined together.
const categorySchema = z.string().trim().max(300).default("");
const maxResultsSchema = z.number().int().min(1).max(500).default(100);

// A plain shape check, deliberately not imported from @/data/geo: that module
// pulls in the ZIP dataset at module scope, and this schema runs in the
// browser (the Find Leads form validates client-side before submit). Whether a
// ZIP is one we have geo data for is a separate, server-only question, checked
// by startSearch via @/lib/geo.functions after this schema passes.
const isZipShaped = (v: string) => /^\d{5}$/.test(v);

export const zipRadiusCriteriaSchema = z.object({
  searchType: z.literal("zip_radius"),
  zip: z.string().trim().refine(isZipShaped, "Enter a 5-digit ZIP code"),
  radiusMiles: z.number().int().min(1).max(100).default(10),
  category: categorySchema,
  maxResults: maxResultsSchema,
});

export const areaCodeCriteriaSchema = z.object({
  searchType: z.literal("area_code"),
  areaCode: z
    .string()
    .trim()
    .refine((v) => /^[2-9][0-9]{2}$/.test(v), "Enter a 3-digit area code"),
  city: z.string().trim().max(100).default(""),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || isValidStateCode(v), "Unknown state")
    .default(""),
  category: categorySchema,
  maxResults: maxResultsSchema,
});

export const stateCountyCriteriaSchema = z.object({
  searchType: z.literal("state_county"),
  state: z.string().trim().toUpperCase().refine(isValidStateCode, "Choose a state"),
  county: z.string().trim().min(1, "Choose a county"),
  city: z.string().trim().max(100).default(""),
  category: categorySchema,
  maxResults: maxResultsSchema,
});

export const searchCriteriaSchema = z.discriminatedUnion("searchType", [
  zipRadiusCriteriaSchema,
  areaCodeCriteriaSchema,
  stateCountyCriteriaSchema,
]);

export type ZipRadiusCriteria = z.infer<typeof zipRadiusCriteriaSchema>;
export type AreaCodeCriteria = z.infer<typeof areaCodeCriteriaSchema>;
export type StateCountyCriteria = z.infer<typeof stateCountyCriteriaSchema>;
export type SearchCriteria = z.infer<typeof searchCriteriaSchema>;

/** A short, human-readable description of the criteria for history/labels. */
export function describeCriteria(criteria: SearchCriteria): string {
  switch (criteria.searchType) {
    case "zip_radius":
      return `${criteria.zip} + ${criteria.radiusMiles} mi${criteria.category ? ` — ${criteria.category}` : ""}`;
    case "area_code":
      return `Area code ${criteria.areaCode}${criteria.city ? ` — ${criteria.city}` : ""}${criteria.category ? ` — ${criteria.category}` : ""}`;
    case "state_county":
      return `${criteria.county}, ${criteria.state}${criteria.city ? ` — ${criteria.city}` : ""}${criteria.category ? ` — ${criteria.category}` : ""}`;
  }
}

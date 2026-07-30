/**
 * Business categories.
 *
 * The presets mirror
 * supabase/migrations/20260801001000_seed_reference_data.sql — that migration
 * is the editable copy users can extend; this is the copy the search forms and
 * the mock provider use without a database round trip.
 * `categories.test.ts` asserts the two stay in step.
 *
 * Users can also type a custom category, which is why `slugify` exists: it
 * turns free text into the same shape a preset slug has, so a lead tagged
 * "Pool Cleaning" and one tagged "pool cleaning" land in one bucket on the
 * dashboard chart.
 */

export type CategoryPreset = {
  slug: string;
  label: string;
  sortOrder: number;
};

export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
  { slug: "auto_repair", label: "Auto repair", sortOrder: 10 },
  { slug: "restaurants", label: "Restaurants", sortOrder: 20 },
  { slug: "contractors", label: "Contractors", sortOrder: 30 },
  { slug: "plumbers", label: "Plumbers", sortOrder: 40 },
  { slug: "hvac", label: "HVAC companies", sortOrder: 50 },
  { slug: "electricians", label: "Electricians", sortOrder: 60 },
  { slug: "hair_salons", label: "Hair salons", sortOrder: 70 },
  { slug: "barbers", label: "Barbers", sortOrder: 80 },
  { slug: "retail", label: "Retail stores", sortOrder: 90 },
  { slug: "cleaning", label: "Cleaning services", sortOrder: 100 },
  { slug: "landscaping", label: "Landscaping companies", sortOrder: 110 },
  { slug: "dentists", label: "Dentists", sortOrder: 120 },
  { slug: "real_estate", label: "Real estate agents", sortOrder: 130 },
  { slug: "photographers", label: "Photographers", sortOrder: 140 },
  { slug: "bakeries", label: "Bakeries", sortOrder: 150 },
  { slug: "craft", label: "Craft businesses", sortOrder: 160 },
  { slug: "home_services", label: "Home services", sortOrder: 170 },
  { slug: "other", label: "Other", sortOrder: 999 },
] as const;

export const OTHER_CATEGORY_SLUG = "other";

const PRESETS_BY_SLUG = new Map(CATEGORY_PRESETS.map((c) => [c.slug, c]));

/**
 * Turn arbitrary user text into a category slug.
 *
 * Matches the `^[a-z0-9]+(_[a-z0-9]+)*$` CHECK constraint on
 * public.business_categories. Returns `null` when nothing usable is left, so
 * callers fall back to "other" rather than writing an empty slug.
 */
export function slugifyCategory(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug === "" ? null : slug.slice(0, 60);
}

/** Display label for a slug, falling back to a readable form of the slug. */
export function categoryLabel(
  slug: string | null | undefined,
  custom: readonly CategoryPreset[] = [],
): string {
  if (!slug) return "Uncategorized";
  const preset = PRESETS_BY_SLUG.get(slug) ?? custom.find((c) => c.slug === slug);
  if (preset) return preset.label;
  // A slug with no matching row — from an import, or a category since removed.
  return slug
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function isPresetCategory(slug: string): boolean {
  return PRESETS_BY_SLUG.has(slug);
}

/**
 * Resolve whatever the user typed or picked into a `{ slug, label }` pair.
 *
 * Accepts a preset slug, a preset label, or free text.
 */
export function resolveCategory(raw: string | null | undefined): {
  slug: string;
  label: string;
} {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === "") return { slug: OTHER_CATEGORY_SLUG, label: "Other" };

  const preset = PRESETS_BY_SLUG.get(text);
  if (preset) return { slug: preset.slug, label: preset.label };

  const byLabel = CATEGORY_PRESETS.find((c) => c.label.toLowerCase() === text.toLowerCase());
  if (byLabel) return { slug: byLabel.slug, label: byLabel.label };

  const slug = slugifyCategory(text);
  if (!slug) return { slug: OTHER_CATEGORY_SLUG, label: "Other" };
  return { slug, label: text };
}

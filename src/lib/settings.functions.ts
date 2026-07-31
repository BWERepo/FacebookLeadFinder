/**
 * Phase 11 — the Settings page's server functions.
 *
 * `user_settings` has no `api_key` column of any kind, by design (see its
 * migration): `getSettings` reports whether GOOGLE_PLACES_API_KEY is
 * configured as `{ configured, tail }` — the last 4 characters, for the user
 * to confirm they set the right key — and never the value itself, which
 * never leaves `process.env` here.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EXCLUDED_DOMAIN_KINDS, EXPORT_FORMATS } from "@/lib/domain";
import { listProviders } from "@/lib/providers/registry";

const DEFAULT_SETTINGS = {
  provider: "mock",
  default_radius_miles: 10,
  default_max_results: 100,
  confidence_threshold: 60,
  count_marketplace_as_website: false,
  count_google_business_as_website: false,
  export_format: "xlsx" as const,
  export_include_unqualified: false,
  duplicate_rules: {
    phone_only: true,
    name_and_zip: true,
    email: true,
    fuzzy_name_and_city: true,
  },
  chunk_size: 5,
};

function googlePlacesStatus(): { configured: boolean; tail: string | null } {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { configured: false, tail: null };
  return { configured: true, tail: key.slice(-4) };
}

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing, error } = await context.supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    let settings = existing;
    if (!settings) {
      const { data: created, error: insertError } = await context.supabase
        .from("user_settings")
        .insert({ user_id: context.userId, ...DEFAULT_SETTINGS })
        .select("*")
        .single();
      if (insertError) throw new Error(insertError.message);
      settings = created;
    }

    const [{ data: excludedDomains }, { data: categories }] = await Promise.all([
      context.supabase.from("excluded_domains").select("*").order("domain"),
      context.supabase.from("business_categories").select("*").order("sort_order").order("label"),
    ]);

    return {
      settings,
      providers: listProviders(),
      googlePlaces: googlePlacesStatus(),
      excludedDomains: excludedDomains ?? [],
      categories: categories ?? [],
    };
  });

// ---------------------------------------------------------------------------
// updateSettings
// ---------------------------------------------------------------------------

const updateSettingsSchema = z.object({
  provider: z.string().max(50).optional(),
  default_radius_miles: z.number().int().min(1).max(100).optional(),
  default_max_results: z.number().int().min(1).max(500).optional(),
  confidence_threshold: z.number().int().min(0).max(100).optional(),
  count_marketplace_as_website: z.boolean().optional(),
  count_google_business_as_website: z.boolean().optional(),
  export_format: z.enum(EXPORT_FORMATS).optional(),
  export_include_unqualified: z.boolean().optional(),
  duplicate_rules: z
    .object({
      phone_only: z.boolean(),
      name_and_zip: z.boolean(),
      email: z.boolean(),
      fuzzy_name_and_city: z.boolean(),
    })
    .optional(),
  chunk_size: z.number().int().min(1).max(10).optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSettingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_settings")
      .upsert({ user_id: context.userId, ...data } as any, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// excluded domains
// ---------------------------------------------------------------------------

const addExcludedDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
      "Enter a bare domain, like example.com",
    ),
  kind: z.enum(EXCLUDED_DOMAIN_KINDS),
  note: z.string().max(500).optional(),
});

export const addExcludedDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addExcludedDomainSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("excluded_domains").insert({
      domain: data.domain,
      kind: data.kind,
      note: data.note ?? "",
      created_by: context.userId,
      is_builtin: false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const toggleExcludedDomainSchema = z.object({ id: z.string().uuid(), enabled: z.boolean() });

export const toggleExcludedDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleExcludedDomainSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("excluded_domains")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteExcludedDomainSchema = z.object({ id: z.string().uuid() });

export const deleteExcludedDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteExcludedDomainSchema.parse(data))
  .handler(async ({ data, context }) => {
    // RLS already blocks deleting a built-in row (is_builtin = false is part of
    // the delete policy's USING clause) — this just gives a clean error message
    // instead of a silent "0 rows affected" if the client somehow gets here.
    const { error } = await context.supabase
      .from("excluded_domains")
      .delete()
      .eq("id", data.id)
      .eq("is_builtin", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

const addCategorySchema = z.object({
  label: z.string().trim().min(1).max(80),
});

function slugifyLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export const addCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => addCategorySchema.parse(data))
  .handler(async ({ data, context }) => {
    const slug = slugifyLabel(data.label);
    if (!slug) throw new Error("Enter a category name.");

    const { error } = await context.supabase.from("business_categories").insert({
      slug,
      label: data.label.trim(),
      sort_order: 500,
      is_preset: false,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const toggleCategorySchema = z.object({ id: z.string().uuid(), enabled: z.boolean() });

export const toggleCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => toggleCategorySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("business_categories")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("is_preset", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

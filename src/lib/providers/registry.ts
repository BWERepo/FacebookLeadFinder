/**
 * Resolves a provider name to a `SearchProvider` instance, falling back to the
 * mock provider when the requested one isn't actually usable.
 *
 * The fallback is never silent: `resolveProvider` always reports which
 * provider it actually picked and why, so a job that asked for Google Places
 * but got mock says so in its notes — the caller (searches.functions.ts)
 * writes that into the job's `notes` column rather than the user finding out
 * only by noticing the results look synthetic.
 */

import type { ProviderName, SearchProvider } from "./types";
import { createMockProvider } from "./mock.provider";
import { createGooglePlacesProvider } from "./google-places.provider";
import { createBingProvider } from "./bing.provider.stub";
import { createBraveProvider } from "./brave.provider.stub";
import { createSerpApiProvider } from "./serpapi.provider.stub";

export type ProviderAvailability = {
  name: ProviderName;
  available: boolean;
  /** Why it's unavailable, for the Settings page. `null` when available. */
  reason: string | null;
};

const FACTORIES: Record<ProviderName, () => SearchProvider> = {
  mock: createMockProvider,
  google_places: createGooglePlacesProvider,
  bing: createBingProvider,
  brave: createBraveProvider,
  serpapi: createSerpApiProvider,
};

const UNAVAILABLE_REASONS: Partial<Record<ProviderName, string>> = {
  google_places: "Not yet implemented (arrives in Phase 11)",
  bing: "Microsoft retired the Bing Web Search API in August 2025",
  brave: "Not yet implemented",
  serpapi: "Not yet implemented",
};

export function listProviders(): ProviderAvailability[] {
  return (Object.keys(FACTORIES) as ProviderName[]).map((name) => {
    const provider = FACTORIES[name]();
    return {
      name,
      available: provider.available,
      reason: provider.available ? null : (UNAVAILABLE_REASONS[name] ?? "Not configured"),
    };
  });
}

export type ResolvedProvider = {
  provider: SearchProvider;
  /** The provider actually returned. May differ from what was requested. */
  actual: ProviderName;
  /** Set when a fallback occurred, for the job's notes column. */
  fallbackNote: string | null;
};

/**
 * Resolve a requested provider name to a usable provider.
 *
 * Never throws for an unavailable or unknown provider — always returns
 * something usable (mock, at minimum), because a search job should degrade
 * gracefully rather than fail outright over a Settings misconfiguration.
 */
export function resolveProvider(requested: string): ResolvedProvider {
  const name = requested as ProviderName;
  const factory = FACTORIES[name];

  if (!factory) {
    return {
      provider: createMockProvider(),
      actual: "mock",
      fallbackNote: `Unknown provider "${requested}" — using the mock provider instead.`,
    };
  }

  const provider = factory();
  if (provider.available) {
    return { provider, actual: name, fallbackNote: null };
  }

  const reason = UNAVAILABLE_REASONS[name] ?? "not configured";
  return {
    provider: createMockProvider(),
    actual: "mock",
    fallbackNote: `${name} is unavailable (${reason}) — using the mock provider instead.`,
  };
}

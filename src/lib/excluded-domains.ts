/**
 * Deciding whether a URL is "the business's own website" or "somewhere the
 * business happens to be listed". Pure — no network, no database.
 *
 * The caller supplies the rule set, which is the built-in catalogue merged with
 * whatever the user has added or disabled in Settings. That indirection is what
 * lets a user say "actually, count Square storefronts as websites" without a
 * code change.
 */

import {
  EXCLUDED_DOMAIN_CATALOG,
  EXCLUDED_PATH_PATTERNS,
  type PathExclusion,
} from "@/data/excluded-domains.catalog";
import type { ExcludedDomainKind } from "@/lib/domain";
import { normalizeUrl, registrableDomain, type NormalizedUrl } from "@/lib/url";

/** One rule: a domain, what kind of thing it is, and whether it's switched on. */
export type DomainRule = {
  domain: string;
  kind: ExcludedDomainKind;
  enabled: boolean;
};

/**
 * What a URL turned out to be.
 *
 * `independent` is the only classification that can mean "this business has its
 * own website" — everything else is a profile, a listing, or a storefront.
 */
export type DomainClassification = ExcludedDomainKind | "independent";

/** The built-in rules, all enabled. The default rule set. */
export const BUILTIN_DOMAIN_RULES: readonly DomainRule[] = EXCLUDED_DOMAIN_CATALOG.map((entry) => ({
  domain: entry.domain,
  kind: entry.kind,
  enabled: true,
}));

/**
 * Merge user rows over the built-ins, keyed on domain.
 *
 * A user row for a built-in domain wins — that is how "stop treating
 * marketplace storefronts as excluded" is expressed (an `enabled: false` row).
 */
export function mergeDomainRules(userRules: readonly DomainRule[]): DomainRule[] {
  const byDomain = new Map<string, DomainRule>();
  for (const rule of BUILTIN_DOMAIN_RULES) {
    byDomain.set(rule.domain.toLowerCase(), rule);
  }
  for (const rule of userRules) {
    const domain = rule.domain.trim().toLowerCase();
    if (domain === "") continue;
    byDomain.set(domain, { ...rule, domain });
  }
  return [...byDomain.values()];
}

/**
 * Does `host` fall under `domain`?
 *
 * Three ways to match, because a single equality check misses the cases that
 * matter most:
 *   1. exact           facebook.com === facebook.com
 *   2. any subdomain   m.facebook.com ends with ".facebook.com"
 *   3. registrable     en-gb.facebook.com reduces to facebook.com
 *
 * (2) is what catches the mobile, locale and `mbasic` hosts that appear
 * constantly in real directory data.
 */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  if (h === d) return true;
  if (h.endsWith(`.${d}`)) return true;
  return registrableDomain(h) === d;
}

function findPathExclusion(url: NormalizedUrl): PathExclusion | null {
  for (const rule of EXCLUDED_PATH_PATTERNS) {
    if (!hostMatchesDomain(url.host, rule.host)) continue;
    if (url.path === rule.pathPrefix || url.path.startsWith(`${rule.pathPrefix}/`)) {
      return rule;
    }
  }
  return null;
}

/**
 * Classify a URL against a rule set.
 *
 * Returns `independent` when nothing matches — meaning "as far as these rules
 * are concerned, this looks like the business's own site". Whether it actually
 * belongs to *this* business is a separate question, answered by candidate
 * scoring in verification.ts.
 */
export function classifyUrl(
  raw: string | null | undefined,
  rules: readonly DomainRule[] = BUILTIN_DOMAIN_RULES,
): { classification: DomainClassification; normalized: NormalizedUrl | null } {
  const normalized = normalizeUrl(raw);
  if (!normalized) return { classification: "independent", normalized: null };

  // Path rules first: they are more specific than a bare host rule, and for a
  // shared host (google.com) the host rule deliberately doesn't exist.
  const pathRule = findPathExclusion(normalized);
  if (pathRule) {
    // Respect a disabled host rule of the same kind, so turning marketplaces
    // back on also turns off the marketplace path patterns.
    const disabledSameKind = rules.some(
      (r) => !r.enabled && r.kind === pathRule.kind && hostMatchesDomain(normalized.host, r.domain),
    );
    if (!disabledSameKind) return { classification: pathRule.kind, normalized };
  }

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (hostMatchesDomain(normalized.host, rule.domain)) {
      return { classification: rule.kind, normalized };
    }
  }

  return { classification: "independent", normalized };
}

/** Convenience: the classification alone. */
export function classifyDomain(
  raw: string | null | undefined,
  rules: readonly DomainRule[] = BUILTIN_DOMAIN_RULES,
): DomainClassification {
  return classifyUrl(raw, rules).classification;
}

/** Is this URL excluded from counting as an independent business website? */
export function isExcluded(
  raw: string | null | undefined,
  rules: readonly DomainRule[] = BUILTIN_DOMAIN_RULES,
): boolean {
  return classifyDomain(raw, rules) !== "independent";
}

/** Is this URL a Facebook page? */
export function isFacebookUrl(
  raw: string | null | undefined,
  rules: readonly DomainRule[] = BUILTIN_DOMAIN_RULES,
): boolean {
  return classifyDomain(raw, rules) === "facebook";
}

/**
 * Would this classification count as the business having a website, given the
 * user's marketplace and Google Business preferences?
 *
 * Both default to false: a business selling through Etsy, or with only a Google
 * Business micro-site, still has no site of its own — which makes it a prospect,
 * not a rejection.
 */
export function countsAsWebsite(
  classification: DomainClassification,
  options: { countMarketplace: boolean; countGoogleBusiness: boolean },
): boolean {
  if (classification === "independent") return true;
  if (classification === "marketplace") return options.countMarketplace;
  if (classification === "google_business") return options.countGoogleBusiness;
  return false;
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { EXCLUDED_DOMAIN_CATALOG } from "@/data/excluded-domains.catalog";
import {
  BUILTIN_DOMAIN_RULES,
  classifyDomain,
  countsAsWebsite,
  hostMatchesDomain,
  isExcluded,
  isFacebookUrl,
  mergeDomainRules,
  type DomainRule,
} from "./excluded-domains";

describe("catalogue matches the seed migration", () => {
  // The catalogue and the SQL seed are two copies of one list, for two
  // consumers (pure logic vs. the editable table). Drift between them would
  // mean the app classifies a domain one way in a unit test and another way in
  // production.
  const sql = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "supabase",
      "migrations",
      "20260801001000_seed_reference_data.sql",
    ),
    "utf8",
  );

  const sqlSection = sql.slice(sql.indexOf("INSERT INTO public.excluded_domains"));
  const sqlEntries = [...sqlSection.matchAll(/\('([a-z0-9.-]+)',\s*'([a-z_]+)',\s*true,/g)].map(
    (m) => ({ domain: m[1], kind: m[2] }),
  );

  it("found entries to compare", () => {
    expect(sqlEntries.length).toBeGreaterThan(40);
  });

  it("contains exactly the same domains", () => {
    expect(sqlEntries.map((e) => e.domain).sort()).toEqual(
      EXCLUDED_DOMAIN_CATALOG.map((e) => e.domain).sort(),
    );
  });

  it("classifies every domain the same way", () => {
    const byDomain = new Map(EXCLUDED_DOMAIN_CATALOG.map((e) => [e.domain, e.kind]));
    for (const entry of sqlEntries) {
      expect(byDomain.get(entry.domain)).toBe(entry.kind);
    }
  });
});

describe("hostMatchesDomain", () => {
  it("matches exactly", () => {
    expect(hostMatchesDomain("facebook.com", "facebook.com")).toBe(true);
  });

  it("matches any subdomain", () => {
    // The reason the rule list doesn't have to enumerate m./mbasic./locale
    // hosts, which show up constantly in real directory data.
    for (const host of [
      "m.facebook.com",
      "mbasic.facebook.com",
      "en-gb.facebook.com",
      "web.facebook.com",
      "business.facebook.com",
      "touch.facebook.com",
    ]) {
      expect(hostMatchesDomain(host, "facebook.com")).toBe(true);
    }
  });

  it("ignores a www prefix on either side", () => {
    expect(hostMatchesDomain("www.yelp.com", "yelp.com")).toBe(true);
    expect(hostMatchesDomain("yelp.com", "www.yelp.com")).toBe(true);
  });

  it("does not match a domain that merely contains the name", () => {
    // The bug a naive `includes()` would have: notfacebook.com is a different
    // business, and facebook.com.evil.example is an attacker's domain.
    expect(hostMatchesDomain("notfacebook.com", "facebook.com")).toBe(false);
    expect(hostMatchesDomain("facebook.com.evil.example", "facebook.com")).toBe(false);
    expect(hostMatchesDomain("myyelp.com", "yelp.com")).toBe(false);
  });
});

describe("classifyDomain", () => {
  it("identifies Facebook pages", () => {
    expect(classifyDomain("https://facebook.com/joesplumbing")).toBe("facebook");
    expect(classifyDomain("https://m.facebook.com/joesplumbing")).toBe("facebook");
    expect(classifyDomain("https://fb.com/joesplumbing")).toBe("facebook");
    expect(classifyDomain("fb.me/joesplumbing")).toBe("facebook");
  });

  it("identifies other social profiles", () => {
    expect(classifyDomain("https://instagram.com/joesplumbing")).toBe("other_social");
    expect(classifyDomain("https://www.linkedin.com/company/joes")).toBe("other_social");
    expect(classifyDomain("https://x.com/joesplumbing")).toBe("other_social");
    expect(classifyDomain("https://twitter.com/joesplumbing")).toBe("other_social");
  });

  it("identifies directories", () => {
    expect(classifyDomain("https://www.yelp.com/biz/joes-plumbing-knoxville")).toBe("directory");
    expect(classifyDomain("https://yellowpages.com/knoxville-tn/joes")).toBe("directory");
    expect(classifyDomain("https://www.bbb.org/us/tn/knoxville/profile/plumber/joes")).toBe(
      "directory",
    );
    expect(classifyDomain("https://chamberofcommerce.com/united-states/tennessee/joes")).toBe(
      "directory",
    );
  });

  it("identifies Google Business surfaces", () => {
    expect(classifyDomain("https://joesplumbing.business.site")).toBe("google_business");
    expect(classifyDomain("https://g.page/joesplumbing")).toBe("google_business");
    expect(classifyDomain("https://sites.google.com/view/joesplumbing")).toBe("google_business");
  });

  it("identifies a Google Maps link by path, since google.com itself is not excluded", () => {
    expect(classifyDomain("https://www.google.com/maps/place/Joes+Plumbing")).toBe(
      "google_business",
    );
    // A hypothetical non-listing google.com URL is not swept up by that rule.
    expect(classifyDomain("https://www.google.com/something-else")).toBe("independent");
  });

  it("identifies marketplace storefronts", () => {
    expect(classifyDomain("https://joesplumbing.square.site")).toBe("marketplace");
    expect(classifyDomain("https://www.etsy.com/shop/SuzisCrafts")).toBe("marketplace");
    expect(classifyDomain("https://linktr.ee/joesplumbing")).toBe("marketplace");
    expect(classifyDomain("https://www.amazon.com/stores/JoesTools")).toBe("marketplace");
  });

  it("identifies booking platforms as marketplaces, not websites", () => {
    // A salon whose only web presence is a Booksy booking page is exactly the
    // prospect this tool exists to find.
    expect(classifyDomain("https://booksy.com/en-us/12345_shear-genius")).toBe("marketplace");
    expect(classifyDomain("https://www.vagaro.com/shearGenius")).toBe("marketplace");
  });

  it("treats a real business domain as independent", () => {
    expect(classifyDomain("https://joesplumbing.com")).toBe("independent");
    expect(classifyDomain("https://www.shear-genius-salon.net/services")).toBe("independent");
  });

  it("treats an unparseable URL as independent rather than throwing", () => {
    // Callers decide what to do with a bad URL; classification isn't the place
    // to reject it.
    expect(classifyDomain("not a url")).toBe("independent");
    expect(classifyDomain(null)).toBe("independent");
  });
});

describe("isExcluded / isFacebookUrl", () => {
  it("excludes every non-independent classification", () => {
    expect(isExcluded("https://facebook.com/joes")).toBe(true);
    expect(isExcluded("https://yelp.com/biz/joes")).toBe(true);
    expect(isExcluded("https://instagram.com/joes")).toBe(true);
    expect(isExcluded("https://joesplumbing.com")).toBe(false);
  });

  it("recognizes Facebook specifically", () => {
    expect(isFacebookUrl("https://www.facebook.com/joes")).toBe(true);
    expect(isFacebookUrl("https://instagram.com/joes")).toBe(false);
  });
});

describe("mergeDomainRules", () => {
  it("keeps the built-ins when no user rules are supplied", () => {
    expect(mergeDomainRules([])).toHaveLength(BUILTIN_DOMAIN_RULES.length);
  });

  it("adds a user's own domain", () => {
    const rules = mergeDomainRules([
      { domain: "localbizhub.example", kind: "directory", enabled: true },
    ]);
    expect(classifyDomain("https://localbizhub.example/joes", rules)).toBe("directory");
  });

  it("lets a user disable a built-in so it counts as a website again", () => {
    const rules = mergeDomainRules([{ domain: "etsy.com", kind: "marketplace", enabled: false }]);
    expect(classifyDomain("https://www.etsy.com/shop/SuzisCrafts", rules)).toBe("independent");
  });

  it("normalizes case and whitespace on user domains", () => {
    const rules = mergeDomainRules([
      { domain: "  LocalBizHub.Example  ", kind: "directory", enabled: true },
    ]);
    expect(classifyDomain("https://localbizhub.example/x", rules)).toBe("directory");
  });

  it("ignores an empty domain rather than matching everything", () => {
    const rules = mergeDomainRules([{ domain: "   ", kind: "other", enabled: true }]);
    expect(classifyDomain("https://joesplumbing.com", rules)).toBe("independent");
  });
});

describe("countsAsWebsite", () => {
  const strict = { countMarketplace: false, countGoogleBusiness: false };
  const lenient = { countMarketplace: true, countGoogleBusiness: true };

  it("counts an independent domain either way", () => {
    expect(countsAsWebsite("independent", strict)).toBe(true);
    expect(countsAsWebsite("independent", lenient)).toBe(true);
  });

  it("never counts Facebook, social profiles or directories", () => {
    for (const kind of ["facebook", "other_social", "directory", "other"] as const) {
      expect(countsAsWebsite(kind, strict)).toBe(false);
      expect(countsAsWebsite(kind, lenient)).toBe(false);
    }
  });

  it("counts marketplaces only when the user opts in", () => {
    expect(countsAsWebsite("marketplace", strict)).toBe(false);
    expect(countsAsWebsite("marketplace", lenient)).toBe(true);
  });

  it("counts Google Business sites only when the user opts in", () => {
    expect(countsAsWebsite("google_business", strict)).toBe(false);
    expect(countsAsWebsite("google_business", lenient)).toBe(true);
  });
});

describe("spec edge cases", () => {
  it("a Facebook page that links only to Instagram yields no website", () => {
    const candidates = ["https://facebook.com/joes", "https://instagram.com/joes"];
    expect(candidates.every((url) => isExcluded(url))).toBe(true);
  });

  it("a Yelp page is not a website", () => {
    expect(isExcluded("https://www.yelp.com/biz/joes-plumbing")).toBe(true);
  });

  it("a marketplace storefront flips with the setting", () => {
    const store = "https://suziscrafts.square.site";
    expect(
      countsAsWebsite(classifyDomain(store), {
        countMarketplace: false,
        countGoogleBusiness: false,
      }),
    ).toBe(false);
    expect(
      countsAsWebsite(classifyDomain(store), {
        countMarketplace: true,
        countGoogleBusiness: false,
      }),
    ).toBe(true);
  });

  it("disabling the marketplace rule also disables its path patterns", () => {
    // etsy.com/shop/... is covered by both a host rule and a path rule. Turning
    // the host rule off must not leave the path rule silently still excluding.
    const rules: DomainRule[] = mergeDomainRules([
      { domain: "etsy.com", kind: "marketplace", enabled: false },
    ]);
    expect(classifyDomain("https://www.etsy.com/shop/SuzisCrafts", rules)).toBe("independent");
  });
});

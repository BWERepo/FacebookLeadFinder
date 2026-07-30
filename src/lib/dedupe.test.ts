import { describe, expect, it } from "vitest";

import {
  DEFAULT_DUPLICATE_RULES,
  areaCodeOf,
  diceCoefficient,
  findDuplicate,
  mergePatch,
  nameSimilarity,
  normalizeAddress,
  normalizeBusinessName,
  normalizeEmail,
  normalizeFacebookUrl,
  normalizePhone,
  type DedupeCandidate,
} from "./dedupe";

describe("normalizeBusinessName", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeBusinessName("Joe's Plumbing!")).toBe("joes plumbing");
  });

  it("keeps apostrophe-joined words together", () => {
    // "joe s plumbing" would score badly against "joes plumbing" in Dice.
    expect(normalizeBusinessName("Joe's")).toBe("joes");
  });

  it("treats & and 'and' as the same", () => {
    expect(normalizeBusinessName("Smith & Sons")).toBe(normalizeBusinessName("Smith and Sons"));
  });

  it("drops a leading 'The'", () => {
    expect(normalizeBusinessName("The Corner Bakery")).toBe("corner bakery");
  });

  it("strips stacked legal suffixes", () => {
    expect(normalizeBusinessName("Smith Plumbing Co LLC")).toBe("smith plumbing");
    expect(normalizeBusinessName("Acme Services, Inc.")).toBe("acme services");
    expect(normalizeBusinessName("Miller & Sons Roofing LLC")).toBe("miller and sons roofing");
  });

  it("does not strip a suffix that is the whole name", () => {
    // "Inc" alone is a (bad) business name, not a suffix to remove; stripping
    // it would leave an empty string that matches everything.
    expect(normalizeBusinessName("Inc")).toBe("inc");
  });

  it("strips accents", () => {
    expect(normalizeBusinessName("Café Rouge")).toBe("cafe rouge");
  });

  it("collapses whitespace", () => {
    expect(normalizeBusinessName("  Joe's   Plumbing  ")).toBe("joes plumbing");
  });

  it("handles non-strings", () => {
    expect(normalizeBusinessName(null)).toBe("");
    expect(normalizeBusinessName(undefined)).toBe("");
    expect(normalizeBusinessName("")).toBe("");
  });
});

describe("normalizePhone", () => {
  it("reduces every common format to the same 10 digits", () => {
    // The spec's "duplicate lead has a different phone-number format" case.
    const forms = [
      "(865) 555-0142",
      "865-555-0142",
      "865.555.0142",
      "8655550142",
      "+1 865 555 0142",
      "1-865-555-0142",
      "  865 555 0142  ",
    ];
    for (const form of forms) {
      expect(normalizePhone(form)).toBe("8655550142");
    }
  });

  it("drops an extension", () => {
    expect(normalizePhone("865-555-0142 ext. 12")).toBe("8655550142");
    expect(normalizePhone("865-555-0142 x12")).toBe("8655550142");
    expect(normalizePhone("(865) 555-0142 extension 400")).toBe("8655550142");
  });

  it("returns null rather than a partial number", () => {
    // Two records that both failed to parse a phone must not count as a match.
    expect(normalizePhone("555-0142")).toBeNull();
    expect(normalizePhone("call us!")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("rejects impossible US numbers", () => {
    expect(normalizePhone("065-555-0142")).toBeNull();
    expect(normalizePhone("165-555-0142")).toBeNull();
  });

  it("rejects a too-long international number", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBeNull();
  });
});

describe("areaCodeOf", () => {
  it("returns the first three digits", () => {
    expect(areaCodeOf("(865) 555-0142")).toBe("865");
    expect(areaCodeOf("+1 423 555 0199")).toBe("423");
  });

  it("returns null when the number is unusable", () => {
    expect(areaCodeOf("call us")).toBeNull();
  });
});

describe("normalizeFacebookUrl", () => {
  it("canonicalizes the ordinary forms", () => {
    const forms = [
      "https://facebook.com/JoesPlumbing",
      "https://www.facebook.com/JoesPlumbing",
      "https://m.facebook.com/JoesPlumbing",
      "https://mbasic.facebook.com/JoesPlumbing",
      "https://en-gb.facebook.com/JoesPlumbing",
      "http://facebook.com/JoesPlumbing/",
      "facebook.com/JoesPlumbing",
      "https://facebook.com/JoesPlumbing?ref=page_internal",
    ];
    for (const form of forms) {
      expect(normalizeFacebookUrl(form)).toBe("facebook.com/JoesPlumbing");
    }
  });

  it("folds the short domains", () => {
    expect(normalizeFacebookUrl("https://fb.com/JoesPlumbing")).toBe("facebook.com/JoesPlumbing");
    expect(normalizeFacebookUrl("https://fb.me/JoesPlumbing")).toBe("facebook.com/JoesPlumbing");
  });

  it("strips page tabs, which are the same page", () => {
    for (const tab of ["about", "posts", "photos", "reviews", "services", "shop"]) {
      expect(normalizeFacebookUrl(`https://facebook.com/JoesPlumbing/${tab}`)).toBe(
        "facebook.com/JoesPlumbing",
      );
    }
  });

  it("handles the /pg/ prefix", () => {
    expect(normalizeFacebookUrl("https://facebook.com/pg/JoesPlumbing/posts")).toBe(
      "facebook.com/JoesPlumbing",
    );
  });

  it("reduces a legacy /pages/ URL to the numeric id", () => {
    // The slug in a /pages/ URL is decorative; the id is the identity, and the
    // slug changes when the business renames itself.
    expect(normalizeFacebookUrl("https://facebook.com/pages/Joes-Plumbing/123456789")).toBe(
      "facebook.com/123456789",
    );
    expect(
      normalizeFacebookUrl("https://www.facebook.com/pages/Joes-Plumbing-LLC/123456789/about"),
    ).toBe("facebook.com/123456789");
  });

  it("keeps profile.php?id= intact, since the query is the identity there", () => {
    expect(normalizeFacebookUrl("https://facebook.com/profile.php?id=123456789")).toBe(
      "facebook.com/profile.php?id=123456789",
    );
    expect(normalizeFacebookUrl("https://m.facebook.com/profile.php?id=123456789&ref=x")).toBe(
      "facebook.com/profile.php?id=123456789",
    );
  });

  it("rejects a profile.php with no usable id", () => {
    expect(normalizeFacebookUrl("https://facebook.com/profile.php")).toBeNull();
    expect(normalizeFacebookUrl("https://facebook.com/profile.php?id=abc")).toBeNull();
  });

  it("rejects Facebook URLs that identify no business", () => {
    expect(normalizeFacebookUrl("https://facebook.com")).toBeNull();
    expect(normalizeFacebookUrl("https://facebook.com/")).toBeNull();
    expect(normalizeFacebookUrl("https://facebook.com/login")).toBeNull();
    expect(normalizeFacebookUrl("https://facebook.com/marketplace/item/123")).toBeNull();
    expect(normalizeFacebookUrl("https://facebook.com/watch/?v=123")).toBeNull();
  });

  it("rejects anything that is not Facebook", () => {
    expect(normalizeFacebookUrl("https://instagram.com/joes")).toBeNull();
    expect(normalizeFacebookUrl("https://joesplumbing.com")).toBeNull();
    expect(normalizeFacebookUrl("not a url")).toBeNull();
    expect(normalizeFacebookUrl(null)).toBeNull();
  });

  it("rejects a lookalike domain", () => {
    expect(normalizeFacebookUrl("https://facebook.com.evil.example/joes")).toBeNull();
    expect(normalizeFacebookUrl("https://notfacebook.com/joes")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Info@JoesPlumbing.COM ")).toBe("info@joesplumbing.com");
  });

  it("keeps plus tags, which are meaningful on a business address", () => {
    expect(normalizeEmail("info+leads@example.com")).toBe("info+leads@example.com");
  });

  it("returns null for non-addresses", () => {
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("normalizeAddress", () => {
  it("expands to canonical abbreviations", () => {
    expect(normalizeAddress("123 North Main Street, Suite 4")).toBe("123 n main st ste 4");
  });

  it("treats abbreviated and spelled-out forms as equal", () => {
    expect(normalizeAddress("456 W Oak Ave")).toBe(normalizeAddress("456 West Oak Avenue"));
  });

  it("handles empty input", () => {
    expect(normalizeAddress("")).toBe("");
    expect(normalizeAddress(null)).toBe("");
  });
});

describe("diceCoefficient", () => {
  it("is 1 for identical strings", () => {
    expect(diceCoefficient("joes plumbing", "joes plumbing")).toBe(1);
  });

  it("is 0 for nothing in common", () => {
    expect(diceCoefficient("abcd", "wxyz")).toBe(0);
  });

  it("scores partial overlap between 0 and 1", () => {
    const score = diceCoefficient("joes plumbing", "joes plumbing and heating");
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it("handles strings too short to have bigrams", () => {
    expect(diceCoefficient("a", "a")).toBe(1);
    expect(diceCoefficient("a", "b")).toBe(0);
    expect(diceCoefficient("", "")).toBe(1);
  });

  it("is symmetric", () => {
    const a = "shear genius salon";
    const b = "shear genius hair salon";
    expect(diceCoefficient(a, b)).toBeCloseTo(diceCoefficient(b, a), 10);
  });
});

describe("nameSimilarity", () => {
  it("sees through legal suffixes and punctuation", () => {
    expect(nameSimilarity("Joe's Plumbing LLC", "Joes Plumbing")).toBe(1);
  });

  it("scores a genuinely different business low", () => {
    expect(nameSimilarity("Joe's Plumbing", "Riverside Dental")).toBeLessThan(0.3);
  });
});

// ---------------------------------------------------------------------------

function lead(overrides: Partial<DedupeCandidate> & { id: string }): DedupeCandidate & {
  id: string;
} {
  return {
    normalized_name: null,
    normalized_phone: null,
    normalized_email: null,
    normalized_facebook_url: null,
    normalized_address: null,
    city: null,
    state: null,
    zip: null,
    provider: null,
    provider_place_id: null,
    ...overrides,
  };
}

describe("findDuplicate — certain matches", () => {
  it("matches on the Facebook URL above everything else", () => {
    const existing = [
      lead({ id: "a", normalized_facebook_url: "facebook.com/JoesPlumbing" }),
      lead({ id: "b", normalized_phone: "8655550142" }),
    ];
    const match = findDuplicate(
      { normalized_facebook_url: "facebook.com/JoesPlumbing", normalized_phone: "8655550142" },
      existing,
    );
    expect(match?.lead.id).toBe("a");
    expect(match?.rule).toBe("exact_facebook_url");
    expect(match?.certainty).toBe("certain");
  });

  it("matches on provider place id", () => {
    const existing = [lead({ id: "a", provider: "google_places", provider_place_id: "ChIJ123" })];
    const match = findDuplicate(
      { provider: "google_places", provider_place_id: "ChIJ123" },
      existing,
    );
    expect(match?.rule).toBe("exact_place_id");
  });

  it("does not match the same place id from a different provider", () => {
    const existing = [lead({ id: "a", provider: "mock", provider_place_id: "ChIJ123" })];
    expect(
      findDuplicate({ provider: "google_places", provider_place_id: "ChIJ123" }, existing),
    ).toBeNull();
  });

  it("matches on phone plus a similar name despite formatting differences", () => {
    const existing = [
      lead({ id: "a", normalized_name: "joes plumbing", normalized_phone: "8655550142" }),
    ];
    const match = findDuplicate(
      {
        normalized_name: normalizeBusinessName("Joe's Plumbing LLC"),
        normalized_phone: normalizePhone("(865) 555-0142"),
      },
      existing,
    );
    expect(match?.rule).toBe("phone_and_name");
    expect(match?.certainty).toBe("certain");
  });

  it("matches on name plus address", () => {
    const existing = [
      lead({
        id: "a",
        normalized_name: "corner bakery",
        normalized_address: "123 n main st",
      }),
    ];
    const match = findDuplicate(
      {
        normalized_name: normalizeBusinessName("The Corner Bakery"),
        normalized_address: normalizeAddress("123 North Main Street"),
      },
      existing,
    );
    expect(match?.rule).toBe("name_and_address");
  });
});

describe("findDuplicate — weaker matches", () => {
  it("reports a shared phone with different names as probable, not certain", () => {
    // Two businesses at one number is common (shared reception, a franchise),
    // so this must not auto-merge.
    const existing = [
      lead({ id: "a", normalized_name: "riverside dental", normalized_phone: "8655550142" }),
    ];
    const match = findDuplicate(
      { normalized_name: "joes plumbing", normalized_phone: "8655550142" },
      existing,
    );
    expect(match?.rule).toBe("phone_only");
    expect(match?.certainty).toBe("probable");
  });

  it("reports the same name in the same ZIP as probable", () => {
    const existing = [lead({ id: "a", normalized_name: "joes plumbing", zip: "37743" })];
    const match = findDuplicate({ normalized_name: "joes plumbing", zip: "37743" }, existing);
    expect(match?.rule).toBe("name_and_zip");
    expect(match?.certainty).toBe("probable");
  });

  it("matches a shared business email", () => {
    const existing = [lead({ id: "a", normalized_email: "info@joesplumbing.com" })];
    const match = findDuplicate({ normalized_email: "info@joesplumbing.com" }, existing);
    expect(match?.rule).toBe("email");
  });

  it("ignores a shared free-provider email", () => {
    // A spouse, an accountant or a franchisee can share a gmail address across
    // genuinely different businesses.
    const existing = [lead({ id: "a", normalized_email: "joe@gmail.com" })];
    expect(findDuplicate({ normalized_email: "joe@gmail.com" }, existing)).toBeNull();
  });

  it("reports a near-identical name in the same city as only possible", () => {
    const existing = [
      lead({ id: "a", normalized_name: "shear genius salon", city: "Knoxville", state: "TN" }),
    ];
    const match = findDuplicate(
      { normalized_name: "shear genius saloon", city: "Knoxville", state: "TN" },
      existing,
    );
    expect(match?.rule).toBe("fuzzy_name_and_city");
    expect(match?.certainty).toBe("possible");
  });

  it("does not match the same name in a different city", () => {
    const existing = [
      lead({ id: "a", normalized_name: "joes plumbing", city: "Knoxville", state: "TN" }),
    ];
    expect(
      findDuplicate({ normalized_name: "joes plumbing", city: "Nashville", state: "TN" }, existing),
    ).toBeNull();
  });
});

describe("findDuplicate — no false positives", () => {
  it("returns null when nothing is comparable", () => {
    expect(findDuplicate({ normalized_name: "joes plumbing" }, [])).toBeNull();
  });

  it("never matches two records that are both missing a field", () => {
    // The bug this guards: null === null is true in JS, so a naive equality
    // check would merge every lead with no phone number into one.
    const existing = [lead({ id: "a", normalized_name: "riverside dental" })];
    const match = findDuplicate(
      {
        normalized_name: "joes plumbing",
        normalized_phone: null,
        normalized_email: null,
        normalized_facebook_url: null,
        normalized_address: null,
      },
      existing,
    );
    expect(match).toBeNull();
  });

  it("never matches on empty strings either", () => {
    const existing = [lead({ id: "a", normalized_name: "", normalized_address: "" })];
    expect(findDuplicate({ normalized_name: "", normalized_address: "" }, existing)).toBeNull();
  });

  it("honours disabled optional rules", () => {
    const existing = [
      lead({ id: "a", normalized_name: "riverside dental", normalized_phone: "8655550142" }),
    ];
    const match = findDuplicate(
      { normalized_name: "joes plumbing", normalized_phone: "8655550142" },
      existing,
      { ...DEFAULT_DUPLICATE_RULES, phone_only: false },
    );
    expect(match).toBeNull();
  });

  it("still applies certain rules even with every optional rule off", () => {
    const existing = [lead({ id: "a", normalized_facebook_url: "facebook.com/Joes" })];
    const match = findDuplicate(
      { normalized_facebook_url: "facebook.com/Joes" },
      existing,
      { phone_only: false, name_and_zip: false, email: false, fuzzy_name_and_city: false },
    );
    expect(match?.rule).toBe("exact_facebook_url");
  });
});

describe("mergePatch", () => {
  it("fills only blank fields", () => {
    const existing = { email: null, phone: "8655550142", city: "" };
    const patch = mergePatch(existing, { email: "info@x.com", phone: "4235550199", city: "Knox" });
    expect(patch).toEqual({ email: "info@x.com", city: "Knox" });
  });

  it("never overwrites a known value with a blank one", () => {
    // A later, thinner source must not erase what an earlier one established.
    const existing = { email: "info@x.com" };
    expect(mergePatch(existing, { email: null })).toEqual({});
    expect(mergePatch(existing, { email: "" })).toEqual({});
    expect(mergePatch(existing, { email: undefined })).toEqual({});
  });

  it("returns an empty patch when there is nothing to add", () => {
    expect(mergePatch({ a: "1" }, { a: "2" })).toEqual({});
  });
});

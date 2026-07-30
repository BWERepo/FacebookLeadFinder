import { describe, expect, it } from "vitest";

import {
  CONFIDENCE_RUBRIC,
  emptySignals,
  isDistinctiveName,
  scoreConfidence,
  type ConfidenceSignals,
  type SignalKey,
} from "./confidence";
import { CONFIDENCE_HIGH_MIN, CONFIDENCE_MEDIUM_MIN } from "./domain";
import { normalizeBusinessName } from "./dedupe";

/** Signals with the listed keys true and the rest explicitly false. */
function signals(...trueKeys: SignalKey[]): ConfidenceSignals {
  const result = emptySignals();
  for (const rule of CONFIDENCE_RUBRIC) {
    result[rule.key] = trueKeys.includes(rule.key);
  }
  return result;
}

function allTrue(): ConfidenceSignals {
  return signals(...CONFIDENCE_RUBRIC.map((r) => r.key));
}

describe("the rubric itself", () => {
  it("sums to exactly 100", () => {
    // If this drifts, every stored score becomes incomparable with every score
    // taken before the change.
    expect(CONFIDENCE_RUBRIC.reduce((sum, rule) => sum + rule.max, 0)).toBe(100);
  });

  it("has unique keys", () => {
    const keys = CONFIDENCE_RUBRIC.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every signal a human-readable label", () => {
    for (const rule of CONFIDENCE_RUBRIC) {
      expect(rule.label.length).toBeGreaterThan(10);
      expect(rule.max).toBeGreaterThan(0);
    }
  });

  it("weights the Facebook page confirmation highest", () => {
    // It is the one signal without which a lead cannot qualify at all.
    const top = [...CONFIDENCE_RUBRIC].sort((a, b) => b.max - a.max)[0];
    expect(top.key).toBe("facebook_page_confirmed");
  });
});

describe("scoreConfidence", () => {
  it("scores 100 when every signal fires and the status is qualifying", () => {
    const result = scoreConfidence(allTrue(), "facebook_only");
    expect(result.score).toBe(100);
    expect(result.band).toBe("high");
    expect(result.cappedBy).toBeNull();
  });

  it("scores 0 when nothing fires", () => {
    const result = scoreConfidence(signals(), "no_website_found");
    expect(result.score).toBe(0);
    expect(result.band).toBe("manual");
  });

  it("awards exactly the rubric weight for each signal", () => {
    for (const rule of CONFIDENCE_RUBRIC) {
      const result = scoreConfidence(signals(rule.key), "no_website_found");
      expect(result.score).toBe(rule.max);
    }
  });

  it("treats unknown the same as false for points, but counts it separately", () => {
    const unknown = emptySignals();
    const explicitlyFalse = signals();

    expect(scoreConfidence(unknown, "no_website_found").score).toBe(0);
    expect(scoreConfidence(explicitlyFalse, "no_website_found").score).toBe(0);

    expect(scoreConfidence(unknown, "no_website_found").unknowns).toBe(CONFIDENCE_RUBRIC.length);
    expect(scoreConfidence(explicitlyFalse, "no_website_found").unknowns).toBe(0);
  });

  it("returns a breakdown that explains the score", () => {
    const result = scoreConfidence(signals("facebook_page_confirmed"), "facebook_only");
    expect(result.breakdown).toHaveLength(CONFIDENCE_RUBRIC.length);

    const line = result.breakdown.find((l) => l.key === "facebook_page_confirmed")!;
    expect(line.points).toBe(20);
    expect(line.max).toBe(20);
    expect(line.value).toBe(true);

    // The points in the breakdown must add up to the pre-cap total.
    const summed = result.breakdown.reduce((sum, l) => sum + l.points, 0);
    expect(summed).toBe(result.score);
  });
});

describe("caps — the guard against overclaiming", () => {
  it("caps a lead whose website was actually found, however many signals fired", () => {
    // The whole point: contrary evidence beats accumulated supporting signal.
    const result = scoreConfidence(allTrue(), "website_found");
    expect(result.score).toBe(10);
    expect(result.band).toBe("manual");
    expect(result.cappedBy).toMatch(/independent website was found/i);
  });

  it("caps an inconclusive lead below the medium threshold", () => {
    const result = scoreConfidence(allTrue(), "needs_manual_review");
    expect(result.score).toBe(55);
    // This is the number that matters: 55 < 60, so a needs-review lead can
    // never clear the default confidence threshold and be shown as qualified.
    expect(result.score).toBeLessThan(CONFIDENCE_MEDIUM_MIN);
    expect(result.band).toBe("manual");
  });

  it("caps a lead we could not verify", () => {
    const result = scoreConfidence(allTrue(), "unable_to_verify");
    expect(result.score).toBe(45);
    expect(result.score).toBeLessThan(CONFIDENCE_MEDIUM_MIN);
  });

  it("caps thin evidence even when the status is qualifying", () => {
    // Five signals true, five never established. Raw score would be high, but
    // half the checks never ran.
    const thin = emptySignals();
    thin.facebook_page_confirmed = true;
    thin.fb_profile_lists_no_website = true;
    thin.no_site_in_name_search = true;
    thin.provider_no_website_uri = true;
    thin.no_own_domain_email = true;

    const result = scoreConfidence(thin, "facebook_only");
    expect(result.unknowns).toBe(5);
    expect(result.score).toBe(45);
    expect(result.cappedBy).toMatch(/checks completed/i);
  });

  it("does not cap when only a few signals are unknown", () => {
    const mostly = allTrue();
    mostly.no_site_in_address_search = null;
    mostly.only_social_or_directory = null;

    const result = scoreConfidence(mostly, "facebook_only");
    expect(result.unknowns).toBe(2);
    expect(result.cappedBy).toBeNull();
    expect(result.score).toBe(100 - 5 - 3);
  });

  it("never caps a score that is already below the cap", () => {
    const result = scoreConfidence(signals("name_is_distinctive"), "needs_manual_review");
    expect(result.score).toBe(4);
    expect(result.cappedBy).toBeNull();
  });

  it("keeps every score inside 0..100", () => {
    for (const status of [
      "no_website_found",
      "facebook_only",
      "website_found",
      "needs_manual_review",
      "unable_to_verify",
    ] as const) {
      const result = scoreConfidence(allTrue(), status);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("bands", () => {
  it("reaches high confidence only on strong, complete evidence", () => {
    const strong = allTrue();
    strong.no_site_in_address_search = false;
    const result = scoreConfidence(strong, "facebook_only");
    expect(result.score).toBeGreaterThanOrEqual(CONFIDENCE_HIGH_MIN);
    expect(result.band).toBe("high");
  });

  it("lands in medium for a partial but complete-enough picture", () => {
    const result = scoreConfidence(
      signals(
        "facebook_page_confirmed",
        "fb_profile_lists_no_website",
        "no_site_in_name_search",
        "provider_no_website_uri",
        "no_own_domain_email",
      ),
      "facebook_only",
    );
    expect(result.score).toBe(72);
    expect(result.band).toBe("medium");
  });
});

describe("isDistinctiveName", () => {
  it("accepts a name with something specific in it", () => {
    expect(isDistinctiveName(normalizeBusinessName("Bergstrom Hydronics"))).toBe(true);
    expect(isDistinctiveName(normalizeBusinessName("Shear Genius Salon"))).toBe(true);
    expect(isDistinctiveName(normalizeBusinessName("Rosalita's Taqueria"))).toBe(true);
  });

  it("rejects a name made entirely of generic trade words", () => {
    // Searching "home services" and finding no website proves nothing.
    expect(isDistinctiveName(normalizeBusinessName("Home Services"))).toBe(false);
    expect(isDistinctiveName(normalizeBusinessName("Quality Auto Repair"))).toBe(false);
    expect(isDistinctiveName(normalizeBusinessName("The Best Local Plumbing Co"))).toBe(false);
  });

  it("rejects a single-word name", () => {
    // Too little to search on either way.
    expect(isDistinctiveName("bergstrom")).toBe(false);
  });

  it("handles empty and null input", () => {
    expect(isDistinctiveName("")).toBe(false);
    expect(isDistinctiveName(null)).toBe(false);
    expect(isDistinctiveName(undefined)).toBe(false);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createMockProvider } from "./mock.provider";

/**
 * Compliance guard: this application must never construct or guess an email
 * address (no "firstname@domain" pattern-building). Only addresses literally
 * present in fetched public content may ever be reported. See
 * types.ts's `findPublicEmail` contract and COMPLIANCE.md.
 *
 * Two layers of proof:
 *   1. Static — grep every provider source file for the shapes an
 *      address-construction implementation would necessarily contain.
 *   2. Behavioural — run the mock provider's findPublicEmail across every
 *      fixture and confirm every non-null result traces back to a value the
 *      fixture already had on file, never a value derived from the business's
 *      name or domain.
 */

const PROVIDERS_DIR = import.meta.dirname;

function providerSourceFiles(): string[] {
  return readdirSync(PROVIDERS_DIR)
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".server.ts")) && !f.includes(".test."))
    .map((f) => join(PROVIDERS_DIR, f));
}

describe("no email-construction code path exists", () => {
  const files = providerSourceFiles();

  it("found provider files to scan", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("no file assembles an address with a template literal containing '@'", () => {
    // The pattern a naive "guess the email" implementation would use:
    // `${something}@${domain}`. A legitimate provider never needs to build a
    // string shaped like that — every email it returns comes from parsed page
    // content, not from concatenation.
    const emailTemplatePattern = /`[^`]*\$\{[^}]*\}@\$\{[^}]*\}[^`]*`/;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} appears to construct an email address`).not.toMatch(
        emailTemplatePattern,
      );
    }
  });

  it("no file contains a common name-guessing local-part list", () => {
    // The other classic shape: a hardcoded list of likely mailbox names tried
    // against a domain (info@, contact@, sales@, admin@...).
    const guessListPattern = /\[\s*"info@|"contact@|"sales@|"admin@|"hello@"\s*,/i;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} appears to contain an email-guessing list`).not.toMatch(
        guessListPattern,
      );
    }
  });
});

describe("mock provider never returns a constructed email", () => {
  it("every non-null email traces to a fixture value, not a derived string", async () => {
    const provider = createMockProvider();
    const { MOCK_BUSINESS_POOL } = await import("./mock.provider");

    let checkedAtLeastOne = false;
    for (const business of MOCK_BUSINESS_POOL) {
      const result = await provider.findPublicEmail(business);
      if (result.email !== null) {
        checkedAtLeastOne = true;
        // The fixture itself must already carry this exact value — proving
        // the provider read it rather than built it from the business name.
        expect((business as { email: string | null }).email).toBe(result.email);
        // And it must not merely resemble firstname@businessdomain — assert it
        // isn't silently equal to a constructed guess either.
        const guessedFromName = `${business.name.toLowerCase().replace(/\s+/g, "")}@${business.name.toLowerCase().replace(/\s+/g, "")}.com`;
        expect(result.email).not.toBe(guessedFromName);
      }
    }
    expect(checkedAtLeastOne).toBe(true);
  });

  it("status is not_found rather than a fabricated guess when no email is on file", async () => {
    const provider = createMockProvider();
    const { MOCK_BUSINESS_POOL } = await import("./mock.provider");
    const noEmailBusiness = MOCK_BUSINESS_POOL.find((b) => b.scenario === "no_email")!;

    const result = await provider.findPublicEmail(noEmailBusiness);
    expect(result.email).toBeNull();
    expect(result.status).toBe("not_found");
  });
});

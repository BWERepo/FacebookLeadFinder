import { describe, expect, it } from "vitest";

import {
  emailDomain,
  isFreeEmailDomain,
  isSafeExternalUrl,
  isValidEmail,
  normalizeUrl,
  registrableDomain,
} from "./url";

describe("normalizeUrl", () => {
  it("canonicalizes an ordinary URL", () => {
    const result = normalizeUrl("https://WWW.JoesPlumbing.com/Services/");
    expect(result).not.toBeNull();
    expect(result!.url).toBe("https://joesplumbing.com/Services");
    expect(result!.host).toBe("joesplumbing.com");
    expect(result!.path).toBe("/Services");
    expect(result!.scheme).toBe("https");
  });

  it("assumes https for a bare domain, because that is how spreadsheets store them", () => {
    expect(normalizeUrl("joesplumbing.com")?.url).toBe("https://joesplumbing.com");
    expect(normalizeUrl("  example.com/about  ")?.url).toBe("https://example.com/about");
  });

  it("preserves an explicit http scheme rather than upgrading it", () => {
    // Whether a site has TLS is not our business to assert.
    const result = normalizeUrl("http://oldshop.com");
    expect(result!.scheme).toBe("http");
    expect(result!.url).toBe("http://oldshop.com");
  });

  it("strips the fragment", () => {
    expect(normalizeUrl("https://example.com/about#team")?.url).toBe("https://example.com/about");
  });

  it("strips tracking parameters but keeps real ones", () => {
    const result = normalizeUrl(
      "https://example.com/shop?utm_source=fb&fbclid=abc123&category=tools&gclid=x",
    );
    expect(result!.url).toBe("https://example.com/shop?category=tools");
  });

  it("sorts query parameters so equivalent URLs canonicalize identically", () => {
    const a = normalizeUrl("https://example.com/p?b=2&a=1");
    const b = normalizeUrl("https://example.com/p?a=1&b=2");
    expect(a!.url).toBe(b!.url);
  });

  it("treats www, trailing slash and case as the same URL", () => {
    const forms = [
      "https://www.example.com/about/",
      "https://example.com/about",
      "HTTPS://WWW.EXAMPLE.COM/about",
    ];
    const normalized = forms.map((f) => normalizeUrl(f)!.url);
    expect(new Set(normalized).size).toBe(1);
  });

  it("rejects non-http schemes", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeUrl("mailto:hi@example.com")).toBeNull();
    expect(normalizeUrl("ftp://files.example.com")).toBeNull();
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("does not turn a dangerous scheme into a valid URL by prefixing https", () => {
    // The scheme-detection branch exists precisely to stop
    // "javascript:alert(1)" becoming "https://javascript:alert(1)".
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects URLs carrying credentials", () => {
    expect(normalizeUrl("https://user:pass@example.com")).toBeNull();
  });

  it("rejects hosts that are not real public domains", () => {
    expect(normalizeUrl("https://localhost:3000")).toBeNull();
    expect(normalizeUrl("https://127.0.0.1/admin")).toBeNull();
    expect(normalizeUrl("https://intranet")).toBeNull();
    expect(normalizeUrl("https://a b.com")).toBeNull();
  });

  it("rejects empty and non-string input", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
  });

  it("rejects control characters that browsers would strip", () => {
    expect(normalizeUrl("jav\tascript:alert(1)")).toBeNull();
    expect(normalizeUrl("https://exam\nple.com")).toBeNull();
  });

  it("drops a trailing dot on a fully qualified host", () => {
    expect(normalizeUrl("https://example.com./about")?.host).toBe("example.com");
  });
});

describe("registrableDomain", () => {
  it("returns the last two labels for a normal domain", () => {
    expect(registrableDomain("example.com")).toBe("example.com");
    expect(registrableDomain("shop.example.com")).toBe("example.com");
    expect(registrableDomain("a.b.c.example.com")).toBe("example.com");
  });

  it("collapses every Facebook subdomain to facebook.com", () => {
    // This is what makes the exclusion list resistant to m./mbasic./locale
    // prefixes without listing each one.
    for (const host of [
      "facebook.com",
      "m.facebook.com",
      "mbasic.facebook.com",
      "en-gb.facebook.com",
      "web.facebook.com",
      "business.facebook.com",
    ]) {
      expect(registrableDomain(host)).toBe("facebook.com");
    }
  });

  it("handles known multi-part suffixes", () => {
    expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("example.com.au")).toBe("example.com.au");
    expect(registrableDomain("a.b.example.co.nz")).toBe("example.co.nz");
  });

  it("documents the limitation for suffixes outside the bundled list", () => {
    // Not on the list, so this returns "co.ke" rather than "example.co.ke".
    // Accepted trade-off: the consequence is an extra manual review, not a
    // false claim, and this tool searches US businesses.
    expect(registrableDomain("example.co.ke")).toBe("co.ke");
  });
});

describe("isSafeExternalUrl", () => {
  it("accepts plain http and https URLs", () => {
    expect(isSafeExternalUrl("https://facebook.com/joesplumbing")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
  });

  it("requires an explicit scheme, unlike normalizeUrl", () => {
    // A bare domain is fine as *data*, but this function gates what becomes a
    // clickable link, so it refuses to guess.
    expect(isSafeExternalUrl("example.com")).toBe(false);
  });

  it("rejects the schemes that make a hyperlink dangerous", () => {
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeExternalUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeExternalUrl("file://server/share/payload.exe")).toBe(false);
  });

  it("rejects UNC paths, which Excel would treat as a network location", () => {
    expect(isSafeExternalUrl("\\\\server\\share\\payload.xlsm")).toBe(false);
  });

  it("rejects embedded credentials", () => {
    expect(isSafeExternalUrl("https://user:pass@evil.example")).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl("   ")).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
    expect(isSafeExternalUrl(undefined)).toBe(false);
  });
});

describe("emailDomain", () => {
  it("extracts and lowercases the domain", () => {
    expect(emailDomain("Info@JoesPlumbing.com")).toBe("joesplumbing.com");
  });

  it("uses the last @ so plus-addressed and quoted locals still work", () => {
    expect(emailDomain("weird@local@example.com")).toBe("example.com");
  });

  it("returns null for anything that isn't an address with a dotted domain", () => {
    expect(emailDomain("notanemail")).toBeNull();
    expect(emailDomain("@example.com")).toBeNull();
    expect(emailDomain("info@")).toBeNull();
    expect(emailDomain("info@localhost")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });
});

describe("isFreeEmailDomain", () => {
  it("recognizes consumer mailbox providers", () => {
    expect(isFreeEmailDomain("gmail.com")).toBe(true);
    expect(isFreeEmailDomain("YAHOO.COM")).toBe(true);
    expect(isFreeEmailDomain("comcast.net")).toBe(true);
  });

  it("treats a business's own domain as not free", () => {
    // This is the distinction the confidence rubric depends on: an address at
    // the business's own domain implies a website exists.
    expect(isFreeEmailDomain("joesplumbing.com")).toBe(false);
  });

  it("handles null", () => {
    expect(isFreeEmailDomain(null)).toBe(false);
    expect(isFreeEmailDomain(undefined)).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts realistic business addresses", () => {
    expect(isValidEmail("info@joesplumbing.com")).toBe(true);
    expect(isValidEmail("joe.smith+leads@example.co.uk")).toBe(true);
    expect(isValidEmail("  hello@example.com  ")).toBe(true);
  });

  it("rejects the malformed values spreadsheets are full of", () => {
    expect(isValidEmail("not an email")).toBe(false);
    expect(isValidEmail("info@")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("info@example")).toBe(false);
    expect(isValidEmail("info example.com")).toBe(false);
    expect(isValidEmail(".leading@example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
  });

  it("rejects absurdly long values", () => {
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

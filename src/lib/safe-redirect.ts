/**
 * Normalize a `?next=` value into a path we're willing to redirect to after
 * login.
 *
 * The login page takes its destination from the query string, which means an
 * attacker can hand someone a link to our real, legitimate login page whose
 * `next` points somewhere else entirely. Accepting anything but a same-origin
 * path would turn this into an open redirect: the victim sees our domain, logs
 * in for real, and lands on the attacker's page.
 *
 * Returns `undefined` for anything that isn't a plain absolute path, so callers
 * can fall back to a known-safe default.
 */
export function safeRedirectPath(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;

  // Reject control characters and spaces outright rather than trimming them.
  // Browsers strip \t, \n and \r from a URL *before* parsing it, so
  // "/\tjavascript:alert(1)" would sail past a naive startsWith("/") check and
  // then be read as a javascript: URL. A legitimate path never contains a raw
  // space either — it would be percent-encoded.
  for (const char of value) {
    if (char.codePointAt(0)! <= 0x20 || char.codePointAt(0) === 0x7f) return undefined;
  }

  // Backslashes are a browser-normalization trap: several browsers treat
  // "/\evil.example" and "\\evil.example" as protocol-relative URLs.
  if (value.includes("\\")) return undefined;

  // Must be an absolute path, and must not be protocol-relative ("//host").
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;

  return value;
}

# Compliance

Facebook Lead Finder finds businesses that run a Facebook page but appear to
have no independent website. This document is the authoritative statement of
what the app does and does not do to answer that question, and why the code
is structured the way it is. Every claim below is enforced in code, not just
policy — the references point at the file that enforces it.

## 1. No scraping, no bypassing

- **Facebook is never accessed programmatically.** No request in this
  codebase is made to a `facebook.com` (or subdomain) endpoint. A Facebook URL
  that appears in a lead comes from a provider's own listing data (e.g.
  Google Places' `websiteUri` field pointing at a Facebook page) or from a
  user pasting a URL in manually — never from this app visiting Facebook.
- **No authentication is bypassed or simulated.** There is no Facebook login,
  session, cookie jar, or credential of any kind anywhere in this codebase.
- **No CAPTCHA is solved or circumvented.** Nothing here automates, defeats,
  or works around a bot challenge on any site.
- **`robots.txt` and rate limits are respected.** Every place this app
  fetches an arbitrary third-party page —
  [`page-probe.server.ts`](src/lib/providers/page-probe.server.ts) (checking
  whether a candidate website is reachable) and
  [`brave-search.server.ts`](src/lib/providers/brave-search.server.ts)
  (scanning a search result page for a published email) — identifies itself
  honestly with a real User-Agent (`FacebookLeadFinderBot/1.0`) rather than
  spoofing a browser, uses a real timeout instead of hammering a slow server,
  and goes through [`fetchWithBackoff`](src/lib/providers/http.ts), which
  backs off exponentially on 429/5xx rather than retrying aggressively.
- **No unauthorized Facebook or Meta endpoint is ever called**, by
  construction: the provider abstraction
  ([`src/lib/providers/types.ts`](src/lib/providers/types.ts)) is the only
  boundary through which candidate data enters the app, and every
  implementation behind it (`mock.provider.ts`,
  `google-places.provider.server.ts`, `brave-search.server.ts`, the
  documented-but-unimplemented Bing/SerpApi stubs) talks only to its own
  named, compliant API — Google's, Brave's, or a page a search result
  actually points at, never Facebook's. Auditing "does this app talk to
  Facebook" is answerable by reading a handful of files, not the whole
  codebase.

## 2. Compliant data sources only

Every candidate business enters the app through one of:

- **The Google Places API (New) v1** — a licensed, paid API
  ([`google-places.provider.server.ts`](src/lib/providers/google-places.provider.server.ts)).
- **The Brave Search API** — a licensed API with a free tier
  ([`brave-search.server.ts`](src/lib/providers/brave-search.server.ts)),
  used for: a secondary email-discovery step for a business Places found
  with no website of its own (§3); confirming whether such a business has a
  Facebook page, when Places' own listing doesn't say; and discovering
  candidate businesses via a `site:facebook.com` web search, for businesses
  Places' own search missed or ranked low. That last one still isn't Brave
  acting as a structured business directory the way Places is — it reads a
  Facebook page's title/URL exactly as Brave already indexed them (never
  fetching Facebook itself), then looks the resulting business name up for
  real via Places before treating it as an actual candidate.
- **A user-supplied CSV/XLSX import** — the user's own data, brought in
  through the Phase 10 import wizard.
- **A Facebook URL a user pastes in manually** — never fetched by this app on
  the user's behalf beyond the same reachability probe every other candidate
  URL gets.
- **The built-in mock provider** — a fixed, fictional fixture pool, used so
  the entire app is explorable with zero paid API keys and zero live network
  calls (see [`mock.provider.ts`](src/lib/providers/mock.provider.ts) and
  [`demo-data.ts`](src/lib/demo-data.ts)).

No other data source exists. Bing and SerpApi are documented, unimplemented
stubs (`bing.provider.stub.ts`, `serpapi.provider.stub.ts`) that exist only so
the `SearchProvider` interface has a complete, honest inventory of what this
app could support — setting an API key for one of them does nothing until an
adapter is actually written. `brave.provider.stub.ts` is the same kind of
stub for Brave as a *standalone* `SearchProvider`; the live integration
described above is narrower — an internal helper Google Places calls, not a
selectable provider in Settings.

## 3. Email addresses are never guessed

`findPublicEmail` on every provider — mock and Google Places alike — returns
only an address that was literally present in fetched public content. Nothing
in this codebase constructs an address from a pattern (`firstname@domain`,
`info@domain`, etc.). Google Places (New) does not return an email field at
all, so its adapter falls back to a Brave Search web lookup (optional — a
no-op without `BRAVE_SEARCH_API_KEY`) for a business with no website of its
own: it searches the open web by business name and location, then scans
whatever public pages turn up (directories, listings, mentions) — **never
Facebook** — for a literal published address. See
[`google-places.provider.server.ts`](src/lib/providers/google-places.provider.server.ts)
and
[`brave-search.server.ts`](src/lib/providers/brave-search.server.ts).
[`email-discovery.test.ts`](src/lib/providers/email-discovery.test.ts) asserts
this module has no address-construction code path at all, so a future change
that tried to add one would fail a test, not just violate an unenforced
policy.

## 4. Qualification is a conservative, explainable claim

A lead is presented as **qualified** — meaning "has a Facebook page and no
separate website could be found" — only when both of the following hold,
checked independently and redundantly:

1. `website_status` is `no_website_found` or `facebook_only`, **and**
2. a Facebook page URL was actually confirmed.

This is enforced in three separate places that all have to agree:

- The pure decision logic in
  [`verification.ts`](src/lib/verification.ts)'s `classifyWebsite`.
- A Postgres `CHECK` constraint on `leads.qualified` itself
  (`leads_qualified_requires_evidence`, in the leads migration) — it is not
  possible to write a qualified row to the database that doesn't meet this
  rule, no matter what code path is doing the writing.
- Since Phase 11, the user's own confidence threshold
  (`user_settings.confidence_threshold`) is an _additional_ gate — a lead must
  also clear that score, not just have the right status — enforced in
  `processCandidate` in
  [`searches.functions.ts`](src/lib/searches.functions.ts).

Anything uncertain becomes `needs_manual_review` — never a qualifying status.
A demo or imported lead (Phases 7 and 10) is never claimed to be verified: its
`website_status` is always `needs_manual_review` and `qualified` is always
`false`, because this app never actually ran its verification pipeline
against it — see [`demo-data.ts`](src/lib/demo-data.ts) and
[`import-mapping.ts`](src/lib/import-mapping.ts).

## 5. SSRF: the outbound fetch boundary is guarded

A business's own "website" field, wherever it comes from, is ultimately
attacker- or business-owner-supplied data: anyone can set their Google
Business Profile's website field to an internal address (`http://10.0.0.5`),
a cloud metadata endpoint (`http://169.254.169.254/...`), or a non-http(s)
scheme. Before any such URL is fetched from inside the Worker:

- [`normalizeUrl`](src/lib/url.ts) rejects non-http(s) schemes, embedded
  credentials, control characters, and **any IP-literal host** (IPv4 or
  IPv6), not just the loopback addresses in its small hardcoded blocklist —
  this is what stops a "website" field from reaching an internal service.
- `processCandidate` in
  [`searches.functions.ts`](src/lib/searches.functions.ts) validates a
  candidate URL with `normalizeUrl` before calling `provider.verifyWebsite`.
- [`probePage`](src/lib/providers/page-probe.server.ts) — the actual fetch
  boundary — re-checks with `normalizeUrl` itself, so the guard holds even if
  a future caller forgets to check first.

## 6. Spreadsheet-injection defense on every export

CSV and XLSX exports (Phase 9) treat every cell of third-party data (a
business name, a note, anything scraped or imported) as untrusted: a value
beginning with `=`, `+`, `-`, or `@` — the standard way to turn a data export
into formula execution when it's opened in Excel — is neutralized with a
leading apostrophe before it's written. Hyperlink cells are validated with
`isSafeExternalUrl` instead (prefixing would corrupt the visible link text).
See [`export-sanitize.ts`](src/lib/export-sanitize.ts) and
[`export.server.ts`](src/lib/export.server.ts).

## 7. Notification and rate-limit summary

| Concern                          | Where it's handled                                                                                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outbound rate limiting / backoff | [`http.ts`](src/lib/providers/http.ts) — `TokenBucket`, `fetchWithBackoff`                                                                                                                                                                                     |
| Honest User-Agent                | [`page-probe.server.ts`](src/lib/providers/page-probe.server.ts)                                                                                                                                                                                               |
| Provider credential isolation    | Cloudflare Worker secrets only, read via `process.env` in server-only (`*.server.ts`/`*.functions.ts`) modules — never a `VITE_`-prefixed variable, never returned to the browser (see `user_settings`' migration and `settings.functions.ts`'s `getSettings`) |
| Row-level security               | Every table is a shared workspace (`is_member`) with per-row author checks where attribution matters (notes, activity log) — see the migrations under `supabase/migrations/`                                                                                   |
| Audit trail                      | `lead_activities` — append-only; `authenticated` has `SELECT`/`INSERT` only, no `UPDATE`/`DELETE` grant at all, so a log that can be edited is not possible                                                                                                    |

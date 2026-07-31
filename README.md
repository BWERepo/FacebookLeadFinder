# Facebook Lead Finder

An internal prospecting tool for **Business Web Express**. It finds local
businesses that run a Facebook business page but have **no website of their
own** — the businesses most likely to want one.

> **Status:** under active construction. See [Implementation phases](#implementation-phases)
> for what is built and what is not.

---

## What it does

Search for candidate businesses three ways:

1. **ZIP code** + a radius in miles
2. **Telephone area code** (optionally narrowed by city or state)
3. **State + county** (optionally narrowed by city)

For each candidate the app collects public business information, checks whether
an independent website exists, and assigns a verification status. A lead only
counts as **qualified** when it has a confirmed Facebook business page _and_ no
separate website could be found.

### Website verification statuses

| Status                | Meaning                                                              | Qualified? |
| --------------------- | -------------------------------------------------------------------- | ---------- |
| `No Website Found`    | A Facebook page is confirmed and no independent site turned up       | Yes        |
| `Facebook Only`       | The business's only web presence is its Facebook page                | Yes        |
| `Website Found`       | An independent business website was identified                       | No         |
| `Needs Manual Review` | The evidence is ambiguous — a human should look                      | No         |
| `Unable to Verify`    | Verification could not be completed (provider error, too few checks) | No         |

Uncertain records are **never** presented as confirmed website-free businesses.
That rule is enforced in `src/lib/verification.ts`, not just in the UI.

---

## Compliance

This tool does **not** scrape Facebook, and is built so that it cannot start to.

- No Facebook authentication is bypassed, simulated, or automated.
- No CAPTCHAs are solved or circumvented.
- No rate limits or `robots.txt` directives are ignored.
- No unauthorized Facebook or Meta endpoints are called.

Candidate data comes only from compliant sources: the Google Places API, public
business directories, search APIs, user-supplied CSV/XLSX imports, and Facebook
URLs a user pastes in manually. The provider layer is an interface
(`src/lib/providers/types.ts`), so a licensed Meta or Facebook API can be added
later without touching the rest of the application.

Email addresses are **never guessed or constructed**. Only addresses literally
published on a public page are recorded; everything else is reported as
"Not Found".

Full detail lives in [COMPLIANCE.md](./COMPLIANCE.md).

---

## Technology

| Layer           | Choice                                                            |
| --------------- | ----------------------------------------------------------------- |
| Framework       | TanStack Start (React 19, file-based routing, server functions)   |
| Build           | Vite 8 + Nitro, bundled to a Cloudflare Worker                    |
| Language        | TypeScript (strict)                                               |
| Styling         | Tailwind CSS v4 (CSS-first theme in `src/styles.css`) + shadcn/ui |
| Database & auth | Supabase (Postgres + Row Level Security)                          |
| Validation      | Zod                                                               |
| Charts          | Recharts                                                          |
| Tests           | Vitest (+ Testing Library for component tests)                    |
| Lint/format     | ESLint (flat config) with Prettier running through it             |

This mirrors the sibling Business Web Express app, minus its Lovable-specific
Vite wrapper — see the comment at the top of `vite.config.ts`.

---

## Local setup

```bash
npm install
cp .env.example .env    # then fill in the Supabase values
npm run dev             # http://localhost:8080
```

Scripts:

| Command             | Does                                   |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Dev server with HMR                    |
| `npm run build`     | Production build to `.output/`         |
| `npm run typecheck` | `tsc --noEmit`                         |
| `npm run lint`      | ESLint (includes Prettier)             |
| `npm run format`    | Rewrite files with Prettier            |
| `npm test`          | Vitest, single run                     |
| `npm run deploy`    | Build and deploy to the staging Worker |

---

## Environment variables

See [`.env.example`](./.env.example) for the annotated list. The rule that
matters:

- `VITE_*` variables are **inlined into the browser bundle**. Public values only.
- Everything else is read from `process.env` inside the Worker.
- Genuine secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`) are
  **Cloudflare Worker secrets**, never committed:

  ```bash
  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --name facebookleadfinder-staging
  ```

`npm run check:secrets` diffs secret _names_ (never values) between the staging
and production Workers so the two can't silently drift apart.

---

## Deployment

Cloudflare Workers, via Nitro's `cloudflare-module` preset.

```bash
node scripts/deploy.mjs staging      # -> facebookleadfinder-staging
node scripts/deploy.mjs production   # -> facebookleadfinder
```

`wrangler.jsonc` at the repo root is the committed config. Nitro merges it into
the generated `.output/server/wrangler.json` at build time and always overrides
`main` and `assets` — don't set those yourself. `scripts/deploy.mjs` rewrites
only the Worker `name` (and, for production, the custom-domain routes) after the
build, because Nitro reads exactly one wrangler file.

---

## Implementation phases

| Phase | Scope                                                            | Status |
| ----- | ---------------------------------------------------------------- | ------ |
| 1     | Scaffold, build pipeline, app shell, auth page                   | Done   |
| 2     | Supabase schema, migrations, RLS, sign-in                        | Done   |
| 3     | Pure domain core: verification, confidence, dedupe, sanitization | Done   |
| 4     | Geo data: states, counties, ZIPs, area codes                     | Done   |
| 5     | Mock provider + chunked background search jobs                   | Done   |
| 6     | Leads table and lead details page                                | Done   |
| 7     | Seeded demo data (25+ fictional businesses)                      | Done   |
| 8     | Dashboard and charts                                             | Done   |
| 9     | CSV and XLSX export                                              | Done   |
| 10    | CSV/XLSX import wizard                                           | Done   |
| 11    | Settings and the Google Places adapter                           | Done   |
| 12    | Hardening, documentation, production deploy                      |        |

The application is designed to run **with no paid APIs at all**: the mock
provider plus seeded demo data exercise the entire workflow end to end.

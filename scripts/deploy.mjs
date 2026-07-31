#!/usr/bin/env node
/**
 * Build and deploy to a Cloudflare Worker.
 *
 *   node scripts/deploy.mjs staging      -> facebookleadfinder-staging
 *   node scripts/deploy.mjs production   -> facebookleadfinder (+ custom domain routes)
 *
 * Why the post-build patch: nitro's cloudflare-module preset generates
 * .output/server/wrangler.json by merging the committed wrangler.jsonc with its
 * own overrides. The generated `name` is whatever the committed file says, so
 * shipping to a second environment means rewriting that one field after the
 * build rather than maintaining two wrangler files (nitro only ever reads the
 * nearest one). `main` and `assets` are nitro's to own — never touch them.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENVIRONMENTS = {
  staging: {
    name: "facebookleadfinder-staging",
    // A plain Route (not a Custom Domain) on BWE's zone, since
    // businesswebexpress.com itself is already claimed as a Custom Domain by
    // the Business Web Express production Worker — Custom Domains bind the
    // whole hostname, so this sub-path is carved out via a Route instead,
    // which Cloudflare lets coexist with a Custom Domain on the same zone as
    // long as it's more specific. No "custom_domain": true here.
    routes: [
      {
        pattern: "businesswebexpress.com/Staging.FacebookLeadFinder*",
        zone_name: "businesswebexpress.com",
      },
    ],
    basePath: "/Staging.FacebookLeadFinder/",
  },
  production: {
    name: "facebookleadfinder",
    // Fill in once a custom domain is attached; until then the Worker is
    // reachable at facebookleadfinder.<subdomain>.workers.dev.
    routes: null,
    basePath: "/",
  },
};

// staging bumps the patch digit (0.1.0 -> 0.1.1); production bumps minor and
// resets patch to 0 (0.1.1 -> 0.2.0) — standard semver-ish convention, not
// tied to what actually changed. Every deploy gets its own version number.
const BUMP_LEVEL = { staging: "patch", production: "minor" };

const target = process.argv[2] ?? "staging";
const env = ENVIRONMENTS[target];
if (!env) {
  console.error(`Unknown environment "${target}". Use: ${Object.keys(ENVIRONMENTS).join(" | ")}`);
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const versionFile = resolve(root, "version.json");

function bumpVersion(current, level) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const previousVersion = JSON.parse(readFileSync(versionFile, "utf8")).version;
const version = bumpVersion(previousVersion, BUMP_LEVEL[target]);
writeFileSync(versionFile, JSON.stringify({ version }, null, 2) + "\n");
console.log(`\n=> Bumped version ${previousVersion} -> ${version} (${BUMP_LEVEL[target]})\n`);

function run(cmd, args, { cwd = root, env: extraEnv = {} } = {}) {
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
}

const deployedAt = new Date().toISOString();

console.log(`\n=> Building v${version} for ${target}\n`);
run("npm", ["run", "build"], {
  env: {
    VITE_DEPLOY_APP_VERSION: version,
    VITE_DEPLOY_ENV: target,
    VITE_BASE_PATH: env.basePath,
    VITE_DEPLOY_TIMESTAMP: deployedAt,
  },
});

// Vite's `base` only prefixes the *URLs* referenced in HTML/JS — it doesn't
// relocate the built files. Cloudflare's Workers Assets binding matches a
// request's pathname against a file at the same relative path under the
// configured directory, with no prefix-stripping, so when basePath isn't "/"
// the built assets have to actually live under that sub-path on disk too, or
// every asset request 404s even though the route itself matches.
const trimmedBasePath = env.basePath.replace(/^\/|\/$/g, "");
if (trimmedBasePath) {
  const publicDir = resolve(root, ".output/public");
  const nestedDir = resolve(publicDir, trimmedBasePath);
  mkdirSync(nestedDir, { recursive: true });
  for (const entry of readdirSync(publicDir)) {
    if (entry === trimmedBasePath.split("/")[0]) continue;
    cpSync(resolve(publicDir, entry), resolve(nestedDir, entry), { recursive: true });
    rmSync(resolve(publicDir, entry), { recursive: true, force: true });
  }
  console.log(`\n=> Nested built assets under /${trimmedBasePath}/ to match basePath\n`);
}

const generated = resolve(root, ".output/server/wrangler.json");
const config = JSON.parse(readFileSync(generated, "utf8"));
config.name = env.name;
if (env.routes) config.routes = env.routes;
writeFileSync(generated, JSON.stringify(config, null, 2));
console.log(`\n=> Patched generated wrangler.json: name="${config.name}"\n`);

// Deploy from .output/server so wrangler resolves the generated config and the
// bundled entry relative to itself.
run("npx", ["wrangler", "deploy", "--config", "wrangler.json", "--name", env.name], {
  cwd: resolve(root, ".output/server"),
});

// Committed only after a successful deploy — a failed deploy shouldn't leave
// the repo's version.json out ahead of what's actually live. version.json is
// the only thing touched here; anything else pending stays exactly as the
// caller left it.
run("git", ["add", "version.json"]);
run("git", [
  "commit",
  "-m",
  `Bump version to ${version} for ${target} deploy\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`,
]);
run("git", ["push", "origin", "HEAD"]);
console.log(`\n=> Committed and pushed version.json (v${version})\n`);

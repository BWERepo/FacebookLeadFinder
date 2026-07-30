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
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENVIRONMENTS = {
  staging: { name: "facebookleadfinder-staging", routes: null },
  production: {
    name: "facebookleadfinder",
    // Fill in once a custom domain is attached; until then the Worker is
    // reachable at facebookleadfinder.<subdomain>.workers.dev.
    routes: null,
  },
};

const target = process.argv[2] ?? "staging";
const env = ENVIRONMENTS[target];
if (!env) {
  console.error(`Unknown environment "${target}". Use: ${Object.keys(ENVIRONMENTS).join(" | ")}`);
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");
const version = JSON.parse(readFileSync(resolve(root, "version.json"), "utf8")).version;

function run(cmd, args, { cwd = root, env: extraEnv = {} } = {}) {
  execFileSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
}

console.log(`\n=> Building v${version} for ${target}\n`);
run("npm", ["run", "build"], {
  env: { VITE_DEPLOY_APP_VERSION: version, VITE_DEPLOY_ENV: target },
});

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

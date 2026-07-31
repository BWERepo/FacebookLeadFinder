#!/usr/bin/env bash
# Diffs the secret NAMES (never values - wrangler can't read those back) set
# on the staging and production Workers. Run this occasionally, or before a
# promotion, to catch drift like the stray secret that once sat unused on
# staging only. Exits non-zero if the sets differ.
set -euo pipefail

STAGING_WORKER="facebookleadfinder-staging"
PROD_WORKER="facebookleadfinder"

staging_secrets=$(npx wrangler secret list --name "$STAGING_WORKER" 2>/dev/null | grep -o '"name": *"[^"]*"' | sed 's/"name": *"//; s/"$//' | sort)
prod_secrets=$(npx wrangler secret list --name "$PROD_WORKER" 2>/dev/null | grep -o '"name": *"[^"]*"' | sed 's/"name": *"//; s/"$//' | sort)

only_staging=$(comm -23 <(echo "$staging_secrets") <(echo "$prod_secrets"))
only_prod=$(comm -13 <(echo "$staging_secrets") <(echo "$prod_secrets"))

if [ -z "$only_staging" ] && [ -z "$only_prod" ]; then
  echo "OK: staging and production have the same secret names."
  exit 0
fi

echo "DRIFT DETECTED between $STAGING_WORKER and $PROD_WORKER:"
if [ -n "$only_staging" ]; then
  echo "  Only on staging:"
  echo "$only_staging" | sed 's/^/    - /'
fi
if [ -n "$only_prod" ]; then
  echo "  Only on production:"
  echo "$only_prod" | sed 's/^/    - /'
fi
exit 1

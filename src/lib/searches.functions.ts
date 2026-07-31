/**
 * The search job engine's server functions.
 *
 * There are no Cloudflare Queues or Durable Objects behind this app. A
 * `searches` row IS the durable job (see job-state.ts for the full design
 * rationale); `advanceSearch` is the chunk worker the client calls in a loop.
 * Each call does a bounded amount of work — one discovery page, or a handful
 * of candidate verifications — commits progress to the row, and returns. The
 * client (`use-search-job.ts`) decides whether to call again.
 *
 * Every DB write in the verify phase is per-candidate and independently
 * committed, so a crash mid-chunk loses at most one candidate's progress, not
 * the whole chunk.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchCriteriaSchema, describeCriteria, type SearchCriteria } from "@/lib/search-criteria";
import { resolveCategory } from "@/lib/categories";
import {
  decideNextStep,
  decideTerminalStatus,
  isTerminalStatus,
  CHUNK_WALL_MS,
  LEASE_MS,
  MAX_CANDIDATE_ATTEMPTS,
} from "@/lib/job-state";
import { resolveProvider } from "@/lib/providers/registry";
import type { RawBusiness } from "@/lib/providers/types";
import { classifyWebsite, type CandidateUrl } from "@/lib/verification";
import { scoreConfidence } from "@/lib/confidence";
import {
  DEFAULT_DUPLICATE_RULES,
  findDuplicate,
  mergePatch,
  normalizeAddress,
  normalizeBusinessName,
  normalizeEmail,
  normalizeFacebookUrl,
  normalizePhone,
  type DedupeCandidate,
  type DuplicateRuleSettings,
} from "@/lib/dedupe";
import type { DomainRule } from "@/lib/excluded-domains";
import { emailDomain, isFreeEmailDomain, normalizeUrl } from "@/lib/url";
import { zipsForCounty, zipsForAreaCodeCities } from "@/data/geo";
import { areaCodeInfo } from "@/data/area-codes";
import { QUALIFYING_WEBSITE_STATUSES } from "@/lib/domain";
import { hasContactableIdentity } from "@/lib/candidate-quality";

/** Max concurrently active (pending/running) jobs per user — a rate-limit guard. */
const MAX_CONCURRENT_JOBS_PER_USER = 2;

/** Candidates verified per chunk. Kept modest so SUBREQUEST_BUDGET is never at risk. */
const DEFAULT_CHUNK_SIZE = 5;

const MAX_ZIP_QUEUE = 25;

// ---------------------------------------------------------------------------
// startSearch
// ---------------------------------------------------------------------------

async function createSearchRow(
  supabase: any,
  userId: string,
  criteria: SearchCriteria,
): Promise<{ searchId: string; label: string }> {
  const { count, error: countError } = await supabase
    .from("searches")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "running"]);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= MAX_CONCURRENT_JOBS_PER_USER) {
    throw new Error(
      `Too many searches are already running (max ${MAX_CONCURRENT_JOBS_PER_USER} at once). Wait for one to finish or cancel it.`,
    );
  }

  const { data: settingsRow } = await supabase
    .from("user_settings")
    .select("provider, chunk_size")
    .eq("user_id", userId)
    .maybeSingle();
  const providerName = settingsRow?.provider ?? "mock";

  const category = resolveCategory(criteria.category);
  const zipQueue = buildZipQueue(criteria);
  const notes: string[] = [];
  if (criteria.searchType !== "zip_radius" && zipQueue.length === 0) {
    notes.push(
      "No bundled ZIP data covers this location precisely; discovery will rely on the provider's own location handling.",
    );
  }

  const row = {
    created_by: userId,
    search_type: criteria.searchType,
    zip: criteria.searchType === "zip_radius" ? criteria.zip : null,
    radius_miles: criteria.searchType === "zip_radius" ? criteria.radiusMiles : null,
    area_code: criteria.searchType === "area_code" ? criteria.areaCode : null,
    state:
      criteria.searchType === "area_code"
        ? criteria.state || null
        : criteria.searchType === "state_county"
          ? criteria.state
          : null,
    county: criteria.searchType === "state_county" ? criteria.county : null,
    city:
      criteria.searchType === "area_code" || criteria.searchType === "state_county"
        ? criteria.city
        : null,
    category: category.label,
    category_slug: category.slug,
    max_results: criteria.maxResults,
    criteria,
    provider: providerName,
    cursor: { zipQueue, zipIndex: 0 },
    notes,
  };

  const { data: inserted, error } = await supabase
    .from("searches")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { searchId: inserted.id as string, label: describeCriteria(criteria) };
}

export const startSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => searchCriteriaSchema.parse(data))
  .handler(async ({ data, context }) => createSearchRow(context.supabase, context.userId, data));

function buildZipQueue(criteria: SearchCriteria): string[] {
  if (criteria.searchType === "zip_radius") return [criteria.zip];

  if (criteria.searchType === "state_county") {
    const county = criteria.county;
    return zipsForCounty(criteria.state, county)
      .map((z) => z.zip)
      .slice(0, MAX_ZIP_QUEUE);
  }

  // area_code
  const info = areaCodeInfo(criteria.areaCode);
  if (!info) return [];
  return zipsForAreaCodeCities(criteria.areaCode, info.cities)
    .map((z) => z.zip)
    .slice(0, MAX_ZIP_QUEUE);
}

// ---------------------------------------------------------------------------
// advanceSearch — the chunk worker
// ---------------------------------------------------------------------------

const advanceSchema = z.object({ searchId: z.string().uuid() });

export type SearchProgress = {
  searchId: string;
  status: string;
  phase: string;
  candidatesDiscovered: number;
  candidatesProcessed: number;
  facebookPagesFound: number;
  websitesChecked: number;
  qualifiedFound: number;
  needsReviewFound: number;
  duplicatesSkipped: number;
  providerCalls: number;
  errorCount: number;
  lastError: string | null;
  notes: string[];
  startedAt: string | null;
  /** null while the job is still running — the client computes elapsed time against "now" itself. */
  endedAt: string | null;
};

function toProgress(row: Record<string, unknown>): SearchProgress {
  return {
    searchId: row.id as string,
    status: row.status as string,
    phase: row.phase as string,
    candidatesDiscovered: row.candidates_discovered as number,
    candidatesProcessed: row.candidates_processed as number,
    facebookPagesFound: row.facebook_pages_found as number,
    websitesChecked: row.websites_checked as number,
    qualifiedFound: row.qualified_found as number,
    needsReviewFound: row.needs_review_found as number,
    duplicatesSkipped: row.duplicates_skipped as number,
    providerCalls: row.provider_calls as number,
    errorCount: row.error_count as number,
    lastError: (row.last_error as string | null) ?? null,
    notes: (row.notes as string[] | null) ?? [],
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
  };
}

export const advanceSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => advanceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const deadline = Date.now() + CHUNK_WALL_MS;

    // --- acquire the lease --------------------------------------------------
    // A conditional UPDATE is the whole concurrency guard: two callers racing
    // to advance the same job can't both win this write, because Postgres
    // only lets one UPDATE matching these WHERE conditions succeed before the
    // lease_expires_at value the second caller read goes stale.
    const leaseToken = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const { data: leased } = await supabase
      .from("searches")
      .update({
        lease_token: leaseToken,
        lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
        heartbeat_at: nowIso,
      })
      .eq("id", data.searchId)
      .in("status", ["pending", "running"])
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
      .select("*")
      .maybeSingle();

    if (!leased) {
      // Terminal, or someone else currently holds the lease — either way,
      // return the row as-is so the client can see current progress.
      const { data: current, error } = await supabase
        .from("searches")
        .select("*")
        .eq("id", data.searchId)
        .single();
      if (error) throw new Error(error.message);
      return toProgress(current);
    }

    // First chunk: mark running and record the start time.
    if (leased.status === "pending") {
      await supabase
        .from("searches")
        .update({ status: "running", started_at: nowIso })
        .eq("id", data.searchId);
      leased.status = "running";
    }

    // Typed loosely on purpose: this row is read, patched and re-read across
    // three different phase handlers with different partial shapes each time,
    // and Supabase's generated Row type is stricter than that flow needs.
    const job: any = leased;

    // --- cancellation is checked before any work ----------------------------
    if (job.cancel_requested) {
      const finished = await finalizeJob(supabase, job, "cancelled");
      return toProgress(finished);
    }

    // --- do the phase's work until the deadline -----------------------------
    const { provider, fallbackNote } = resolveProvider(job.provider);
    let notes: string[] = job.notes ?? [];
    if (fallbackNote && !notes.includes(fallbackNote)) notes = [...notes, fallbackNote];

    let updated: any = job;
    if (job.phase === "discover") {
      updated = await runDiscoverChunk(supabase, job, provider, notes, deadline);
    } else if (job.phase === "verify") {
      updated = await runVerifyChunk(supabase, job, provider, deadline);
    }

    // --- decide the next step and, if terminal, finalize --------------------
    const decision = decideNextStep({
      status: updated.status,
      phase: updated.phase,
      cancelRequested: updated.cancel_requested,
      discoveryExhausted: updated.phase !== "discover",
      allCandidatesProcessed: updated.phase === "finalize" || updated.phase === "done",
      candidatesDiscovered: updated.candidates_discovered,
      candidatesProcessed: updated.candidates_processed,
      errorCount: updated.error_count,
    });

    if (decision.action === "finish") {
      const finished = await finalizeJob(supabase, updated, decision.status);
      return toProgress(finished);
    }
    if (decision.action === "run" && decision.phase === "finalize") {
      const status = decideTerminalStatus({
        candidatesDiscovered: updated.candidates_discovered,
        candidatesProcessed: updated.candidates_processed,
        errorCount: updated.error_count,
      });
      const finished = await finalizeJob(supabase, updated, status);
      return toProgress(finished);
    }

    // Release the lease (clear lease_expires_at) so the next chunk isn't
    // needlessly blocked, but leave status/phase for the client to continue.
    const { data: released, error: releaseError } = await supabase
      .from("searches")
      .update({ lease_expires_at: null, heartbeat_at: new Date().toISOString() })
      .eq("id", data.searchId)
      .select("*")
      .single();
    if (releaseError) throw new Error(releaseError.message);
    return toProgress(released);
  });

async function finalizeJob(
  supabase: any,
  job: any,
  status: "completed" | "partially_completed" | "failed" | "cancelled",
) {
  const { data, error } = await supabase
    .from("searches")
    .update({
      status,
      phase: "done",
      lease_token: null,
      lease_expires_at: null,
      ended_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// --- discover phase ----------------------------------------------------------

async function runDiscoverChunk(
  supabase: any,
  job: any,
  provider: ReturnType<typeof resolveProvider>["provider"],
  notes: string[],
  deadline: number,
): Promise<Record<string, unknown>> {
  const criteria = job.criteria as SearchCriteria;
  const cursor =
    (job.cursor as { pageToken?: string; zipQueue?: string[]; zipIndex?: number }) ?? {};

  const page = await provider.searchBusinesses(criteria, cursor);

  let discovered = job.candidates_discovered as number;
  const providerCalls = (job.provider_calls as number) + page.calls;

  // Filter out pseudo-businesses (a county or township itself, returned by a
  // broad area text search) before they ever consume a verify-phase provider
  // call — see candidate-quality.ts.
  const businesses = page.businesses.filter(hasContactableIdentity);

  if (businesses.length > 0) {
    const rows = businesses.map((business) => ({
      search_id: job.id,
      processing_state: "queued",
      raw: business,
      candidate_urls: [],
    }));
    const { error } = await supabase.from("search_results").insert(rows);
    if (error) throw new Error(error.message);
    discovered += businesses.length;
  }

  // A discover chunk always hands off to verify next, one provider page at a
  // time, rather than pulling every page up front — see runVerifyChunk's
  // phase decision, which is what actually decides whether to come back for
  // another page. maxResults is a target lead count now, not a raw-discovery
  // cap: stopping discovery once `discovered >= maxResults` used to mean a
  // search reported "done" after finding N candidates even when none of them
  // qualified, which is the whole reason this loop exists. The remaining,
  // real backstop against a search running forever is the provider's own
  // pagination limit (page.nextPageToken goes null): Google Places caps out
  // around 60 results per search regardless of what's asked for here.
  const { data: updated, error } = await supabase
    .from("searches")
    .update({
      candidates_discovered: discovered,
      provider_calls: providerCalls,
      cursor: { ...cursor, pageToken: page.nextPageToken },
      phase: "verify",
      notes,
      chunk_count: (job.chunk_count as number) + 1,
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return updated;
}

// --- verify phase --------------------------------------------------------------

type LeadRecordForDedupe = DedupeCandidate & { id: string };

/** The subset of Settings that actually change verify-phase behavior. Fetched once per chunk. */
type VerifySettings = {
  countMarketplaceAsWebsite: boolean;
  countGoogleBusinessAsWebsite: boolean;
  confidenceThreshold: number;
  duplicateRules: DuplicateRuleSettings;
  userDomainRules: DomainRule[];
};

async function loadVerifySettings(supabase: any, userId: string): Promise<VerifySettings> {
  const [{ data: settingsRow }, { data: domainRows }] = await Promise.all([
    supabase
      .from("user_settings")
      .select(
        "count_marketplace_as_website, count_google_business_as_website, confidence_threshold, duplicate_rules",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("excluded_domains").select("domain, kind, enabled"),
  ]);

  return {
    countMarketplaceAsWebsite: settingsRow?.count_marketplace_as_website ?? false,
    countGoogleBusinessAsWebsite: settingsRow?.count_google_business_as_website ?? false,
    confidenceThreshold: settingsRow?.confidence_threshold ?? 60,
    duplicateRules: settingsRow?.duplicate_rules ?? DEFAULT_DUPLICATE_RULES,
    userDomainRules: (domainRows ?? []) as DomainRule[],
  };
}

async function runVerifyChunk(
  supabase: any,
  job: any,
  provider: ReturnType<typeof resolveProvider>["provider"],
  deadline: number,
): Promise<Record<string, unknown>> {
  const chunkSize = DEFAULT_CHUNK_SIZE;
  const verifySettings = await loadVerifySettings(supabase, job.created_by);

  const { data: queued, error: queueError } = await supabase
    .from("search_results")
    .select("*")
    .eq("search_id", job.id)
    .eq("processing_state", "queued")
    .order("created_at", { ascending: true })
    .limit(chunkSize);
  if (queueError) throw new Error(queueError.message);

  const counters = {
    processed: job.candidates_processed as number,
    facebookFound: job.facebook_pages_found as number,
    websitesChecked: job.websites_checked as number,
    qualifiedFound: job.qualified_found as number,
    needsReview: job.needs_review_found as number,
    duplicatesSkipped: job.duplicates_skipped as number,
    providerCalls: job.provider_calls as number,
    errorCount: job.error_count as number,
  };
  let lastError: string | null = (job.last_error as string | null) ?? null;

  // A whole chunk can be several websites' worth of outbound fetches — too
  // long to make a user wait out once they've hit cancel. Re-check
  // cancel_requested every couple of candidates (cheap: a single indexed
  // column read) rather than only at the top of the next advanceSearch call.
  const CANCEL_CHECK_INTERVAL = 2;
  let checkedSinceLastCancelCheck = 0;

  for (const result of queued ?? []) {
    if (Date.now() > deadline) break;

    if (checkedSinceLastCancelCheck >= CANCEL_CHECK_INTERVAL) {
      checkedSinceLastCancelCheck = 0;
      const { data: cancelRow } = await supabase
        .from("searches")
        .select("cancel_requested")
        .eq("id", job.id)
        .single();
      if (cancelRow?.cancel_requested) break;
    }
    checkedSinceLastCancelCheck++;

    try {
      await processCandidate(supabase, job, result, provider, counters, verifySettings);
    } catch (err) {
      const attempts = (result.attempts as number) + 1;
      lastError = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_CANDIDATE_ATTEMPTS) {
        await supabase
          .from("search_results")
          .update({ processing_state: "error", attempts, error_message: lastError })
          .eq("id", result.id);
        counters.errorCount++;
        counters.processed++;
      } else {
        await supabase
          .from("search_results")
          .update({ processing_state: "queued", attempts })
          .eq("id", result.id);
      }
    }
  }

  const { count: remaining } = await supabase
    .from("search_results")
    .select("id", { count: "exact", head: true })
    .eq("search_id", job.id)
    .eq("processing_state", "queued");

  // Still work queued from the current page — keep verifying it before
  // deciding anything about going back for another page.
  let phase: string;
  if ((remaining ?? 0) > 0) {
    phase = "verify";
  } else {
    // This page is fully verified. Go back to discover for another page only
    // if the target isn't met yet AND the provider actually has more to give
    // (cursor.pageToken survives from the discover chunk that queued this
    // batch — null means the provider itself is exhausted, not just that
    // this page ran out).
    const cursor = (job.cursor as { pageToken?: string | null } | null) ?? {};
    const providerHasMore = Boolean(cursor.pageToken);
    const { count: matchedCount } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("source_search_id", job.id)
      .in("website_status", QUALIFYING_WEBSITE_STATUSES);
    const targetMet = (matchedCount ?? 0) >= (job.max_results as number);
    phase = !targetMet && providerHasMore ? "discover" : "finalize";
  }

  const { data: updated, error } = await supabase
    .from("searches")
    .update({
      candidates_processed: counters.processed,
      facebook_pages_found: counters.facebookFound,
      websites_checked: counters.websitesChecked,
      qualified_found: counters.qualifiedFound,
      needs_review_found: counters.needsReview,
      duplicates_skipped: counters.duplicatesSkipped,
      provider_calls: counters.providerCalls,
      error_count: counters.errorCount,
      last_error: lastError,
      phase,
      chunk_count: (job.chunk_count as number) + 1,
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return updated;
}

async function processCandidate(
  supabase: any,
  job: any,
  result: any,
  provider: ReturnType<typeof resolveProvider>["provider"],
  counters: {
    processed: number;
    facebookFound: number;
    websitesChecked: number;
    qualifiedFound: number;
    needsReview: number;
    duplicatesSkipped: number;
    providerCalls: number;
    errorCount: number;
  },
  verifySettings: VerifySettings,
): Promise<void> {
  const business = result.raw as RawBusiness;

  await supabase
    .from("search_results")
    .update({ processing_state: "processing" })
    .eq("id", result.id);

  const [fb, email, potentialCandidates] = await Promise.all([
    provider.findFacebookPage(business),
    provider.findPublicEmail(business),
    provider.findPotentialWebsite(business),
  ]);
  counters.providerCalls += 3;

  const enrichedCandidates: CandidateUrl[] = [];
  for (const candidate of potentialCandidates) {
    if (candidate.reachable !== null) {
      enrichedCandidates.push(candidate);
      continue;
    }

    // A real provider's "website" field is ultimately business-owner-supplied
    // data (anyone can set their Google Business Profile's website to an
    // internal or loopback address), and verifyWebsite performs a real
    // outbound fetch from inside the Worker — an SSRF vector if that URL is
    // never validated. normalizeUrl rejects non-http(s) schemes, credentials,
    // and localhost/loopback/non-domain hosts before any fetch is attempted.
    if (!normalizeUrl(candidate.url)) {
      enrichedCandidates.push({ ...candidate, reachable: false, pageTitle: null, pageText: null });
      continue;
    }

    const verified = await provider.verifyWebsite(candidate.url);
    counters.providerCalls += 1;
    enrichedCandidates.push({
      ...candidate,
      reachable: verified.reachable,
      pageTitle: verified.pageTitle ?? candidate.pageTitle,
      pageText: verified.pageText ?? candidate.pageText,
    });
  }

  const domain = email.email ? emailDomain(email.email) : null;

  const verification = classifyWebsite({
    business: {
      name: business.name,
      phone: business.phone,
      city: business.city,
      state: business.state,
      zip: business.zip,
    },
    facebookUrl: fb.url,
    facebookProfileListsWebsite: fb.profileListsWebsite,
    providerWebsiteUri: business.websiteUri,
    emailDomain: domain,
    candidateUrls: enrichedCandidates,
    searchesAttempted: {
      byName: true,
      byPhone: true,
      byAddress: true,
      byEmailDomain: true,
      bySocial: Boolean(fb.url),
    },
    countMarketplaceAsWebsite: verifySettings.countMarketplaceAsWebsite,
    countGoogleBusinessAsWebsite: verifySettings.countGoogleBusinessAsWebsite,
    userDomainRules: verifySettings.userDomainRules,
  });
  const confidence = scoreConfidence(verification.signals, verification.status);
  // A lead must also clear the user's confidence threshold to be presented as
  // qualified — see user_settings' migration comment. classifyWebsite's own
  // `qualified` is necessary (right website status + a confirmed Facebook
  // page) but not sufficient on its own.
  const qualified =
    verification.qualified && confidence.score >= verifySettings.confidenceThreshold;

  if (fb.url) counters.facebookFound++;
  if (potentialCandidates.length > 0) counters.websitesChecked++;

  // Save any candidate with no apparent independent website — a confirmed
  // Facebook page and a found email are both a bonus, not a requirement, for
  // saving. (A confirmed Facebook page is still required for `qualified`,
  // see classifyWebsite in verification.ts.) Everything else (has a site) is
  // examined and counted but never written to the shared leads table. This is
  // what makes the discover/verify loop's "keep pulling more pages until the
  // target count is met" logic (above, in runVerifyChunk) mean the same thing
  // as what actually lands in Saved Leads.
  const meetsSaveCriteria = (QUALIFYING_WEBSITE_STATUSES as readonly string[]).includes(
    verification.status,
  );
  if (!meetsSaveCriteria) {
    await supabase
      .from("search_results")
      .update({
        processing_state: "skipped",
        website_status: verification.status,
        qualified,
        confidence_score: confidence.score,
        error_message: "no apparent independent website required to save a lead",
      })
      .eq("id", result.id);
    counters.processed++;
    return;
  }

  const normalized: DedupeCandidate = {
    normalized_name: normalizeBusinessName(business.name),
    normalized_phone: normalizePhone(business.phone),
    normalized_email: normalizeEmail(email.email),
    normalized_facebook_url: normalizeFacebookUrl(fb.url),
    normalized_address: normalizeAddress(business.address),
    city: business.city,
    state: business.state,
    zip: business.zip,
    provider: business.providerId ? job.provider : null,
    provider_place_id: business.providerId,
  };

  const existing = await findDuplicateCandidates(supabase, normalized);
  const match = findDuplicate(normalized, existing, verifySettings.duplicateRules);

  // Any match at all — certain, probable, or possible — means this business
  // is already a saved lead, so it's excluded here rather than written as a
  // second row; the search keeps going past it rather than stopping, since
  // `runVerifyChunk`'s target-met check only counts leads actually inserted
  // for this job.
  if (match) {
    const patch = mergePatch(
      match.lead as unknown as Record<string, unknown>,
      {
        email: email.email,
        phone: business.phone,
        website_status: verification.status,
        confidence_score: confidence.score,
      } as Record<string, unknown>,
    );
    await supabase
      .from("leads")
      .update({ ...patch, last_checked_at: new Date().toISOString() })
      .eq("id", match.lead.id);
    await supabase.from("lead_activities").insert({
      lead_id: match.lead.id,
      actor_id: job.created_by,
      action: "duplicate_merged",
      description: `Merged a duplicate found by ${match.rule}`,
      detail: { rule: match.rule, search_id: job.id },
    });
    await supabase
      .from("search_results")
      .update({
        processing_state: "processed",
        duplicate_of_lead_id: match.lead.id,
        duplicate_rule: match.rule,
        duplicate_certainty: match.certainty,
        website_status: verification.status,
        qualified,
        confidence_score: confidence.score,
      })
      .eq("id", result.id);
    counters.duplicatesSkipped++;
    counters.processed++;
    return;
  }

  const category = resolveCategory(business.category);
  const leadInsert = {
    created_by: job.created_by,
    business_name: business.name,
    normalized_name: normalized.normalized_name,
    category: category.label,
    category_slug: category.slug,
    address: business.address,
    normalized_address: normalized.normalized_address,
    city: business.city,
    county: business.county,
    state: business.state,
    zip: business.zip,
    latitude: business.latitude,
    longitude: business.longitude,
    phone: business.phone ?? "",
    normalized_phone: normalized.normalized_phone,
    area_code: normalized.normalized_phone?.slice(0, 3) ?? null,
    email: email.email,
    normalized_email: normalized.normalized_email,
    email_status: email.status,
    facebook_url: fb.url,
    normalized_facebook_url: normalized.normalized_facebook_url,
    website_status: verification.status,
    potential_website_url: verification.potentialWebsiteUrl,
    qualified,
    confidence_score: confidence.score,
    confidence_band: confidence.band,
    confidence_breakdown: confidence.breakdown,
    verification_notes: verification.notes.join(" "),
    sources: [
      business.listingUrl ? { source: job.provider, url: business.listingUrl } : null,
      ...enrichedCandidates.map((c) => ({ source: c.source, url: c.url })),
    ].filter(Boolean),
    provider: job.provider,
    provider_place_id: business.providerId,
    source_search_id: job.id,
    last_checked_at: new Date().toISOString(),
  };

  const { data: inserted, error: insertError } = await supabase
    .from("leads")
    .insert(leadInsert)
    .select("id")
    .single();

  // A unique-index race (two chunks discovering the same Facebook URL at
  // once) surfaces as an insert conflict — fall back to the merge path rather
  // than failing the candidate.
  if (insertError) {
    if (insertError.code === "23505") {
      counters.duplicatesSkipped++;
      counters.processed++;
      await supabase
        .from("search_results")
        .update({ processing_state: "skipped", error_message: "duplicate (race)" })
        .eq("id", result.id);
      return;
    }
    throw new Error(insertError.message);
  }

  await supabase.from("lead_activities").insert({
    lead_id: inserted.id,
    actor_id: job.created_by,
    action: "created",
    description: `Found by search`,
    detail: { search_id: job.id },
  });

  if (qualified) counters.qualifiedFound++;
  if (verification.status === "needs_manual_review") counters.needsReview++;
  counters.processed++;

  await supabase
    .from("search_results")
    .update({
      processing_state: "processed",
      lead_id: inserted.id,
      candidate_urls: enrichedCandidates,
      website_status: verification.status,
      qualified,
      confidence_score: confidence.score,
    })
    .eq("id", result.id);
}

/** Narrow the duplicate search space with an indexed OR query before comparing in memory. */
async function findDuplicateCandidates(
  supabase: any,
  candidate: DedupeCandidate,
): Promise<LeadRecordForDedupe[]> {
  const filters: string[] = [];
  if (candidate.normalized_facebook_url) {
    filters.push(`normalized_facebook_url.eq.${candidate.normalized_facebook_url}`);
  }
  if (candidate.normalized_phone) filters.push(`normalized_phone.eq.${candidate.normalized_phone}`);
  if (candidate.normalized_name) filters.push(`normalized_name.eq.${candidate.normalized_name}`);
  if (candidate.normalized_email && !isFreeEmailDomain(emailDomain(candidate.normalized_email))) {
    filters.push(`normalized_email.eq.${candidate.normalized_email}`);
  }
  if (filters.length === 0) return [];

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, normalized_name, normalized_phone, normalized_email, normalized_facebook_url, normalized_address, city, state, zip, provider, provider_place_id",
    )
    .or(filters.join(","))
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadRecordForDedupe[];
}

// ---------------------------------------------------------------------------
// cancelSearch / getSearch / listSearches / deleteSearch / repeatSearch
// ---------------------------------------------------------------------------

const searchIdSchema = z.object({ searchId: z.string().uuid() });

export const cancelSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => searchIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("searches")
      .update({ cancel_requested: true })
      .eq("id", data.searchId);
    if (error) throw new Error(error.message);
    await context.supabase.from("lead_activities").insert({
      actor_id: context.userId,
      action: "search_cancelled",
      description: "Search cancelled",
      detail: { search_id: data.searchId },
    });
    return { ok: true };
  });

export const getSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => searchIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("searches")
      .select("*")
      .eq("id", data.searchId)
      .single();
    if (error) throw new Error(error.message);
    return toProgress(row);
  });

const listSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const listSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      error,
      count,
    } = await context.supabase
      .from("searches")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const deleteSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => searchIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("searches").delete().eq("id", data.searchId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Re-run a past search with the exact same criteria, as a brand-new job. */
export const repeatSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => searchIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: original, error } = await context.supabase
      .from("searches")
      .select("criteria")
      .eq("id", data.searchId)
      .single();
    if (error) throw new Error(error.message);

    const criteria = searchCriteriaSchema.parse(original.criteria);
    return createSearchRow(context.supabase, context.userId, criteria);
  });

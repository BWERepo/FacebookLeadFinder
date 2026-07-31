import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/LoadingBlock";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  addCategory,
  addExcludedDomain,
  deleteExcludedDomain,
  getSettings,
  toggleCategory,
  toggleExcludedDomain,
  updateSettings,
  type UpdateSettingsInput,
} from "@/lib/settings.functions";
import { EXCLUDED_DOMAIN_KIND_LABELS, EXCLUDED_DOMAIN_KINDS } from "@/lib/domain";
import type { ExcludedDomainKind, ExportFormat } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type SettingsData = Awaited<ReturnType<typeof getSettings>>;
type UserSettingsRow = SettingsData["settings"];

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

  if (isLoading || !data) {
    return (
      <>
        <PageHeader
          title="Settings"
          description="Search provider, excluded domains, categories and export preferences."
        />
        <LoadingBlock rows={8} label="Loading settings" />
      </>
    );
  }

  async function refetch() {
    await qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Search provider, excluded domains, categories and export preferences."
      />
      <div className="space-y-4">
        <ProviderCard data={data} onSaved={refetch} />
        <PreferencesCard settings={data.settings} onSaved={refetch} />
        <ExcludedDomainsCard rows={data.excludedDomains} onSaved={refetch} />
        <CategoriesCard rows={data.categories} onSaved={refetch} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

function ProviderCard({ data, onSaved }: { data: SettingsData; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);

  async function handleChange(provider: string) {
    setSaving(true);
    try {
      await updateSettings({ data: { provider } });
      await onSaved();
      toast.success("Search provider updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the provider.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search provider</CardTitle>
        <CardDescription>
          API credentials are Cloudflare Worker secrets — this page only ever shows whether one is
          configured, never the value itself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Active provider</Label>
          <Select value={data.settings.provider} onValueChange={handleChange} disabled={saving}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.providers.map((p) => (
                <SelectItem key={p.name} value={p.name} disabled={!p.available}>
                  {p.name} {p.available ? "" : "(unavailable)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Falls back to the mock provider automatically if this one is unavailable when a search
            runs.
          </p>
        </div>

        <ul className="space-y-1.5">
          {data.providers.map((p) => (
            <li key={p.name} className="flex items-center gap-2 text-sm">
              {p.available ? (
                <CheckCircle2 className="size-4 text-status-qualified" aria-hidden="true" />
              ) : (
                <XCircle className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="font-medium">{p.name}</span>
              {p.name === "google_places" ? (
                <Badge variant="outline" className="font-normal">
                  {data.googlePlaces.configured
                    ? `Key configured (…${data.googlePlaces.tail})`
                    : "No key configured"}
                </Badge>
              ) : null}
              {p.reason ? <span className="text-muted-foreground">— {p.reason}</span> : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

function PreferencesCard({
  settings,
  onSaved,
}: {
  settings: UserSettingsRow;
  onSaved: () => Promise<void>;
}) {
  const [radius, setRadius] = useState(settings.default_radius_miles);
  const [maxResults, setMaxResults] = useState(settings.default_max_results);
  const [threshold, setThreshold] = useState(settings.confidence_threshold);
  const [marketplace, setMarketplace] = useState(settings.count_marketplace_as_website);
  const [googleBusiness, setGoogleBusiness] = useState(settings.count_google_business_as_website);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(settings.export_format);
  const [includeUnqualified, setIncludeUnqualified] = useState(settings.export_include_unqualified);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRadius(settings.default_radius_miles);
    setMaxResults(settings.default_max_results);
    setThreshold(settings.confidence_threshold);
    setMarketplace(settings.count_marketplace_as_website);
    setGoogleBusiness(settings.count_google_business_as_website);
    setExportFormat(settings.export_format);
    setIncludeUnqualified(settings.export_include_unqualified);
  }, [settings]);

  async function save(patch: UpdateSettingsInput) {
    setSaving(true);
    try {
      await updateSettings({ data: patch });
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save that setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search & qualification preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Default radius (miles)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              onBlur={() => save({ default_radius_miles: radius })}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Default max results</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              onBlur={() => save({ default_max_results: maxResults })}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confidence threshold</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onBlur={() => save({ confidence_threshold: threshold })}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              A lead must also clear this score to be marked qualified.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Count marketplace storefronts as a website</p>
            <p className="text-xs text-muted-foreground">
              Off by default — a Square or Etsy storefront is still a good prospect.
            </p>
          </div>
          <Switch
            checked={marketplace}
            onCheckedChange={(v) => {
              setMarketplace(v);
              void save({ count_marketplace_as_website: v });
            }}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <p className="text-sm font-medium">Count a Google Business profile as a website</p>
          <Switch
            checked={googleBusiness}
            onCheckedChange={(v) => {
              setGoogleBusiness(v);
              void save({ count_google_business_as_website: v });
            }}
            disabled={saving}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default export format</Label>
            <Select
              value={exportFormat}
              onValueChange={(v) => {
                setExportFormat(v as ExportFormat);
                void save({ export_format: v as ExportFormat });
              }}
              disabled={saving}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">XLSX</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <p className="text-sm font-medium">Include unqualified leads in exports</p>
            <Switch
              checked={includeUnqualified}
              onCheckedChange={(v) => {
                setIncludeUnqualified(v);
                void save({ export_include_unqualified: v });
              }}
              disabled={saving}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Excluded domains
// ---------------------------------------------------------------------------

type ExcludedDomainRow = {
  id: string;
  domain: string;
  kind: ExcludedDomainKind;
  enabled: boolean;
  is_builtin: boolean;
};

function ExcludedDomainsCard({
  rows,
  onSaved,
}: {
  rows: ExcludedDomainRow[];
  onSaved: () => Promise<void>;
}) {
  const [domain, setDomain] = useState("");
  const [kind, setKind] = useState<ExcludedDomainKind>("directory");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!domain.trim()) return;
    setSaving(true);
    try {
      await addExcludedDomain({ data: { domain: domain.trim(), kind } });
      setDomain("");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that domain.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleExcludedDomain({ data: { id, enabled } });
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that domain.");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExcludedDomain({ data: { id } });
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete that domain.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Excluded domains</CardTitle>
        <CardDescription>
          Domains that never count as a business's own website. Built-ins can be disabled but not
          deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>Domain</Label>
            <Input
              placeholder="example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-56"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as ExcludedDomainKind)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCLUDED_DOMAIN_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {EXCLUDED_DOMAIN_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={saving || !domain.trim()} onClick={handleAdd}>
            Add
          </Button>
        </div>

        <ul className="divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{row.domain}</span>{" "}
                <span className="text-muted-foreground">
                  ({EXCLUDED_DOMAIN_KIND_LABELS[row.kind]})
                </span>
                {row.is_builtin ? (
                  <Badge variant="secondary" className="ml-2 font-normal">
                    Built-in
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(v) => handleToggle(row.id, v)}
                  aria-label={`Enable ${row.domain}`}
                />
                {!row.is_builtin ? (
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)}>
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

type CategoryRow = {
  id: string;
  slug: string;
  label: string;
  enabled: boolean;
  is_preset: boolean;
};

function CategoriesCard({ rows, onSaved }: { rows: CategoryRow[]; onSaved: () => Promise<void> }) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await addCategory({ data: { label: label.trim() } });
      setLabel("");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add that category.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      await toggleCategory({ data: { id, enabled } });
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update that category.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>
          Offered in the search forms. Presets ship with the app; your own can be disabled but a
          preset's slug never changes underneath a saved lead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label>New category</Label>
            <Input
              placeholder="Pool cleaning"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-56"
            />
          </div>
          <Button size="sm" disabled={saving || !label.trim()} onClick={handleAdd}>
            Add
          </Button>
        </div>

        <ul className="divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{row.label}</span>
                {row.is_preset ? (
                  <Badge variant="secondary" className="ml-2 font-normal">
                    Preset
                  </Badge>
                ) : null}
              </div>
              {!row.is_preset ? (
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(v) => handleToggle(row.id, v)}
                  aria-label={`Enable ${row.label}`}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

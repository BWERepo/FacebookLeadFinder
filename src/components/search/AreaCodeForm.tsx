import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryPicker } from "@/components/search/CategoryPicker";
import { areaCodeCriteriaSchema, type AreaCodeCriteria } from "@/lib/search-criteria";
import { STATES } from "@/data/states";
import { AREA_CODES } from "@/data/area-codes";

const OTHER_AREA_CODE = "__other__";

export function AreaCodeForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (criteria: AreaCodeCriteria) => void;
}) {
  const [areaCode, setAreaCode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [maxResults, setMaxResults] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);

  const areaCodeOptions = useMemo(
    () =>
      [...AREA_CODES]
        .map((entry) => ({ ...entry, label: `${entry.cities.join(", ")} (${entry.code})` }))
        .sort(
          (a, b) => a.cities[0].localeCompare(b.cities[0], "en") || a.code.localeCompare(b.code),
        ),
    [],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = areaCodeCriteriaSchema.safeParse({
      searchType: "area_code",
      areaCode,
      city,
      state,
      category,
      maxResults,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the form for errors.");
      return;
    }
    setError(null);
    onSubmit(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="area-code">Area code</Label>
          {customMode ? (
            <>
              <Input
                id="area-code"
                inputMode="numeric"
                placeholder="865"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                maxLength={3}
                required
                autoFocus
              />
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setCustomMode(false);
                  setAreaCode("");
                }}
              >
                Choose from the list instead
              </button>
            </>
          ) : (
            <Select
              value={areaCode}
              onValueChange={(v) => {
                if (v === OTHER_AREA_CODE) {
                  setCustomMode(true);
                  setAreaCode("");
                  return;
                }
                setAreaCode(v);
              }}
            >
              <SelectTrigger id="area-code">
                <SelectValue placeholder="Choose an area" />
              </SelectTrigger>
              <SelectContent>
                {areaCodeOptions.map((entry) => (
                  <SelectItem key={entry.code} value={entry.code}>
                    {entry.label}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_AREA_CODE}>Other (enter manually)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ac-city">City (optional)</Label>
          <Input id="ac-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ac-state">State (optional)</Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger id="ac-state">
              <SelectValue placeholder="Any state" />
            </SelectTrigger>
            <SelectContent>
              {STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <CategoryPicker value={category} onChange={setCategory} id="ac-category" />

      <div className="space-y-1.5">
        <Label htmlFor="ac-max-results">Maximum results</Label>
        <Input
          id="ac-max-results"
          type="number"
          min={1}
          max={500}
          value={maxResults}
          onChange={(e) => setMaxResults(Number(e.target.value))}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={busy}>
        {busy ? "Searching…" : "Find leads"}
      </Button>
    </form>
  );
}

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
import { stateCountyCriteriaSchema, type StateCountyCriteria } from "@/lib/search-criteria";
import { STATES } from "@/data/states";
import { countiesForState, countyDisplayName, hasCountyData } from "@/data/counties";

export function StateCountyForm({
  busy,
  onSubmit,
  defaultMaxResults = 100,
}: {
  busy: boolean;
  onSubmit: (criteria: StateCountyCriteria) => void;
  defaultMaxResults?: number;
}) {
  const [state, setState] = useState("");
  const [county, setCounty] = useState("");
  const [customCounty, setCustomCounty] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [maxResults, setMaxResults] = useState(defaultMaxResults);
  const [error, setError] = useState<string | null>(null);

  const counties = useMemo(() => countiesForState(state), [state]);
  const covered = hasCountyData(state);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const countyValue = covered ? county : customCounty;
    const result = stateCountyCriteriaSchema.safeParse({
      searchType: "state_county",
      state,
      county: countyValue,
      city,
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sc-state">State</Label>
          <Select
            value={state}
            onValueChange={(v) => {
              setState(v);
              setCounty("");
              setCustomCounty("");
            }}
          >
            <SelectTrigger id="sc-state">
              <SelectValue placeholder="Choose a state" />
            </SelectTrigger>
            <SelectContent>
              {STATES.filter((s) => s.isState).map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sc-county">County</Label>
          {covered ? (
            <Select value={county} onValueChange={setCounty} disabled={!state}>
              <SelectTrigger id="sc-county">
                <SelectValue placeholder={state ? "Choose a county" : "Choose a state first"} />
              </SelectTrigger>
              <SelectContent>
                {counties.map((c) => (
                  <SelectItem key={c} value={c}>
                    {countyDisplayName(state, c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input
                id="sc-county"
                placeholder={state ? "Enter a county name" : "Choose a state first"}
                value={customCounty}
                onChange={(e) => setCustomCounty(e.target.value)}
                disabled={!state}
              />
              {state ? (
                <p className="text-xs text-muted-foreground">
                  County dropdown data isn&rsquo;t bundled for this state yet — type the county
                  name.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sc-city">City (optional)</Label>
        <Input id="sc-city" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>

      <CategoryPicker value={category} onChange={setCategory} id="sc-category" />

      <div className="space-y-1.5">
        <Label htmlFor="sc-max-results">Maximum results</Label>
        <Input
          id="sc-max-results"
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

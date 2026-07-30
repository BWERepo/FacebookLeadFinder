import { useState } from "react";

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
          <Input
            id="area-code"
            inputMode="numeric"
            placeholder="865"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value)}
            maxLength={3}
            required
          />
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

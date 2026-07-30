import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CategoryPicker } from "@/components/search/CategoryPicker";
import { zipRadiusCriteriaSchema, type ZipRadiusCriteria } from "@/lib/search-criteria";

export function ZipRadiusForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (criteria: ZipRadiusCriteria) => void;
}) {
  const [zip, setZip] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [category, setCategory] = useState("");
  const [maxResults, setMaxResults] = useState(100);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = zipRadiusCriteriaSchema.safeParse({
      searchType: "zip_radius",
      zip,
      radiusMiles,
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
          <Label htmlFor="zip">ZIP code</Label>
          <Input
            id="zip"
            inputMode="numeric"
            placeholder="37902"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            maxLength={5}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="radius">Search radius (miles)</Label>
          <Input
            id="radius"
            type="number"
            min={1}
            max={100}
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(Number(e.target.value))}
          />
        </div>
      </div>

      <CategoryPicker value={category} onChange={setCategory} />

      <div className="space-y-1.5">
        <Label htmlFor="max-results">Maximum results</Label>
        <Input
          id="max-results"
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

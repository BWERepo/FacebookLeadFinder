import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { zipRadiusCriteriaSchema, type ZipRadiusCriteria } from "@/lib/search-criteria";
import { listAreas } from "@/lib/geo.functions";

export function ZipRadiusForm({
  busy,
  onSubmit,
  defaultMaxResults = 100,
}: {
  busy: boolean;
  onSubmit: (criteria: ZipRadiusCriteria) => void;
  defaultMaxResults?: number;
}) {
  const [zip, setZip] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [category, setCategory] = useState("");
  const [maxResults, setMaxResults] = useState(defaultMaxResults);
  const [error, setError] = useState<string | null>(null);

  const { data: areas } = useQuery({ queryKey: ["known-areas"], queryFn: () => listAreas() });

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
      {areas && areas.length > 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor="zip-known-area">Choose a known area (optional)</Label>
          <Select value="" onValueChange={(value) => setZip(value)}>
            <SelectTrigger id="zip-known-area">
              <SelectValue placeholder="Or type a ZIP code below" />
            </SelectTrigger>
            <SelectContent>
              {areas.map((area) => (
                <SelectItem key={area.zip} value={area.zip}>
                  {area.city}, {area.state}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

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

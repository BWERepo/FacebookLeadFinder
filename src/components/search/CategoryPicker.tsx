import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_PRESETS, OTHER_CATEGORY_SLUG } from "@/lib/categories";

/** Presets plus a free-text "Other" option, per the spec. */
export function CategoryPicker({
  value,
  onChange,
  id = "category",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const matchingPreset = CATEGORY_PRESETS.find((c) => c.label === value);
  const [customMode, setCustomMode] = useState(value !== "" && !matchingPreset);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Business category</Label>
      {customMode ? (
        <div className="flex gap-2">
          <Input
            id={id}
            placeholder="e.g. Pool cleaning"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
        </div>
      ) : (
        <Select
          value={matchingPreset?.label ?? ""}
          onValueChange={(v) => {
            if (v === OTHER_CATEGORY_SLUG) {
              setCustomMode(true);
              onChange("");
              return;
            }
            onChange(v);
          }}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="Any category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_PRESETS.map((preset) => (
              <SelectItem key={preset.slug} value={preset.label}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {customMode ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
        >
          Choose from the list instead
        </button>
      ) : null}
    </div>
  );
}

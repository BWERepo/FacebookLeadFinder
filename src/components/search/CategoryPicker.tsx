import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_PRESETS, OTHER_CATEGORY_SLUG } from "@/lib/categories";

const PRESET_LABELS = CATEGORY_PRESETS.filter((c) => c.slug !== OTHER_CATEGORY_SLUG).map(
  (c) => c.label,
);

/** Split the stored comma-joined value into the preset labels it contains and whatever's left over (the custom entry, if any). */
function parseValue(value: string): { presets: Set<string>; custom: string } {
  const tokens = value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const presets = new Set(tokens.filter((t) => PRESET_LABELS.includes(t)));
  const customTokens = tokens.filter((t) => !PRESET_LABELS.includes(t));
  return { presets, custom: customTokens.join(", ") };
}

function serialize(presets: Set<string>, custom: string): string {
  const orderedPresets = PRESET_LABELS.filter((label) => presets.has(label));
  const trimmedCustom = custom.trim();
  return [...orderedPresets, ...(trimmedCustom ? [trimmedCustom] : [])].join(", ");
}

/**
 * A dropdown of checkboxes so a search can target several categories at
 * once — the picked labels are stored as a single comma-joined string in
 * `criteria.category`, which is what every downstream consumer (textQueryFor,
 * describeCriteria, category resolution) already expects; nothing downstream
 * needs to know this field can now hold more than one label.
 */
export function CategoryPicker({
  value,
  onChange,
  id = "category",
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const { presets: selectedPresets, custom } = parseValue(value);
  const [customMode, setCustomMode] = useState(custom !== "");

  const summary =
    selectedPresets.size === 0 && !customMode
      ? "Any category"
      : selectedPresets.size + (customMode && custom ? 1 : 0) === 1
        ? (selectedPresets.values().next().value ?? custom)
        : `${selectedPresets.size + (customMode && custom ? 1 : 0)} categories`;

  const togglePreset = (label: string, checked: boolean) => {
    const next = new Set(selectedPresets);
    if (checked) next.add(label);
    else next.delete(label);
    onChange(serialize(next, customMode ? custom : ""));
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Business category</Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) max-h-72 overflow-y-auto">
          {PRESET_LABELS.map((label) => (
            <DropdownMenuCheckboxItem
              key={label}
              checked={selectedPresets.has(label)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => togglePreset(label, checked === true)}
            >
              {label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={customMode}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => {
              const next = checked === true;
              setCustomMode(next);
              onChange(serialize(selectedPresets, next ? custom : ""));
            }}
          >
            Other (custom)
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {customMode ? (
        <Input
          placeholder="e.g. Pool cleaning"
          value={custom}
          onChange={(e) => onChange(serialize(selectedPresets, e.target.value))}
          autoFocus
        />
      ) : null}
    </div>
  );
}

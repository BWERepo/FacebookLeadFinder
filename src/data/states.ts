/**
 * US states and territories.
 *
 * Small, stable and client-safe — the Find Leads form needs this in the
 * browser, so it is a plain module rather than something fetched from a server
 * function.
 */

export type StateEntry = {
  /** Two-letter USPS code. */
  code: string;
  name: string;
  /** False for DC and the territories, which the state dropdown groups apart. */
  isState: boolean;
};

export const STATES: readonly StateEntry[] = [
  { code: "AL", name: "Alabama", isState: true },
  { code: "AK", name: "Alaska", isState: true },
  { code: "AZ", name: "Arizona", isState: true },
  { code: "AR", name: "Arkansas", isState: true },
  { code: "CA", name: "California", isState: true },
  { code: "CO", name: "Colorado", isState: true },
  { code: "CT", name: "Connecticut", isState: true },
  { code: "DE", name: "Delaware", isState: true },
  { code: "FL", name: "Florida", isState: true },
  { code: "GA", name: "Georgia", isState: true },
  { code: "HI", name: "Hawaii", isState: true },
  { code: "ID", name: "Idaho", isState: true },
  { code: "IL", name: "Illinois", isState: true },
  { code: "IN", name: "Indiana", isState: true },
  { code: "IA", name: "Iowa", isState: true },
  { code: "KS", name: "Kansas", isState: true },
  { code: "KY", name: "Kentucky", isState: true },
  { code: "LA", name: "Louisiana", isState: true },
  { code: "ME", name: "Maine", isState: true },
  { code: "MD", name: "Maryland", isState: true },
  { code: "MA", name: "Massachusetts", isState: true },
  { code: "MI", name: "Michigan", isState: true },
  { code: "MN", name: "Minnesota", isState: true },
  { code: "MS", name: "Mississippi", isState: true },
  { code: "MO", name: "Missouri", isState: true },
  { code: "MT", name: "Montana", isState: true },
  { code: "NE", name: "Nebraska", isState: true },
  { code: "NV", name: "Nevada", isState: true },
  { code: "NH", name: "New Hampshire", isState: true },
  { code: "NJ", name: "New Jersey", isState: true },
  { code: "NM", name: "New Mexico", isState: true },
  { code: "NY", name: "New York", isState: true },
  { code: "NC", name: "North Carolina", isState: true },
  { code: "ND", name: "North Dakota", isState: true },
  { code: "OH", name: "Ohio", isState: true },
  { code: "OK", name: "Oklahoma", isState: true },
  { code: "OR", name: "Oregon", isState: true },
  { code: "PA", name: "Pennsylvania", isState: true },
  { code: "RI", name: "Rhode Island", isState: true },
  { code: "SC", name: "South Carolina", isState: true },
  { code: "SD", name: "South Dakota", isState: true },
  { code: "TN", name: "Tennessee", isState: true },
  { code: "TX", name: "Texas", isState: true },
  { code: "UT", name: "Utah", isState: true },
  { code: "VT", name: "Vermont", isState: true },
  { code: "VA", name: "Virginia", isState: true },
  { code: "WA", name: "Washington", isState: true },
  { code: "WV", name: "West Virginia", isState: true },
  { code: "WI", name: "Wisconsin", isState: true },
  { code: "WY", name: "Wyoming", isState: true },
  { code: "DC", name: "District of Columbia", isState: false },
  { code: "PR", name: "Puerto Rico", isState: false },
  { code: "VI", name: "U.S. Virgin Islands", isState: false },
  { code: "GU", name: "Guam", isState: false },
  { code: "AS", name: "American Samoa", isState: false },
  { code: "MP", name: "Northern Mariana Islands", isState: false },
] as const;

const BY_CODE = new Map(STATES.map((s) => [s.code, s]));

export function stateByCode(code: string | null | undefined): StateEntry | null {
  if (typeof code !== "string") return null;
  return BY_CODE.get(code.trim().toUpperCase()) ?? null;
}

export function stateName(code: string | null | undefined): string {
  return stateByCode(code)?.name ?? "";
}

export function isValidStateCode(code: string | null | undefined): boolean {
  return stateByCode(code) !== null;
}

/**
 * Resolve a state name or code to its code.
 *
 * Imported spreadsheets use both forms, sometimes in the same column.
 */
export function toStateCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value === "") return null;

  const byCode = BY_CODE.get(value.toUpperCase());
  if (byCode) return byCode.code;

  const byName = STATES.find((s) => s.name.toLowerCase() === value.toLowerCase());
  return byName?.code ?? null;
}

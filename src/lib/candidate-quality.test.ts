import { describe, expect, it } from "vitest";

import { hasContactableIdentity } from "./candidate-quality";

describe("hasContactableIdentity", () => {
  it("accepts a business with a phone number, regardless of address", () => {
    expect(hasContactableIdentity({ phone: "(865) 555-0142", address: "Knox County, TN, USA" })).toBe(
      true,
    );
  });

  it("accepts a business with a real street address, regardless of phone", () => {
    expect(
      hasContactableIdentity({ phone: null, address: "605 Bernard Ave, Knoxville, TN 37921, USA" }),
    ).toBe(true);
  });

  it("rejects a county/township pseudo-business with neither", () => {
    expect(hasContactableIdentity({ phone: null, address: "Knox County, TN, USA" })).toBe(false);
    expect(hasContactableIdentity({ phone: null, address: "Powell, TN 37849, USA" })).toBe(false);
  });

  it("rejects an empty address with no phone", () => {
    expect(hasContactableIdentity({ phone: null, address: "" })).toBe(false);
  });
});

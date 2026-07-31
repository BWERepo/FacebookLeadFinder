// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useRememberedCategory } from "./use-remembered-category";

const STORAGE_KEY = "flf:lastCategory";

describe("useRememberedCategory", () => {
  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it("starts empty ('Any category') when nothing was remembered before", () => {
    const { result } = renderHook(() => useRememberedCategory());
    expect(result.current[0]).toBe("");
  });

  it("starts from whatever was remembered in localStorage", () => {
    window.localStorage.setItem(STORAGE_KEY, "Restaurants, Bakeries");
    const { result } = renderHook(() => useRememberedCategory());
    expect(result.current[0]).toBe("Restaurants, Bakeries");
  });

  it("persists a change to localStorage, and a new hook instance picks it up", () => {
    const { result } = renderHook(() => useRememberedCategory());
    act(() => result.current[1]("Plumbers"));
    expect(result.current[0]).toBe("Plumbers");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("Plumbers");

    const { result: second } = renderHook(() => useRememberedCategory());
    expect(second.current[0]).toBe("Plumbers");
  });
});

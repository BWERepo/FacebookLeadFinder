// Vitest setup, loaded for every test file regardless of environment (see
// vitest.config.ts's setupFiles). The default environment is "node" — this
// project's 46+ pure-function test files never touch `window`, so
// everything below is guarded to be a no-op there. Component tests opt into
// jsdom per-file with a `// @vitest-environment jsdom` docblock, and that's
// when this actually does something.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

if (typeof window !== "undefined") {
  // @testing-library/react's auto-cleanup relies on a global `afterEach`
  // (registered when the test runner exposes one via `test.globals`), which
  // this project doesn't enable — every test file imports its own `describe`
  // /`it`/`expect`. Without this, the DOM from one component test would
  // still be mounted when the next one runs in the same file, and
  // `getByText` would find duplicates across tests instead of one match.
  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  });

  // jsdom doesn't implement IntersectionObserver, which motion/react's
  // useInView (used by every Reveal/RevealX wrapper on the homepage) needs
  // just to construct. Without this stub, rendering any Reveal-wrapped
  // component throws "IntersectionObserver is not defined" before it ever
  // reaches the assertion.
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error - test-only stub, not a full IntersectionObserver
  globalThis.IntersectionObserver = MockIntersectionObserver;

  // jsdom also doesn't implement matchMedia, which motion/react's
  // useReducedMotion reads to detect prefers-reduced-motion. Default to "no
  // preference" so components render with animations enabled, same as most
  // real visitors and matching this project's default UX.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
}

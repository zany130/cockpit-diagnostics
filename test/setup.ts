import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import "@testing-library/jest-dom/vitest";

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}

if (typeof window !== "undefined" && !window.ResizeObserver)
    window.ResizeObserver = ResizeObserverStub;

// jsdom's createObjectURL is often unimplemented. Boot timeline uses a
// data: URL (Cockpit CSP blocks blob:), but keep a stub if anything still calls it.
URL.createObjectURL = () => "blob:diagnostics-boot-plot";
URL.revokeObjectURL = () => undefined;

afterEach(() => cleanup());

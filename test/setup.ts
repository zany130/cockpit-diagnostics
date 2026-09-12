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

afterEach(() => cleanup());

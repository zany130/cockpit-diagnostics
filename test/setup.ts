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

// jsdom's createObjectURL is often unimplemented. The Boot timeline uses a
// blob URL plus <img>, so tests need a stable stub.
URL.createObjectURL = () => "blob:diagnostics-boot-plot";
URL.revokeObjectURL = () => undefined;

afterEach(() => cleanup());

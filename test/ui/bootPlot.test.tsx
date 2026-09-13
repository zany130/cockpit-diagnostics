import React from "react";

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BootPlotCard } from "../../src/components/BootPlotCard";
import type { DiagnosticCapabilities } from "../../src/types/diagnostics";
import { bootPlotImageSrc } from "../../src/utils/bootPlotImage";
import { ProviderError } from "../../src/types/providers";

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemdAnalyzeSecurity: false,
    systemdAnalyzePlot: true,
    systemdAnalyzeVerify: false,
    systemctl: true,
    coredumpctl: false,
    journalctl: false,
};

const plot = {
    svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"160\"><text>foo.service</text></svg>",
    width: 800,
    height: 160,
};

describe("BootPlotCard image source", () => {
    beforeEach(() => {
        vi.spyOn(URL, "createObjectURL");
        vi.spyOn(URL, "revokeObjectURL");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders a data URL, not a blob URL", () => {
        render(
            <BootPlotCard
                capabilities={capabilities}
                state={{ status: "ready", data: plot, reload: () => undefined }}
            />
        );
        const img = screen.getByRole("img", { name: "systemd boot timeline" });
        expect(img).toHaveAttribute("src", bootPlotImageSrc(plot.svg));
        expect(img.getAttribute("src")?.startsWith("data:image/svg+xml")).toBe(true);
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Fit to width" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reset zoom" })).toBeInTheDocument();
    });

    it("keeps the same image src across rerenders of the same SVG", () => {
        const state = { status: "ready" as const, data: plot, reload: () => undefined };
        const { rerender } = render(<BootPlotCard capabilities={capabilities} state={state} />);
        const first = screen.getByRole("img", { name: "systemd boot timeline" }).getAttribute("src");
        rerender(<BootPlotCard capabilities={capabilities} state={{ ...state }} />);
        const second = screen.getByRole("img", { name: "systemd boot timeline" }).getAttribute("src");
        expect(second).toBe(first);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });

    it("does not revoke an object URL on unmount because none is created", () => {
        const { unmount } = render(
            <BootPlotCard
                capabilities={capabilities}
                state={{ status: "ready", data: plot, reload: () => undefined }}
            />
        );
        unmount();
        expect(URL.createObjectURL).not.toHaveBeenCalled();
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it("shows a command failure instead of a broken image", () => {
        render(
            <BootPlotCard
                capabilities={capabilities}
                state={{
                    status: "error",
                    error: new ProviderError("command-failed", "Failed to connect to bus: Host is down"),
                    reload: () => undefined,
                }}
            />
        );
        expect(screen.getByText("Command failed")).toBeInTheDocument();
        expect(screen.getByText("Failed to connect to bus: Host is down")).toBeInTheDocument();
        expect(screen.queryByRole("img", { name: "systemd boot timeline" })).not.toBeInTheDocument();
    });

    it("shows a parse failure instead of a broken image", () => {
        render(
            <BootPlotCard
                capabilities={capabilities}
                state={{
                    status: "error",
                    error: new ProviderError("parse-failed", "systemd-analyze plot produced no SVG.", {
                        source: "systemd-analyze",
                    }),
                    reload: () => undefined,
                }}
            />
        );
        expect(screen.getByText("Could not parse output")).toBeInTheDocument();
        expect(screen.queryByRole("img", { name: "systemd boot timeline" })).not.toBeInTheDocument();
    });
});

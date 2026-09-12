import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OverviewPage } from "../../src/pages/OverviewPage";
import type { BootSummary } from "../../src/types/boot";
import type { DiagnosticCapabilities, FailedUnit } from "../../src/types/diagnostics";

const { loadBootSummary, loadCriticalChain, loadFailedUnits, loadBlame } = vi.hoisted(() => ({
    loadBootSummary: vi.fn(),
    loadCriticalChain: vi.fn(),
    loadFailedUnits: vi.fn(),
    loadBlame: vi.fn(),
}));

vi.mock("../../src/providers/systemdAnalyze", () => ({
    loadBootSummary,
    loadCriticalChain,
    loadBlame,
}));

vi.mock("../../src/providers/systemdUnits", () => ({
    loadFailedUnits,
}));

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemctl: true,
    systemdVersion: 255,
};

const boot: BootSummary = {
    kernelUs: 2_584_000,
    initrdUs: 19_176_000,
    userspaceUs: 47_847_000,
    totalUs: 69_608_000,
    target: "multi-user.target",
    targetReachedUs: 32_786_000,
};

const failed: FailedUnit[] = [
    {
        unit: "foo.service",
        description: "Foo Service",
        activeState: "failed",
        subState: "failed",
        result: "exit-code",
        execMainStatus: 1,
        inactiveEnterTimestamp: "Sat 2026-09-12 12:00:00 UTC",
    },
];

describe("OverviewPage", () => {
    beforeEach(() => {
        loadBootSummary.mockReset();
        loadCriticalChain.mockReset();
        loadFailedUnits.mockReset();
        loadBlame.mockReset();
        loadBootSummary.mockResolvedValue(boot);
        loadCriticalChain.mockResolvedValue([{ unit: "multi-user.target", activatedAtUs: 32_786_000, children: [] }]);
        loadFailedUnits.mockResolvedValue(failed);
    });

    it("renders boot facts and failed units without a health score", async () => {
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);

        expect(await screen.findByText("Total boot duration: 1 min 9.608 s")).toBeInTheDocument();
        expect(screen.getByText("Userspace: 47.847 s")).toBeInTheDocument();
        expect(screen.getAllByText("1 failed unit").length).toBeGreaterThan(0);
        expect(screen.getByText("foo.service")).toBeInTheDocument();
        expect(screen.getByText("Foo Service")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "View service" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "View logs" })).toBeInTheDocument();
        expect(screen.queryByText(/health score/i)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /restart/i })).not.toBeInTheDocument();
    });

    it("shows an empty failed-unit state", async () => {
        loadFailedUnits.mockResolvedValue([]);
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("No failed units")).toBeInTheDocument();
    });

    it("refreshes providers independently", async () => {
        const user = userEvent.setup();
        const onRefresh = vi.fn();
        render(<OverviewPage capabilities={capabilities} onRefresh={onRefresh} />);
        await screen.findByText("foo.service");
        await user.click(screen.getByRole("button", { name: "Refresh" }));
        expect(onRefresh).toHaveBeenCalled();
        expect(loadBootSummary).toHaveBeenCalledTimes(2);
        expect(loadFailedUnits).toHaveBeenCalledTimes(2);
    });

    it("keeps failed units visible when boot timing fails", async () => {
        loadBootSummary.mockRejectedValue({ problem: "not-found", message: "systemd-analyze: not found" });
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("foo.service")).toBeInTheDocument();
        expect(screen.getByText("Command not found")).toBeInTheDocument();
    });

    it("explains a missing systemctl capability", () => {
        render(
            <OverviewPage
                capabilities={{ ...capabilities, systemctl: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/systemctl is not available/)).toBeInTheDocument();
    });
});

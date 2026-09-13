import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OverviewPage } from "../../src/pages/OverviewPage";
import type { BootSummary } from "../../src/types/boot";
import type { DiagnosticCapabilities, FailedUnit } from "../../src/types/diagnostics";
import cockpit from "cockpit";

const { loadBootSummary, loadCriticalChain, loadFailedUnits, loadBlame } = vi.hoisted(() => ({
    loadBootSummary: vi.fn(),
    loadCriticalChain: vi.fn(),
    loadFailedUnits: vi.fn(),
    loadBlame: vi.fn(),
}));

const { loadCoredumps } = vi.hoisted(() => ({
    loadCoredumps: vi.fn(),
}));

vi.mock("../../src/providers/systemdAnalyze", () => ({
    loadBootSummary,
    loadCriticalChain,
    loadBlame,
}));

vi.mock("../../src/providers/systemdUnits", () => ({
    loadFailedUnits,
}));

vi.mock("../../src/providers/coredumps", () => ({
    loadCoredumps,
}));

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemctl: true,
    systemdVersion: 255,
    coredumpctl: true,
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
        loadCoredumps.mockReset();
        loadBootSummary.mockResolvedValue(boot);
        loadCriticalChain.mockResolvedValue([{ unit: "multi-user.target", activatedAtUs: 32_786_000, children: [] }]);
        loadFailedUnits.mockResolvedValue(failed);
        loadCoredumps.mockResolvedValue([]);
    });

    it("renders boot facts and failed units without a health score", async () => {
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);

        expect(await screen.findByText("Boot completed in 1 min 9.608 s")).toBeInTheDocument();
        expect(screen.getByText("Userspace")).toBeInTheDocument();
        expect(screen.getByText("47.847 s")).toBeInTheDocument();
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
        expect(loadCoredumps).toHaveBeenCalledTimes(2);
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

    it("places last refreshed under the title", async () => {
        render(
            <OverviewPage
                capabilities={capabilities}
                onRefresh={() => undefined}
                lastRefreshed={new Date("2026-09-12T12:00:00Z")}
            />
        );
        expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
        expect(await screen.findByText(/Last refreshed/)).toBeInTheDocument();
    });

    it("summarizes zero coredumps without calling them a health problem", async () => {
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByRole("button", { name: "No coredumps this boot" })).toBeInTheDocument();
        expect(screen.getByText(/do not automatically mean the system is unhealthy/)).toBeInTheDocument();
        expect(screen.queryByText(/health score/i)).not.toBeInTheDocument();
    });

    it("summarizes a coredump count and opens the Crashes page", async () => {
        const user = userEvent.setup();
        loadCoredumps.mockResolvedValue([
            { id: "a", pid: 1, executable: "/usr/bin/bash" },
            { id: "b", pid: 2, executable: "/usr/sbin/nginx" },
        ]);
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        const summary = await screen.findByRole("button", { name: "2 coredumps this boot" });
        await user.click(summary);
        expect(cockpit.location.path).toEqual(["crashes"]);
    });

    it("keeps Boot visible when the crashes provider fails", async () => {
        loadCoredumps.mockRejectedValue({ problem: "", message: "Failed to open journal", exit_status: 1 });
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Boot completed in 1 min 9.608 s")).toBeInTheDocument();
        expect(await screen.findByText("foo.service")).toBeInTheDocument();
        expect(screen.getByText("Command failed")).toBeInTheDocument();
    });

    it("explains a missing coredumpctl capability", () => {
        render(
            <OverviewPage
                capabilities={{ ...capabilities, coredumpctl: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/coredumpctl is not available/)).toBeInTheDocument();
    });
});

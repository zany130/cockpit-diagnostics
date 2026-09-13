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

const { loadFindings } = vi.hoisted(() => ({
    loadFindings: vi.fn(),
}));

const { loadSecuritySummaries } = vi.hoisted(() => ({
    loadSecuritySummaries: vi.fn(),
}));

const { loadBootPlot } = vi.hoisted(() => ({
    loadBootPlot: vi.fn(),
}));

const { loadInstalledUnitFiles, verifyUnit } = vi.hoisted(() => ({
    loadInstalledUnitFiles: vi.fn(),
    verifyUnit: vi.fn(),
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

vi.mock("../../src/providers/journal", () => ({
    loadFindings,
}));

vi.mock("../../src/providers/security", () => ({
    loadSecuritySummaries,
    loadSecurityDetails: vi.fn(),
}));

vi.mock("../../src/providers/plot", () => ({
    loadBootPlot,
}));

vi.mock("../../src/providers/verify", () => ({
    loadInstalledUnitFiles,
    verifyUnit,
}));

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemdAnalyzeSecurity: true,
    systemdAnalyzePlot: true,
    systemdAnalyzeVerify: true,
    systemctl: true,
    systemdVersion: 255,
    coredumpctl: true,
    journalctl: true,
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
        loadFindings.mockReset();
        loadSecuritySummaries.mockReset();
        loadBootSummary.mockResolvedValue(boot);
        loadCriticalChain.mockResolvedValue([{ unit: "multi-user.target", activatedAtUs: 32_786_000, children: [] }]);
        loadFailedUnits.mockResolvedValue(failed);
        loadCoredumps.mockResolvedValue([]);
        loadFindings.mockResolvedValue({ findings: [], truncated: false, incomplete: false });
        loadBootPlot.mockReset();
        loadInstalledUnitFiles.mockReset();
        verifyUnit.mockReset();
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
        expect(screen.queryByText(/Health:\s*\d/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /restart/i })).not.toBeInTheDocument();
        expect(screen.getByText("Security")).toBeInTheDocument();
        expect(screen.getByText("systemd hardening analysis available")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Review services" })).toBeInTheDocument();
        expect(screen.getByText("Verification")).toBeInTheDocument();
        expect(screen.getByText("Unit file verification available")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Verify a unit" })).toBeInTheDocument();
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
        expect(loadBootPlot).not.toHaveBeenCalled();
        expect(verifyUnit).not.toHaveBeenCalled();
        expect(screen.queryByText(/vulnerability score/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/system security score/i)).not.toBeInTheDocument();
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
        expect(loadFindings).toHaveBeenCalledTimes(2);
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
        expect(loadBootPlot).not.toHaveBeenCalled();
        expect(verifyUnit).not.toHaveBeenCalled();
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
        expect(screen.queryByText(/Health:\s*\d/)).not.toBeInTheDocument();
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

    it("summarizes zero findings without calling the system healthy", async () => {
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByRole("button", { name: "No supported findings this boot" })).toBeInTheDocument();
        expect(screen.getByText(/not a health score/)).toBeInTheDocument();
        expect(screen.queryByText(/system unhealthy/i)).not.toBeInTheDocument();
    });

    it("summarizes finding counts and opens the Findings page", async () => {
        const user = userEvent.setup();
        loadFindings.mockResolvedValue({
            findings: [
                {
                    id: "m1",
                    category: "memory",
                    severity: "warning",
                    title: "Out-of-memory kill: firefox",
                    summary: "kill",
                    count: 1,
                    source: "kernel",
                },
                {
                    id: "k1",
                    category: "kernel",
                    severity: "warning",
                    title: "amdgpu",
                    summary: "err",
                    count: 3,
                    source: "kernel",
                },
                {
                    id: "k2",
                    category: "kernel",
                    severity: "error",
                    title: "ext4",
                    summary: "err",
                    count: 1,
                    source: "kernel",
                },
            ],
            truncated: false,
            incomplete: false,
        });
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        const summary = await screen.findByRole("button", { name: "3 findings this boot" });
        expect(screen.getByText("1 memory")).toBeInTheDocument();
        expect(screen.getByText("2 kernel")).toBeInTheDocument();
        await user.click(summary);
        expect(cockpit.location.path).toEqual(["findings"]);
    });

    it("keeps Boot and Crashes visible when the findings provider fails", async () => {
        loadFindings.mockRejectedValue({ problem: "", message: "Failed to open journal", exit_status: 1 });
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Boot completed in 1 min 9.608 s")).toBeInTheDocument();
        expect(await screen.findByText("foo.service")).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "No coredumps this boot" })).toBeInTheDocument();
        expect(screen.getByText("Command failed")).toBeInTheDocument();
    });

    it("explains a missing journalctl capability", () => {
        render(
            <OverviewPage
                capabilities={{ ...capabilities, journalctl: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/journalctl is not available/)).toBeInTheDocument();
    });

    it("opens the Security page from the teaser without running analysis on Overview", async () => {
        const user = userEvent.setup();
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("systemd hardening analysis available")).toBeInTheDocument();
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Review services" }));
        expect(cockpit.location.path).toEqual(["security"]);
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
    });

    it("keeps Boot, Crashes, and Findings visible when security analysis is unavailable", async () => {
        render(
            <OverviewPage
                capabilities={{ ...capabilities, systemdAnalyzeSecurity: false }}
                onRefresh={() => undefined}
            />
        );
        expect(await screen.findByText("Boot completed in 1 min 9.608 s")).toBeInTheDocument();
        expect(await screen.findByText("foo.service")).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "No coredumps this boot" })).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "No supported findings this boot" })).toBeInTheDocument();
        expect(screen.getByText(/systemd-analyze security is not available/)).toBeInTheDocument();
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
    });

    it("opens the Verification page from the teaser without verifying a unit on Overview", async () => {
        const user = userEvent.setup();
        render(<OverviewPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Unit file verification available")).toBeInTheDocument();
        expect(verifyUnit).not.toHaveBeenCalled();
        expect(loadInstalledUnitFiles).not.toHaveBeenCalled();
        expect(loadBootPlot).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Verify a unit" }));
        expect(cockpit.location.path).toEqual(["verification"]);
        expect(verifyUnit).not.toHaveBeenCalled();
        expect(loadBootPlot).not.toHaveBeenCalled();
    });

    it("keeps Boot, Crashes, Findings, and Security visible when verification is unavailable", async () => {
        render(
            <OverviewPage
                capabilities={{ ...capabilities, systemdAnalyzeVerify: false }}
                onRefresh={() => undefined}
            />
        );
        expect(await screen.findByText("Boot completed in 1 min 9.608 s")).toBeInTheDocument();
        expect(await screen.findByText("foo.service")).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "No coredumps this boot" })).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "No supported findings this boot" })).toBeInTheDocument();
        expect(screen.getByText("systemd hardening analysis available")).toBeInTheDocument();
        expect(screen.getByText(/systemd-analyze verify is not available/)).toBeInTheDocument();
        expect(verifyUnit).not.toHaveBeenCalled();
        expect(loadBootPlot).not.toHaveBeenCalled();
    });
});

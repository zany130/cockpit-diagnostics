import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Application } from "../../src/app";
import type { DiagnosticCapabilities } from "../../src/types/diagnostics";
import cockpit from "cockpit";

const { detectCapabilities } = vi.hoisted(() => ({
    detectCapabilities: vi.fn(),
}));

vi.mock("../../src/providers/capabilities", () => ({
    detectCapabilities,
}));

const { loadBootSummary, loadBlame, loadCriticalChain } = vi.hoisted(() => ({
    loadBootSummary: vi.fn(),
    loadBlame: vi.fn(),
    loadCriticalChain: vi.fn(),
}));

vi.mock("../../src/providers/systemdAnalyze", () => ({
    loadBootSummary,
    loadBlame,
    loadCriticalChain,
}));

const { loadFailedUnits } = vi.hoisted(() => ({
    loadFailedUnits: vi.fn(),
}));

const { loadCoredumps } = vi.hoisted(() => ({
    loadCoredumps: vi.fn(),
}));

const { loadFindings } = vi.hoisted(() => ({
    loadFindings: vi.fn(),
}));

const { loadSecuritySummaries, loadSecurityDetails } = vi.hoisted(() => ({
    loadSecuritySummaries: vi.fn(),
    loadSecurityDetails: vi.fn(),
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
    loadSecurityDetails,
}));

const { loadBootPlot } = vi.hoisted(() => ({
    loadBootPlot: vi.fn(),
}));

vi.mock("../../src/providers/plot", () => ({
    loadBootPlot,
}));

const { loadInstalledUnitFiles, verifyUnit } = vi.hoisted(() => ({
    loadInstalledUnitFiles: vi.fn(),
    verifyUnit: vi.fn(),
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
    coredumpctl: true,
    journalctl: true,
};

describe("Application navigation", () => {
    beforeEach(() => {
        cockpit.location.path = [];
        window.location.hash = "";
        detectCapabilities.mockResolvedValue(capabilities);
        loadBootSummary.mockResolvedValue({
            totalUs: 69_608_000,
            userspaceUs: 47_847_000,
        });
        loadBlame.mockResolvedValue([]);
        loadCriticalChain.mockResolvedValue([]);
        loadFailedUnits.mockResolvedValue([]);
        loadCoredumps.mockResolvedValue([]);
        loadFindings.mockResolvedValue({ findings: [], truncated: false, incomplete: false });
        loadSecuritySummaries.mockReset();
        loadSecurityDetails.mockReset();
        loadSecuritySummaries.mockResolvedValue([]);
        loadSecurityDetails.mockResolvedValue({ unit: "unused.service", checks: [] });
        loadBootPlot.mockReset();
        loadBootPlot.mockResolvedValue({
            svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"20\"></svg>",
            width: 40,
            height: 20,
        });
        loadInstalledUnitFiles.mockReset();
        verifyUnit.mockReset();
        loadInstalledUnitFiles.mockResolvedValue([{ unit: "foo.service", state: "enabled" }]);
        verifyUnit.mockResolvedValue({ requestedUnit: "foo.service", findings: [] });
    });

    it("switches from Overview to Boot when the Boot nav item is clicked", async () => {
        const user = userEvent.setup();
        render(<Application />);

        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        await user.click(screen.getByRole("link", { name: "Boot" }));
        expect(await screen.findByRole("heading", { name: "Boot" })).toBeInTheDocument();
        expect(screen.getByText("Total boot timing")).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
    });

    it("switches from Overview to Crashes when the Crashes nav item is clicked", async () => {
        const user = userEvent.setup();
        render(<Application />);

        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        await user.click(screen.getByRole("link", { name: "Crashes" }));
        expect(await screen.findByRole("heading", { name: "Crashes" })).toBeInTheDocument();
        expect(screen.getByText(/crash records, not a health score/)).toBeInTheDocument();
    });

    it("switches from Overview to Findings when the Findings nav item is clicked", async () => {
        const user = userEvent.setup();
        render(<Application />);

        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        await user.click(screen.getByRole("link", { name: "Findings" }));
        expect(await screen.findByRole("heading", { name: "Findings" })).toBeInTheDocument();
        expect(screen.getByText(/not a journal browser/)).toBeInTheDocument();
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
    });

    it("does not load security analysis on Overview", async () => {
        render(<Application />);
        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
        expect(loadSecurityDetails).not.toHaveBeenCalled();
    });

    it("opens the Security page from the sidebar", async () => {
        const user = userEvent.setup();
        render(<Application />);

        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        const crashCalls = loadCoredumps.mock.calls.length;
        const findingCalls = loadFindings.mock.calls.length;
        await user.click(screen.getByRole("link", { name: "Security" }));
        expect(await screen.findByRole("heading", { name: "systemd service hardening" })).toBeInTheDocument();
        expect(screen.getByText(/not a vulnerability scan/)).toBeInTheDocument();
        expect(loadSecuritySummaries).toHaveBeenCalled();
        expect(loadCoredumps).toHaveBeenCalledTimes(crashCalls);
        expect(loadFindings).toHaveBeenCalledTimes(findingCalls);
        expect(loadBootPlot).not.toHaveBeenCalled();
        expect(verifyUnit).not.toHaveBeenCalled();
    });

    it("does not load plot or verify on Overview", async () => {
        render(<Application />);
        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        expect(loadBootPlot).not.toHaveBeenCalled();
        expect(verifyUnit).not.toHaveBeenCalled();
        expect(loadInstalledUnitFiles).not.toHaveBeenCalled();
    });

    it("opens the Verification page from the sidebar without running Boot plot", async () => {
        const user = userEvent.setup();
        render(<Application />);

        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        await user.click(screen.getByRole("link", { name: "Verification" }));
        expect(await screen.findByRole("heading", { name: "Verification" })).toBeInTheDocument();
        expect(screen.getByText(/does not edit units or start services/)).toBeInTheDocument();
        expect(loadInstalledUnitFiles).toHaveBeenCalled();
        expect(verifyUnit).not.toHaveBeenCalled();
        expect(loadBootPlot).not.toHaveBeenCalled();
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
    });

    it("keeps Boot usable when plot is requested from the Boot page only", async () => {
        const user = userEvent.setup();
        render(<Application />);
        expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
        await user.click(screen.getByRole("link", { name: "Boot" }));
        expect(await screen.findByRole("heading", { name: "Boot" })).toBeInTheDocument();
        expect(loadBootPlot).toHaveBeenCalled();
        expect(verifyUnit).not.toHaveBeenCalled();
    });
});

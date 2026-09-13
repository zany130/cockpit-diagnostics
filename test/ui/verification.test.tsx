import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VerificationPage } from "../../src/pages/VerificationPage";
import type { DiagnosticCapabilities } from "../../src/types/diagnostics";
import type { InstalledUnitFile, VerificationResult } from "../../src/types/verify";
import cockpit from "cockpit";

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

const files: InstalledUnitFile[] = [
    { unit: "foo.service", state: "enabled" },
    { unit: "warn.service", state: "static" },
    { unit: "getty@.service", state: "enabled" },
];

const clean: VerificationResult = { requestedUnit: "foo.service", findings: [] };

const warning: VerificationResult = {
    requestedUnit: "warn.service",
    findings: [{
        severity: "warning",
        message: "Unknown key name 'MysteryKey' in section 'Service', ignoring.",
        unit: "warn.service",
        path: "/etc/systemd/system/warn.service",
        line: 6,
        related: false,
    }],
};

const related: VerificationResult = {
    requestedUnit: "foo.service",
    findings: [{
        severity: "warning",
        message: "Unknown key name 'MysteryKey' in section 'Service', ignoring.",
        unit: "warn.service",
        path: "/tmp/verify-unit/warn.service",
        line: 6,
        related: true,
    }],
};

describe("VerificationPage", () => {
    beforeEach(() => {
        loadInstalledUnitFiles.mockReset();
        verifyUnit.mockReset();
        loadInstalledUnitFiles.mockResolvedValue(files);
        verifyUnit.mockResolvedValue(clean);
    });

    it("shows a loading state for the unit list", () => {
        loadInstalledUnitFiles.mockReturnValue(new Promise(() => undefined));
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(screen.getByText("Loading installed unit files")).toBeInTheDocument();
    });

    it("explains when verify is unavailable without loading a unit", () => {
        render(
            <VerificationPage
                capabilities={{ ...capabilities, systemdAnalyzeVerify: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/systemd-analyze verify is not available/)).toBeInTheDocument();
        expect(verifyUnit).not.toHaveBeenCalled();
    });

    it("lists unit files and verifies a valid unit with no findings", async () => {
        const user = userEvent.setup();
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("foo.service"));
        expect(await screen.findByText("systemd reported no verification findings")).toBeInTheDocument();
        expect(verifyUnit).toHaveBeenCalledWith("foo.service");
        await user.click(screen.getByRole("button", { name: "View service" }));
        expect(jump).toHaveBeenCalledWith("/system/services#/foo.service");
        expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /daemon-reload/i })).not.toBeInTheDocument();
    });

    it("shows a warning finding with path and line", async () => {
        const user = userEvent.setup();
        verifyUnit.mockResolvedValue(warning);
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("warn.service"));
        expect(await screen.findByText(/MysteryKey/)).toBeInTheDocument();
        expect(screen.getByText("Warnings")).toBeInTheDocument();
        expect(screen.getByText("/etc/systemd/system/warn.service:6")).toBeInTheDocument();
    });

    it("distinguishes a related-unit finding", async () => {
        const user = userEvent.setup();
        verifyUnit.mockResolvedValue(related);
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("foo.service"));
        expect(await screen.findByText("Related unit warn.service")).toBeInTheDocument();
        expect(screen.getByText(/including 1 from related units/)).toBeInTheDocument();
        expect(screen.queryByText("Error in foo.service")).not.toBeInTheDocument();
    });

    it("shows a loading state while verifying a selected unit", async () => {
        const user = userEvent.setup();
        verifyUnit.mockReturnValue(new Promise(() => undefined));
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("foo.service"));
        expect(await screen.findByText("Running systemd-analyze verify")).toBeInTheDocument();
    });

    it("shows an error finding without labeling it as a selected-unit-only problem", async () => {
        const user = userEvent.setup();
        verifyUnit.mockResolvedValue({
            requestedUnit: "foo.service",
            findings: [{
                severity: "error",
                message: "Failed to create foo.service/start: Unit missing-dep.service not found.",
                unit: "foo.service",
                related: false,
            }],
        });
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("foo.service"));
        expect(await screen.findByText("Errors")).toBeInTheDocument();
        expect(screen.getByText(/missing-dep\.service not found/)).toBeInTheDocument();
        expect(screen.queryByText("Error in foo.service")).not.toBeInTheDocument();
    });

    it("filters the unit list", async () => {
        const user = userEvent.setup();
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("getty@.service")).toBeInTheDocument();
        await user.type(screen.getByPlaceholderText("Filter unit files"), "foo.service");
        expect(screen.getByText("foo.service")).toBeInTheDocument();
        expect(screen.queryByText("getty@.service")).not.toBeInTheDocument();
    });

    it("keeps the unit table when verification fails", async () => {
        const user = userEvent.setup();
        verifyUnit.mockRejectedValue({ problem: "", message: "Failed to load unit", exit_status: 1 });
        render(<VerificationPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("foo.service"));
        expect(await screen.findByText("Could not verify this unit")).toBeInTheDocument();
        expect(screen.getByText("warn.service")).toBeInTheDocument();
        expect(screen.getByText("getty@.service")).toBeInTheDocument();
    });

    it("explains when unit files cannot be listed", () => {
        render(
            <VerificationPage
                capabilities={{ ...capabilities, systemctl: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/systemctl is not available, so installed unit files cannot be listed/)).toBeInTheDocument();
        expect(loadInstalledUnitFiles).not.toHaveBeenCalled();
    });
});

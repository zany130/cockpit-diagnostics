import React from "react";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrashesPage } from "../../src/pages/CrashesPage";
import type { DiagnosticCapabilities } from "../../src/types/diagnostics";
import type { CoredumpEntry } from "../../src/types/crashes";
import cockpit from "cockpit";

const { loadCoredumps, loadCoredumpDetails } = vi.hoisted(() => ({
    loadCoredumps: vi.fn(),
    loadCoredumpDetails: vi.fn(),
}));

vi.mock("../../src/providers/coredumps", () => ({
    loadCoredumps,
    loadCoredumpDetails,
}));

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemctl: true,
    coredumpctl: true,
    journalctl: false,
};

const bashDump: CoredumpEntry = {
    id: "boot:6654:1",
    timestampUs: 1757678401000000,
    pid: 6654,
    uid: 1000,
    gid: 1000,
    signal: 11,
    signalName: "SIGSEGV",
    executable: "/usr/bin/bash",
    storageState: "present",
    corePresent: true,
    currentBoot: true,
    bootId: "6580ca3716f24ca8981f1528242512c4",
};

const nginxDump: CoredumpEntry = {
    id: "boot:8018:2",
    timestampUs: 1757678502000000,
    pid: 8018,
    uid: 0,
    signal: 6,
    signalName: "SIGABRT",
    executable: "/usr/sbin/nginx",
    unit: "nginx.service",
    storageState: "missing",
    corePresent: false,
    currentBoot: true,
};

const noUnitDump: CoredumpEntry = {
    id: "boot:99:3",
    pid: 99,
    executable: "/usr/bin/sleep",
    storageState: "none",
    corePresent: false,
};

describe("CrashesPage", () => {
    beforeEach(() => {
        loadCoredumps.mockReset();
        loadCoredumpDetails.mockReset();
        loadCoredumps.mockResolvedValue([bashDump, nginxDump]);
        loadCoredumpDetails.mockImplementation(async (entry: CoredumpEntry) => ({
            ...entry,
            command: entry.command ?? "/usr/bin/bash -c crash",
            user: entry.user ?? "user",
        }));
        cockpit.jump = vi.fn();
    });

    it("shows a loading state", () => {
        loadCoredumps.mockReturnValue(new Promise(() => undefined));
        render(<CrashesPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(screen.getByText("Loading coredumps")).toBeInTheDocument();
    });

    it("shows a positive empty state", async () => {
        loadCoredumps.mockResolvedValue([]);
        render(<CrashesPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("No coredumps this boot")).toBeInTheDocument();
        expect(screen.getByText(/did not report any coredumps/)).toBeInTheDocument();
    });

    it("explains a missing coredumpctl capability", () => {
        render(
            <CrashesPage
                capabilities={{ ...capabilities, coredumpctl: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/coredumpctl is not available/)).toBeInTheDocument();
        expect(loadCoredumps).not.toHaveBeenCalled();
    });

    it("shows permission denied without debugger actions", async () => {
        loadCoredumps.mockRejectedValue({
            problem: "access-denied",
            message: "No journal files were opened due to insufficient permissions.",
        });
        render(<CrashesPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Permission denied")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /debug/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("renders a populated crash table", async () => {
        render(<CrashesPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("bash")).toBeInTheDocument();
        expect(screen.getByText("nginx")).toBeInTheDocument();
        expect(screen.getByText("6654")).toBeInTheDocument();
        expect(screen.getByText("SIGSEGV (11)")).toBeInTheDocument();
        expect(screen.getByText("Stored")).toBeInTheDocument();
        expect(screen.getByText("Removed")).toBeInTheDocument();
    });

    it("opens a detail view for a selected crash", async () => {
        const user = userEvent.setup();
        render(<CrashesPage capabilities={capabilities} onRefresh={() => undefined} />);
        await screen.findByText("bash");
        await user.click(screen.getByText("bash"));
        expect(await screen.findByText("Executable")).toBeInTheDocument();
        expect(screen.getAllByText("/usr/bin/bash").length).toBeGreaterThan(0);
        expect(screen.getByText("Core file is stored")).toBeInTheDocument();
        expect(screen.getByText(/Current boot/)).toBeInTheDocument();
        expect(loadCoredumpDetails).toHaveBeenCalled();
    });

    it("offers View logs only when a unit is available", async () => {
        const user = userEvent.setup();
        loadCoredumpDetails.mockImplementation(async (entry: CoredumpEntry) => entry);
        render(<CrashesPage capabilities={capabilities} onRefresh={() => undefined} />);
        await screen.findByText("nginx");
        await user.click(screen.getByText("nginx"));
        expect(await screen.findByRole("button", { name: "View logs" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "View logs" }));
        expect(cockpit.jump).toHaveBeenCalledWith(
            "/system/logs#?service=" + encodeURIComponent("nginx.service") + "&start=boot&prio=*"
        );

        await user.click(screen.getByText("bash"));
        await waitFor(() => {
            expect(screen.queryByRole("button", { name: "View logs" })).not.toBeInTheDocument();
        });
    });

    it("omits View logs when no unit exists", async () => {
        const user = userEvent.setup();
        loadCoredumps.mockResolvedValue([noUnitDump]);
        loadCoredumpDetails.mockResolvedValue(noUnitDump);
        render(<CrashesPage capabilities={capabilities} onRefresh={() => undefined} />);
        await screen.findByText("sleep");
        await user.click(screen.getByText("sleep"));
        expect(await screen.findByText("No core file was stored")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "View logs" })).not.toBeInTheDocument();
    });
});

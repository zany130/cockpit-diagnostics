import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FindingsPage } from "../../src/pages/FindingsPage";
import type { DiagnosticCapabilities } from "../../src/types/diagnostics";
import type { DiagnosticFinding, FindingsSnapshot } from "../../src/types/findings";
import cockpit from "cockpit";

const { loadFindings } = vi.hoisted(() => ({
    loadFindings: vi.fn(),
}));

vi.mock("../../src/providers/journal", () => ({
    loadFindings,
}));

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemdAnalyzeSecurity: false,
    systemctl: true,
    coredumpctl: true,
    journalctl: true,
};

const oomFinding: DiagnosticFinding = {
    id: "memory:kernel:comm:firefox",
    category: "memory",
    severity: "warning",
    title: "Out-of-memory kill: firefox",
    summary: "The kernel OOM killer reported a kill of firefox.",
    count: 1,
    source: "kernel",
    process: "firefox",
    pid: 4321,
    firstTimestampUs: 1757678501000000,
    lastTimestampUs: 1757678501000000,
    evidence: {
        message: "Out of memory: Killed process 4321 (firefox) total-vm:2847392kB",
        priority: 3,
        identifier: "kernel",
    },
    logsTarget: { tag: "kernel", start: "boot", prio: "err", grep: "Killed process" },
};

const kernelFinding: DiagnosticFinding = {
    id: "kernel:amdgpu",
    category: "kernel",
    severity: "warning",
    title: "amdgpu: [gfxhub] page fault",
    summary: "amdgpu: [gfxhub] page fault",
    count: 3,
    source: "kernel",
    firstTimestampUs: 1757677330000000,
    lastTimestampUs: 1757677340000000,
    evidence: {
        message: "amdgpu: [gfxhub] page fault",
        priority: 3,
        identifier: "kernel",
    },
    logsTarget: { tag: "kernel", start: "boot", prio: "err" },
};

function snapshot(findings: DiagnosticFinding[], extra?: Partial<FindingsSnapshot>): FindingsSnapshot {
    return { findings, truncated: false, incomplete: false, ...extra };
}

describe("FindingsPage", () => {
    beforeEach(() => {
        loadFindings.mockReset();
        loadFindings.mockResolvedValue(snapshot([]));
    });

    it("shows a loading state", () => {
        loadFindings.mockReturnValue(new Promise(() => undefined));
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(screen.getByText("Loading findings")).toBeInTheDocument();
    });

    it("shows a positive empty state without claiming the system is healthy", async () => {
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("No supported diagnostic findings detected for this boot.")).toBeInTheDocument();
        expect(screen.getByText(/not a health score/)).toBeInTheDocument();
        expect(screen.queryByText(/your system is healthy/i)).not.toBeInTheDocument();
        expect(screen.getByText(/may be incomplete without administrative journal access/)).toBeInTheDocument();
    });

    it("explains when journalctl is unavailable", () => {
        render(
            <FindingsPage
                capabilities={{ ...capabilities, journalctl: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/journalctl is not available/)).toBeInTheDocument();
        expect(loadFindings).not.toHaveBeenCalled();
    });

    it("shows a permission limitation", async () => {
        loadFindings.mockRejectedValue({
            problem: "access-denied",
            message: "No journal files were opened due to insufficient permissions.",
        });
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Permission denied")).toBeInTheDocument();
        expect(screen.getByText(/insufficient permissions/)).toBeInTheDocument();
    });

    it("renders one OOM finding", async () => {
        loadFindings.mockResolvedValue(snapshot([oomFinding]));
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Out-of-memory kill: firefox")).toBeInTheDocument();
        expect(screen.getByText("Memory")).toBeInTheDocument();
        expect(screen.getByText("firefox")).toBeInTheDocument();
        expect(screen.getByText("4321")).toBeInTheDocument();
        expect(screen.getByText("kernel OOM killer")).toBeInTheDocument();
        expect(screen.queryByText("_TRANSPORT")).not.toBeInTheDocument();
        expect(screen.queryByText("PRIORITY")).not.toBeInTheDocument();
        expect(screen.queryByText("__CURSOR")).not.toBeInTheDocument();
    });

    it("renders a grouped kernel finding", async () => {
        loadFindings.mockResolvedValue(snapshot([kernelFinding]));
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("3 occurrences")).toBeInTheDocument();
        expect(screen.getByText("Kernel")).toBeInTheDocument();
        expect(screen.getAllByText("amdgpu: [gfxhub] page fault").length).toBeGreaterThan(0);
        expect(screen.getByText("First")).toBeInTheDocument();
        expect(screen.getByText("Last")).toBeInTheDocument();
    });

    it("renders memory and kernel categories together", async () => {
        loadFindings.mockResolvedValue(snapshot([oomFinding, kernelFinding]));
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Memory")).toBeInTheDocument();
        expect(screen.getByText("Kernel")).toBeInTheDocument();
        expect(screen.getByText("Out-of-memory kill: firefox")).toBeInTheDocument();
        expect(screen.getAllByText("amdgpu: [gfxhub] page fault").length).toBeGreaterThan(0);
    });

    it("shows evidence as untrusted text and jumps through the Logs helper", async () => {
        const user = userEvent.setup();
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);
        loadFindings.mockResolvedValue(snapshot([oomFinding]));
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("Out-of-memory kill: firefox")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Evidence" }));
        expect(screen.getByText(/Out of memory: Killed process 4321 \(firefox\)/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "View in Logs" }));
        expect(jump).toHaveBeenCalledWith("/system/logs#?tag=kernel&grep=Killed%20process&start=boot&prio=err");
        expect(String(jump.mock.calls[0][0])).not.toContain(".html");
        expect(String(jump.mock.calls[0][0])).not.toContain("prio=%2A");
    });

    it("notes truncated and incomplete snapshots", async () => {
        loadFindings.mockResolvedValue(snapshot([kernelFinding], { truncated: true, incomplete: true }));
        render(<FindingsPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText(/display bound/)).toBeInTheDocument();
        expect(screen.getByText(/Some journal queries could not be completed/)).toBeInTheDocument();
    });
});

import React from "react";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecurityPage } from "../../src/pages/SecurityPage";
import type { DiagnosticCapabilities } from "../../src/types/diagnostics";
import type { ServiceSecurityDetail, ServiceSecuritySummary } from "../../src/types/security";
import cockpit from "cockpit";

const { loadSecuritySummaries, loadSecurityDetails } = vi.hoisted(() => ({
    loadSecuritySummaries: vi.fn(),
    loadSecurityDetails: vi.fn(),
}));

vi.mock("../../src/providers/security", () => ({
    loadSecuritySummaries,
    loadSecurityDetails,
}));

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemdAnalyzeSecurity: true,
    systemctl: true,
    coredumpctl: true,
    journalctl: true,
};

const rows: ServiceSecuritySummary[] = [
    { unit: "systemd-journald.service", exposure: 2.1, assessment: "OK" },
    { unit: "NetworkManager.service", exposure: 6.8, assessment: "MEDIUM" },
    { unit: "example.service", exposure: 8.4, assessment: "EXPOSED" },
    { unit: "legacy.service", exposure: 9.2, assessment: "UNSAFE" },
];

const journaldDetail: ServiceSecurityDetail = {
    unit: "systemd-journald.service",
    exposure: 2.1,
    assessment: "OK",
    checks: [
        {
            id: "PrivateTmp",
            name: "PrivateTmp=",
            description: "Temporary directories are private",
            state: "applied",
        },
        {
            id: "ProtectHome",
            name: "ProtectHome=",
            description: "Service has full access to home directories",
            exposure: 0.2,
            state: "not-applied",
        },
        {
            id: "RemoveIPC",
            name: "RemoveIPC=",
            description: "Service runs in special boot phase, option is not appropriate",
            state: "not-applicable",
        },
    ],
};

describe("SecurityPage", () => {
    beforeEach(() => {
        loadSecuritySummaries.mockReset();
        loadSecurityDetails.mockReset();
        loadSecuritySummaries.mockResolvedValue(rows);
        loadSecurityDetails.mockResolvedValue(journaldDetail);
    });

    it("shows a loading state", () => {
        loadSecuritySummaries.mockReturnValue(new Promise(() => undefined));
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(screen.getByText("Loading systemd security analysis")).toBeInTheDocument();
    });

    it("shows an empty state", async () => {
        loadSecuritySummaries.mockResolvedValue([]);
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("No system services analyzed")).toBeInTheDocument();
    });

    it("explains when security analysis is unavailable", () => {
        render(
            <SecurityPage
                capabilities={{ ...capabilities, systemdAnalyzeSecurity: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getByText(/systemd-analyze security is not available/)).toBeInTheDocument();
        expect(loadSecuritySummaries).not.toHaveBeenCalled();
    });

    it("shows a permission limitation", async () => {
        loadSecuritySummaries.mockRejectedValue({
            problem: "access-denied",
            message: "Permission denied",
        });
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findAllByText("Permission denied")).not.toHaveLength(0);
    });

    it("renders the service table with systemd assessment labels", async () => {
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("systemd-journald.service")).toBeInTheDocument();
        expect(screen.getByText("2.1")).toBeInTheDocument();
        expect(screen.getAllByText("OK").length).toBeGreaterThan(0);
        expect(screen.getAllByText("EXPOSED").length).toBeGreaterThan(0);
        expect(screen.getAllByText("UNSAFE").length).toBeGreaterThan(0);
        expect(screen.getByText(/System services/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /start/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /restart/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
        expect(screen.queryByText("predicate")).not.toBeInTheDocument();
        expect(screen.queryByText("json_field")).not.toBeInTheDocument();
        const names = screen.getAllByRole("row").slice(1)
                .map(row => within(row).getAllByRole("cell")[0].textContent);
        expect(names[0]).toBe("legacy.service");
    });

    it("states the disclaimer and never labels exposure as a vulnerability or health score", async () => {
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText(/not a vulnerability scan/i)).toBeInTheDocument();
        expect(screen.getByText(/not prove a service has a vulnerability/i)).toBeInTheDocument();
        expect(screen.getByText(/does not prove a service is safe/i)).toBeInTheDocument();
        expect(screen.queryByText(/vulnerability score/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/system security score/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/health score/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Vulnerabilities/)).not.toBeInTheDocument();
    });

    it("sorts by unit name", async () => {
        const user = userEvent.setup();
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("legacy.service")).toBeInTheDocument();
        const header = screen.getByRole("columnheader", { name: /Unit/ });
        const button = header.querySelector("button");
        expect(button).toBeTruthy();
        await user.click(button as HTMLButtonElement);
        const names = screen.getAllByRole("row").slice(1)
                .map(row => within(row).getAllByRole("cell")[0].textContent);
        expect(names[0]).toBe("example.service");
    });

    it("filters by assessment", async () => {
        const user = userEvent.setup();
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("legacy.service")).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Assessment"), "UNSAFE");
        expect(screen.getByText("legacy.service")).toBeInTheDocument();
        expect(screen.queryByText("systemd-journald.service")).not.toBeInTheDocument();
    });

    it("opens details, shows checks, and jumps to Services", async () => {
        const user = userEvent.setup();
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("systemd-journald.service"));
        expect(await screen.findByText("Hardening checks")).toBeInTheDocument();
        expect(screen.getByText("ProtectHome=")).toBeInTheDocument();
        expect(screen.getByText("Service has full access to home directories")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Not fully applied/ })).toBeInTheDocument();
        expect(loadSecurityDetails).toHaveBeenCalledWith("systemd-journald.service");
        await user.click(screen.getByRole("button", { name: /^Applied \(/ }));
        expect(screen.getByText("PrivateTmp=")).toBeInTheDocument();
        expect(screen.getByText("Temporary directories are private")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /Not applicable/ }));
        expect(screen.getByText("RemoveIPC=")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "View service" }));
        expect(jump).toHaveBeenCalledWith("/system/services#/systemd-journald.service");
        expect(screen.queryByText("json_field")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /View logs/i })).not.toBeInTheDocument();
    });

    it("does not rerun detail analysis for a cached service", async () => {
        const user = userEvent.setup();
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("systemd-journald.service"));
        expect(await screen.findByText("ProtectHome=")).toBeInTheDocument();
        await user.click(screen.getByText("example.service"));
        expect(await screen.findByText("ProtectHome=")).toBeInTheDocument();
        await user.click(screen.getByText("systemd-journald.service"));
        expect(loadSecurityDetails).toHaveBeenCalledTimes(2);
        expect(loadSecurityDetails).toHaveBeenNthCalledWith(1, "systemd-journald.service");
        expect(loadSecurityDetails).toHaveBeenNthCalledWith(2, "example.service");
    });

    it("keeps the table when one service's details fail", async () => {
        const user = userEvent.setup();
        loadSecurityDetails.mockRejectedValue({ problem: "", message: "Unit vanished", exit_status: 1 });
        render(<SecurityPage capabilities={capabilities} onRefresh={() => undefined} />);
        await user.click(await screen.findByText("example.service"));
        expect(await screen.findByText("Could not load setting details")).toBeInTheDocument();
        expect(screen.getByText("legacy.service")).toBeInTheDocument();
        expect(screen.getByText("NetworkManager.service")).toBeInTheDocument();
    });
});

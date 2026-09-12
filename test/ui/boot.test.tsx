import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BootPage } from "../../src/pages/BootPage";
import type { DiagnosticCapabilities } from "../../src/types/diagnostics";

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

const capabilities: DiagnosticCapabilities = {
    systemdAnalyze: true,
    systemdAnalyzeTime: true,
    systemdAnalyzeBlame: true,
    systemdAnalyzeCriticalChain: true,
    systemctl: true,
};

describe("BootPage", () => {
    beforeEach(() => {
        loadBootSummary.mockReset();
        loadBlame.mockReset();
        loadCriticalChain.mockReset();
        loadBootSummary.mockResolvedValue({
            kernelUs: 2_584_000,
            userspaceUs: 47_847_000,
            totalUs: 69_608_000,
            target: "graphical.target",
            targetReachedUs: 47_847_000,
        });
        loadBlame.mockResolvedValue([
            { unit: "NetworkManager.service", durationUs: 4_123_000 },
            { unit: "firewalld.service", durationUs: 1_234_000 },
        ]);
        loadCriticalChain.mockResolvedValue([
            {
                unit: "graphical.target",
                activatedAtUs: 47_847_000,
                children: [
                    {
                        unit: "NetworkManager.service",
                        activatedAtUs: 45_123_000,
                        activationDurationUs: 2_500_000,
                        children: [],
                    },
                ],
            },
        ]);
    });

    it("separates total boot timing, activation duration, and the critical path", async () => {
        render(<BootPage capabilities={capabilities} onRefresh={() => undefined} />);

        expect(await screen.findByText("Total boot timing")).toBeInTheDocument();
        expect(screen.getByText("Unit activation duration")).toBeInTheDocument();
        expect(screen.getByText("Critical boot path")).toBeInTheDocument();
        expect(screen.getByText("Activation time is not the same as boot delay")).toBeInTheDocument();
        expect(screen.getByText(/slowest unit here did not necessarily delay boot/)).toBeInTheDocument();
        expect(screen.getByText(/estimate, not a complete causal proof/)).toBeInTheDocument();
        expect(await screen.findByText("firewalld.service")).toBeInTheDocument();
        expect(screen.getAllByText("NetworkManager.service").length).toBeGreaterThan(0);
        expect(screen.getAllByText("Yes").length).toBeGreaterThan(0);
        expect(screen.getAllByText("graphical.target").length).toBeGreaterThan(0);
    });

    it("sorts the blame table by activation time", async () => {
        const user = userEvent.setup();
        render(<BootPage capabilities={capabilities} onRefresh={() => undefined} />);
        await screen.findByText("firewalld.service");

        const header = screen.getByRole("columnheader", { name: /Activation time/ });
        const button = header.querySelector("button");
        expect(button).toBeTruthy();
        await user.click(button as HTMLButtonElement);

        const rows = screen.getAllByRole("row").slice(1);
        expect(rows[0]).toHaveTextContent("firewalld.service");
    });

    it("still renders blame when the critical chain provider fails", async () => {
        loadCriticalChain.mockRejectedValue({
            problem: "access-denied",
            message: "Permission denied while collecting this diagnostic.",
        });
        render(<BootPage capabilities={capabilities} onRefresh={() => undefined} />);
        expect(await screen.findByText("firewalld.service")).toBeInTheDocument();
        expect(screen.getByText("Permission denied")).toBeInTheDocument();
        expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    });

    it("shows a missing-command state for analyze", () => {
        render(
            <BootPage
                capabilities={{ ...capabilities, systemdAnalyze: false, systemdAnalyzeTime: false, systemdAnalyzeBlame: false, systemdAnalyzeCriticalChain: false }}
                onRefresh={() => undefined}
            />
        );
        expect(screen.getAllByText(/not available/).length).toBeGreaterThan(0);
    });
});

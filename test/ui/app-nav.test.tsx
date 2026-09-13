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
    coredumpctl: true,
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
});

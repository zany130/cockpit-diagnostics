import React from "react";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AsyncState } from "../../src/components/AsyncState";
import { ProviderError } from "../../src/types/providers";

describe("AsyncState", () => {
    it("shows a loading state", () => {
        render(<AsyncState status="loading" loadingLabel="Loading boot timing" />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading boot timing");
    });

    it("shows an empty state", () => {
        render(
            <AsyncState
                status="ready"
                isEmpty
                emptyTitle="No failed units"
                emptyBody="systemd currently reports no failed units."
            />
        );
        expect(screen.getByText("No failed units")).toBeInTheDocument();
        expect(screen.getByText("systemd currently reports no failed units.")).toBeInTheDocument();
    });

    it("shows permission denied distinctly from other errors", () => {
        render(
            <AsyncState
                status="error"
                error={new ProviderError("permission-denied", "Permission denied while collecting this diagnostic.")}
            />
        );
        expect(screen.getByText("Permission denied")).toBeInTheDocument();
        expect(screen.getByText("Permission denied while collecting this diagnostic.")).toBeInTheDocument();
    });

    it("shows unavailable command state", () => {
        render(
            <AsyncState
                status="error"
                error={new ProviderError("not-found", "systemd-analyze: not found")}
            />
        );
        expect(screen.getByText("Command not found")).toBeInTheDocument();
    });

    it("renders children when ready", () => {
        render(
            <AsyncState status="ready">
                <p>Ready content</p>
            </AsyncState>
        );
        expect(screen.getByText("Ready content")).toBeInTheDocument();
    });
});

import React from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core/dist/esm/components/EmptyState/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";

import cockpit from "cockpit";

import { ProviderError } from "../types/providers";

const _ = cockpit.gettext;

export type AsyncStatus = "loading" | "ready" | "error";

export interface AsyncStateProps {
    status: AsyncStatus;
    error?: ProviderError | undefined;
    isEmpty?: boolean;
    emptyTitle?: string | undefined;
    emptyBody?: string | undefined;
    loadingLabel?: string | undefined;
    children?: React.ReactNode;
}

export const AsyncState = ({
    status,
    error,
    isEmpty,
    emptyTitle,
    emptyBody,
    loadingLabel,
    children,
}: AsyncStateProps) => {
    if (status === "loading") {
        return (
            <div className="diagnostics-loading" role="status">
                <Spinner size="lg" aria-label={loadingLabel ?? _("Loading")} />
                <span className="pf-v6-u-ml-sm">{loadingLabel ?? _("Loading")}</span>
            </div>
        );
    }

    if (status === "error" && error) {
        return (
            <Alert
                variant={alertVariant(error.kind)}
                isInline
                title={alertTitle(error.kind)}
            >
                <p>{error.message}</p>
            </Alert>
        );
    }

    if (isEmpty) {
        return (
            <EmptyState titleText={emptyTitle ?? _("No data")} headingLevel="h4">
                {emptyBody && <EmptyStateBody>{emptyBody}</EmptyStateBody>}
            </EmptyState>
        );
    }

    return children ?? null;
};

function alertVariant(kind: ProviderError["kind"]): "danger" | "warning" | "info" {
    if (kind === "permission-denied")
        return "warning";
    if (kind === "not-found" || kind === "not-supported")
        return "info";
    return "danger";
}

function alertTitle(kind: ProviderError["kind"]): string {
    switch (kind) {
    case "not-found":
        return _("Command not found");
    case "not-supported":
        return _("Unavailable");
    case "permission-denied":
        return _("Permission denied");
    case "timeout":
        return _("Timed out");
    case "parse-failed":
        return _("Could not parse output");
    case "command-failed":
        return _("Command failed");
    default:
        return _("Error");
    }
}

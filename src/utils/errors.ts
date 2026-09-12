import { ProviderError, type ProviderErrorKind } from "../types/providers";

interface SpawnFailure {
    problem?: string | null;
    message?: string;
    exit_status?: number | null;
    exit_signal?: number | string | null;
}

export function normalizeSpawnError(error: unknown, source?: string): ProviderError {
    if (error instanceof ProviderError)
        return error;

    const failure = asSpawnFailure(error);
    const message = failure.message?.trim() || "The diagnostic command failed.";
    const kind = kindFromSpawnFailure(failure, message);

    return new ProviderError(kind, summarizeMessage(kind, message), {
        ...(source !== undefined ? { source } : {}),
        cause: error,
    });
}

export function parseFailed(message: string, source?: string): ProviderError {
    return new ProviderError("parse-failed", message, source !== undefined ? { source } : undefined);
}

function asSpawnFailure(error: unknown): SpawnFailure {
    if (typeof error === "object" && error !== null)
        return error as SpawnFailure;
    if (typeof error === "string")
        return { message: error };
    return { message: String(error) };
}

function kindFromSpawnFailure(failure: SpawnFailure, message: string): ProviderErrorKind {
    const problem = failure.problem ?? null;
    if (problem === "not-found")
        return "not-found";
    if (problem === "access-denied")
        return "permission-denied";
    if (problem === "timeout" || problem === "terminated")
        return "timeout";

    const lower = message.toLowerCase();
    if (lower.includes("not been booted with systemd") ||
            lower.includes("unknown command") ||
            lower.includes("invalid option") ||
            lower.includes("too few arguments"))
        return "not-supported";
    if (lower.includes("permission denied") ||
            lower.includes("access denied") ||
            lower.includes("interactive authentication required") ||
            lower.includes("auth"))
        return "permission-denied";
    if (lower.includes("no such file") || lower.includes("not found"))
        return "not-found";

    if (failure.exit_status !== null && failure.exit_status !== undefined && failure.exit_status !== 0)
        return "command-failed";

    return "unknown";
}

function summarizeMessage(kind: ProviderErrorKind, message: string): string {
    const firstLine = message.split("\n")[0]?.trim() || message;
    switch (kind) {
    case "not-found":
        return firstLine || "Required command was not found.";
    case "not-supported":
        return firstLine || "This diagnostic is not available on this system.";
    case "permission-denied":
        return firstLine || "Permission denied while collecting this diagnostic.";
    case "timeout":
        return "The diagnostic command timed out.";
    case "parse-failed":
        return firstLine;
    case "command-failed":
        return firstLine || "The diagnostic command failed.";
    default:
        return firstLine || "An unexpected error occurred.";
    }
}

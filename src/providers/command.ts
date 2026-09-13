import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../utils/locale";
import { normalizeSpawnError } from "../utils/errors";
import { ProviderError } from "../types/providers";

const DEFAULT_TIMEOUT_MS = 20_000;

export interface RunCommandOptions {
    timeoutMs?: number;
    environ?: string[];
    err?: "out" | "ignore" | "message";
    /**
     * If the process exits non-zero, return collected stdout/stderr instead
     * of throwing. Used when the command prints diagnostics on failure
     * (systemd-analyze verify). Timeouts and missing binaries still throw.
     */
    outputOnFailure?: boolean;
}

export async function runCommand(argv: string[], options?: RunCommandOptions): Promise<string> {
    if (argv.length === 0)
        throw new ProviderError("unknown", "No command was specified.");

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const environ = [...COMMAND_ENVIRON, ...(options?.environ ?? [])];
    const process = cockpit.spawn(argv, {
        err: options?.err ?? "message",
        environ,
    });

    /*
     * Do not attach process.stream() for ordinary diagnostics.
     *
     * Cockpit documents that a stream handler consumes stdout, so
     * process.then()/await then receives "". v0.5 registered a streamer on
     * every spawn for verify, which emptied Boot, Crashes, Findings,
     * Security, and plot on real Cockpit — not only boot-ID parsing.
     *
     * v0.4 collected stdout from the promise alone. Restore that unless we
     * must keep bytes after a non-zero exit (systemd-analyze verify).
     * If a streamer is attached, prefer a non-empty promise result, else
     * the streamed buffer. A stream callback must return how many bytes it
     * consumed or Cockpit may replay the same chunk.
     */
    let streamed = "";
    if (options?.outputOnFailure) {
        process.stream?.(chunk => {
            streamed += String(chunk);
            return typeof chunk === "string" ? chunk.length : 0;
        });
    }

    const timer = window.setTimeout(() => process.close("timeout"), timeoutMs);
    try {
        const data = await process;
        return firstNonEmptyOutput(data, streamed);
    } catch (error) {
        if (options?.outputOnFailure && canReturnFailureOutput(error, streamed))
            return failureOutput(error, streamed);
        throw normalizeSpawnError(error, argv[0]);
    } finally {
        window.clearTimeout(timer);
    }
}

function firstNonEmptyOutput(data: unknown, streamed: string): string {
    const resolved = data == null ? "" : String(data);
    if (resolved !== "")
        return resolved;
    return streamed;
}

function canReturnFailureOutput(error: unknown, streamed: string): boolean {
    if (typeof error !== "object" || error === null)
        return streamed.trim() !== "";
    const problem = "problem" in error ? error.problem : undefined;
    if (problem === "timeout" || problem === "terminated" || problem === "not-found" || problem === "access-denied")
        return false;
    return streamed.trim() !== "" || failureMessage(error).trim() !== "";
}

function failureOutput(error: unknown, streamed: string): string {
    const text = streamed.trim() !== "" ? streamed : failureMessage(error);
    return text;
}

function failureMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error)
        return String(error.message ?? "");
    return "";
}

export async function dbusCall(
    name: string,
    path: string,
    iface: string,
    method: string,
    args: unknown[] = [],
    options?: { bus?: "system" | "session" | "user"; timeoutMs?: number }
): Promise<unknown[]> {
    const client = cockpit.dbus(name, { bus: options?.bus ?? "system" });
    let timer: number | undefined;
    try {
        const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        return await Promise.race([
            client.call(path, iface, method, args),
            new Promise<unknown[]>((_resolve, reject) => {
                timer = window.setTimeout(() => {
                    reject(new ProviderError("timeout", "The D-Bus diagnostic call timed out.", { source: method }));
                }, timeout);
            }),
        ]);
    } catch (error) {
        throw normalizeSpawnError(error, method);
    } finally {
        if (timer !== undefined)
            window.clearTimeout(timer);
        client.close();
    }
}

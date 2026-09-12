import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../utils/locale";
import { normalizeSpawnError } from "../utils/errors";
import { ProviderError } from "../types/providers";

const DEFAULT_TIMEOUT_MS = 20_000;

export interface RunCommandOptions {
    timeoutMs?: number;
    environ?: string[];
}

export async function runCommand(argv: string[], options?: RunCommandOptions): Promise<string> {
    if (argv.length === 0)
        throw new ProviderError("unknown", "No command was specified.");

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const environ = [...COMMAND_ENVIRON, ...(options?.environ ?? [])];
    const process = cockpit.spawn(argv, {
        err: "message",
        environ,
    });

    const timer = window.setTimeout(() => process.close("timeout"), timeoutMs);
    try {
        const data = await process;
        return String(data ?? "");
    } catch (error) {
        throw normalizeSpawnError(error, argv[0]);
    } finally {
        window.clearTimeout(timer);
    }
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
    try {
        const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        return await Promise.race([
            client.call(path, iface, method, args),
            new Promise<unknown[]>((_resolve, reject) => {
                window.setTimeout(() => {
                    reject(new ProviderError("timeout", "The D-Bus diagnostic call timed out.", { source: method }));
                }, timeout);
            }),
        ]);
    } catch (error) {
        throw normalizeSpawnError(error, method);
    } finally {
        client.close();
    }
}

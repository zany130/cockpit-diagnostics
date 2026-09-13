export type CoreStorageState =
    | "present"
    | "missing"
    | "journal"
    | "none"
    | "truncated"
    | "error"
    | "inaccessible"
    | "unknown";

/**
 * Normalized coredump row. Field names are independent of coredumpctl's
 * JSON keys (`time`, `sig`, `corefile`, `exe`, …) and info labels.
 */
export interface CoredumpEntry {
    id: string;
    timestampUs?: number;
    pid?: number;
    uid?: number;
    gid?: number;
    user?: string;
    group?: string;
    signal?: number;
    signalName?: string;
    executable?: string;
    command?: string;
    comm?: string;
    unit?: string;
    userUnit?: string;
    slice?: string;
    cgroup?: string;
    session?: string;
    ownerUid?: number;
    bootId?: string;
    currentBoot?: boolean;
    hostname?: string;
    machineId?: string;
    storageState?: CoreStorageState;
    storagePath?: string;
    corePresent?: boolean;
    sizeBytes?: number;
    packageName?: string;
}

export function coredumpProcessLabel(entry: CoredumpEntry): string {
    if (entry.executable)
        return basename(entry.executable);
    if (entry.comm)
        return entry.comm;
    if (entry.command)
        return entry.command.split(/\s+/)[0] || entry.command;
    if (entry.pid !== undefined)
        return "PID " + String(entry.pid);
    return "Unknown process";
}

/**
 * Cockpit Logs `service=` is reliable for a systemd unit name. Prefer the
 * system unit recorded with the dump. A user-unit-only record is omitted
 * because /system/logs does not consistently open the user journal.
 */
export function coredumpLogsUnit(entry: CoredumpEntry): string | undefined {
    if (entry.unit && entry.unit.includes("."))
        return entry.unit;
    return undefined;
}

export function corePresentFromStorage(state?: CoreStorageState): boolean | undefined {
    if (state === "present" || state === "journal" || state === "truncated")
        return true;
    if (state === "missing" || state === "none")
        return false;
    return undefined;
}

function basename(path: string): string {
    const trimmed = path.replace(/\/+$/, "");
    const slash = trimmed.lastIndexOf("/");
    return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

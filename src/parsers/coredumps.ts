import {
    corePresentFromStorage,
    type CoreStorageState,
    type CoredumpEntry,
} from "../types/crashes";
import { parseFailed } from "../utils/errors";
import { stripAnsi } from "../utils/ansi";

const SIGNAL_NAMES: Record<number, string> = {
    1: "SIGHUP",
    2: "SIGINT",
    3: "SIGQUIT",
    4: "SIGILL",
    5: "SIGTRAP",
    6: "SIGABRT",
    7: "SIGBUS",
    8: "SIGFPE",
    9: "SIGKILL",
    10: "SIGUSR1",
    11: "SIGSEGV",
    12: "SIGUSR2",
    13: "SIGPIPE",
    14: "SIGALRM",
    15: "SIGTERM",
    16: "SIGSTKFLT",
    17: "SIGCHLD",
    18: "SIGCONT",
    19: "SIGSTOP",
    20: "SIGTSTP",
    21: "SIGTTIN",
    22: "SIGTTOU",
    23: "SIGURG",
    24: "SIGXCPU",
    25: "SIGXFSZ",
    26: "SIGVTALRM",
    27: "SIGPROF",
    28: "SIGWINCH",
    29: "SIGIO",
    30: "SIGPWR",
    31: "SIGSYS",
};

const STORAGE_STATES = new Set<CoreStorageState>([
    "present",
    "missing",
    "journal",
    "none",
    "truncated",
    "error",
    "inaccessible",
]);

/**
 * Parse `coredumpctl --json=short list` output.
 *
 * Verified against systemd v257 table JSON: keys are the lowercase headers
 * `time`, `pid`, `uid`, `gid`, `sig`, `corefile`, `exe`, `size`.
 * `time` and `size` are unsigned integers (µs / bytes). `sig` is a numeric
 * signal or null. Unknown keys are ignored.
 */
export function parseCoredumpList(output: string, options?: { bootId?: string }): CoredumpEntry[] {
    const trimmed = output.trim();
    if (trimmed === "")
        return [];

    const records = decodeJsonRecords(trimmed);
    const entries: CoredumpEntry[] = [];
    for (const record of records) {
        const entry = parseListRecord(record, options?.bootId);
        if (entry)
            entries.push(entry);
    }

    if (entries.length === 0 && records.length > 0)
        throw parseFailed("coredumpctl JSON did not contain any usable coredump records.", "coredumpctl");

    return entries;
}

export function parseCoredumpInfo(output: string, options?: { bootId?: string }): CoredumpEntry[] {
    const text = stripAnsi(output)
            .replace(/\r\n/g, "\n")
            .trim();
    if (text === "")
        return [];

    const blocks = text.split(/\n\s*\n/);
    const entries: CoredumpEntry[] = [];
    for (const block of blocks) {
        const entry = parseInfoBlock(block, options?.bootId);
        if (entry)
            entries.push(entry);
    }
    return entries;
}

export function mergeCoredumpInfo(base: CoredumpEntry, info?: CoredumpEntry): CoredumpEntry {
    if (!info)
        return base;

    const merged: CoredumpEntry = { ...base };
    assignIfMissing(merged, "timestampUs", info.timestampUs);
    assignIfMissing(merged, "pid", info.pid);
    assignIfMissing(merged, "uid", info.uid);
    assignIfMissing(merged, "gid", info.gid);
    assignIfMissing(merged, "signal", info.signal);
    assignIfMissing(merged, "signalName", info.signalName);
    assignIfMissing(merged, "executable", info.executable);
    assignIfMissing(merged, "sizeBytes", info.sizeBytes);
    assignIfMissing(merged, "storageState", info.storageState);
    assignIfMissing(merged, "corePresent", info.corePresent);

    if (info.user)
        merged.user = info.user;
    if (info.group)
        merged.group = info.group;
    if (info.command)
        merged.command = info.command;
    if (info.comm)
        merged.comm = info.comm;
    if (info.unit)
        merged.unit = info.unit;
    if (info.userUnit)
        merged.userUnit = info.userUnit;
    if (info.slice)
        merged.slice = info.slice;
    if (info.cgroup)
        merged.cgroup = info.cgroup;
    if (info.session)
        merged.session = info.session;
    if (info.ownerUid !== undefined)
        merged.ownerUid = info.ownerUid;
    if (info.bootId)
        merged.bootId = info.bootId;
    if (info.hostname)
        merged.hostname = info.hostname;
    if (info.machineId)
        merged.machineId = info.machineId;
    if (info.storagePath)
        merged.storagePath = info.storagePath;
    if (info.packageName)
        merged.packageName = info.packageName;
    if (info.currentBoot !== undefined)
        merged.currentBoot = info.currentBoot;

    if (merged.storageState) {
        const present = corePresentFromStorage(merged.storageState);
        if (present !== undefined)
            merged.corePresent = present;
    }
    if (!merged.signalName && merged.signal !== undefined) {
        const name = signalName(merged.signal);
        if (name)
            merged.signalName = name;
    }

    return merged;
}

export function isNoCoredumpsMessage(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes("no coredumps found") || lower.includes("no match found");
}

function decodeJsonRecords(text: string): Record<string, unknown>[] {
    try {
        return asRecordArray(JSON.parse(text));
    } catch {
        const lines = text.split("\n")
                .map(line => line.trim())
                .filter(Boolean);
        if (lines.length === 0)
            throw parseFailed("coredumpctl JSON output was empty.", "coredumpctl");

        const records: Record<string, unknown>[] = [];
        for (const line of lines) {
            try {
                records.push(...asRecordArray(JSON.parse(line)));
            } catch {
                throw parseFailed("coredumpctl JSON output could not be parsed.", "coredumpctl");
            }
        }
        return records;
    }
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
    if (value === null)
        throw parseFailed("coredumpctl JSON output was empty.", "coredumpctl");
    if (Array.isArray(value)) {
        const records = value.filter((item): item is Record<string, unknown> => isPlainObject(item));
        if (records.length === 0 && value.length > 0)
            throw parseFailed("coredumpctl JSON output was not an array of records.", "coredumpctl");
        return records;
    }
    if (isPlainObject(value))
        return [value];
    throw parseFailed("coredumpctl JSON output was not an array of records.", "coredumpctl");
}

function parseListRecord(record: Record<string, unknown>, bootId?: string): CoredumpEntry | undefined {
    const pid = optionalNumber(first(record, ["pid", "PID"]));
    const timestampUs = optionalNumber(first(record, ["time", "TIME"]));
    const uid = optionalNumber(first(record, ["uid", "UID"]));
    const gid = optionalNumber(first(record, ["gid", "GID"]));
    const signal = optionalNumber(first(record, ["sig", "SIG", "signal"]));
    const executable = optionalString(first(record, ["exe", "EXE"]));
    const sizeBytes = optionalNumber(first(record, ["size", "SIZE"]));
    const storageState = parseStorageState(first(record, ["corefile", "COREFILE"]));

    if (pid === undefined && timestampUs === undefined && executable === undefined && storageState === undefined)
        return undefined;

    const entry: CoredumpEntry = {
        id: makeId(bootId, pid, timestampUs, executable),
    };
    if (timestampUs !== undefined)
        entry.timestampUs = timestampUs;
    if (pid !== undefined)
        entry.pid = pid;
    if (uid !== undefined)
        entry.uid = uid;
    if (gid !== undefined)
        entry.gid = gid;
    if (signal !== undefined) {
        entry.signal = signal;
        const name = signalName(signal);
        if (name)
            entry.signalName = name;
    }
    if (executable)
        entry.executable = executable;
    if (storageState) {
        entry.storageState = storageState;
        const present = corePresentFromStorage(storageState);
        if (present !== undefined)
            entry.corePresent = present;
    }
    if (sizeBytes !== undefined)
        entry.sizeBytes = sizeBytes;
    if (bootId) {
        entry.bootId = bootId;
        entry.currentBoot = true;
    }
    return entry;
}

function parseInfoBlock(block: string, currentBootId?: string): CoredumpEntry | undefined {
    const fields = parseInfoFields(block);
    if (Object.keys(fields).length === 0)
        return undefined;

    const pidField = parsePidField(fields.PID);
    const uidField = parseIdNameField(fields.UID);
    const gidField = parseIdNameField(fields.GID);
    const owner = parseIdNameField(fields["Owner UID"]);
    const signalField = parseSignalField(fields.Signal ?? fields.Reason);
    const storage = parseStorageField(fields.Storage);
    const bootId = optionalString(fields["Boot ID"])
            ?.replace(/-/g, "")
            .toLowerCase();
    const timestampUs = parseInfoTimestamp(fields.Timestamp);
    const sizeBytes = parseSizeOnDisk(fields["Size on Disk"]);

    const entry: CoredumpEntry = {
        id: makeId(bootId ?? currentBootId, pidField.pid, timestampUs, optionalString(fields.Executable)),
    };

    if (pidField.pid !== undefined)
        entry.pid = pidField.pid;
    if (pidField.comm)
        entry.comm = pidField.comm;
    if (uidField.id !== undefined)
        entry.uid = uidField.id;
    if (uidField.name)
        entry.user = uidField.name;
    if (gidField.id !== undefined)
        entry.gid = gidField.id;
    if (gidField.name)
        entry.group = gidField.name;
    if (signalField.signal !== undefined)
        entry.signal = signalField.signal;
    if (signalField.name)
        entry.signalName = signalField.name;
    const executable = optionalString(fields.Executable);
    if (executable)
        entry.executable = executable;
    const command = optionalString(fields["Command Line"]);
    if (command)
        entry.command = command;
    const unit = optionalString(fields.Unit);
    if (unit)
        entry.unit = unit;
    const userUnit = optionalString(fields["User Unit"]);
    if (userUnit)
        entry.userUnit = userUnit;
    const slice = optionalString(fields.Slice);
    if (slice)
        entry.slice = slice;
    const cgroup = optionalString(fields["Control Group"]);
    if (cgroup)
        entry.cgroup = cgroup;
    const session = optionalString(fields.Session);
    if (session)
        entry.session = session;
    if (owner.id !== undefined)
        entry.ownerUid = owner.id;
    if (bootId)
        entry.bootId = bootId;
    if (currentBootId)
        entry.currentBoot = bootId ? bootId === currentBootId : true;
    const hostname = optionalString(fields.Hostname);
    if (hostname)
        entry.hostname = hostname;
    const machineId = optionalString(fields["Machine ID"]);
    if (machineId)
        entry.machineId = machineId;
    if (storage.state) {
        entry.storageState = storage.state;
        const present = corePresentFromStorage(storage.state);
        if (present !== undefined)
            entry.corePresent = present;
    }
    if (storage.path)
        entry.storagePath = storage.path;
    if (sizeBytes !== undefined)
        entry.sizeBytes = sizeBytes;
    if (timestampUs !== undefined)
        entry.timestampUs = timestampUs;
    const pkg = optionalString(fields.Package);
    if (pkg)
        entry.packageName = pkg;

    return entry;
}

function parseInfoFields(block: string): Record<string, string> {
    const fields: Record<string, string> = {};
    let current: string | undefined;
    for (const rawLine of block.split("\n")) {
        const line = rawLine.replace(/\s+$/, "");
        const match = line.match(/^\s*([^:]+):\s*(.*)$/);
        if (match) {
            current = match[1].trim();
            fields[current] = match[2].trim();
            continue;
        }
        if (current && /^\s/.test(rawLine)) {
            fields[current] += "\n" + rawLine.trim();
        }
    }
    return fields;
}

function parsePidField(value?: string): { pid?: number; comm?: string } {
    if (!value)
        return {};
    const match = value.match(/^(\d+)(?:\s+\((.*)\))?/);
    if (!match)
        return {};
    const result: { pid?: number; comm?: string } = { pid: Number(match[1]) };
    if (match[2])
        result.comm = match[2];
    return result;
}

function parseIdNameField(value?: string): { id?: number; name?: string } {
    if (!value)
        return {};
    const match = value.match(/^(\d+)(?:\s+\((.*)\))?/);
    if (!match)
        return {};
    const result: { id?: number; name?: string } = { id: Number(match[1]) };
    if (match[2])
        result.name = match[2];
    return result;
}

function parseSignalField(value?: string): { signal?: number; name?: string } {
    if (!value)
        return {};
    const match = value.match(/^(\d+)(?:\s+\(([^)]+)\))?/);
    if (!match) {
        const trimmedName = value.trim();
        return trimmedName ? { name: trimmedName } : {};
    }
    const signal = Number(match[1]);
    const rawName = match[2]?.trim();
    const name = rawName
        ? (rawName.startsWith("SIG") ? rawName : signalName(signal) ?? ("SIG" + rawName))
        : signalName(signal);
    const result: { signal?: number; name?: string } = { signal };
    if (name)
        result.name = name;
    return result;
}

function parseStorageField(value?: string): { path?: string; state?: CoreStorageState } {
    if (!value)
        return {};
    const trimmed = value.trim();
    const match = trimmed.match(/^(.*?)\s+\(([^)]+)\)\s*$/);
    if (match) {
        const state = parseStorageState(match[2]);
        const path = match[1].trim();
        const result: { path?: string; state?: CoreStorageState } = {};
        if (state)
            result.state = state;
        if (path && path !== "-" && path !== "none" && path !== "journal")
            result.path = path;
        else if (path === "journal" || path === "none") {
            const fromPath = parseStorageState(path);
            if (fromPath)
                result.state = fromPath;
        }
        return result;
    }
    const state = parseStorageState(trimmed);
    if (state)
        return { state };
    if (trimmed && trimmed !== "-")
        return { path: trimmed, state: "unknown" };
    return {};
}

function parseInfoTimestamp(value?: string): number | undefined {
    if (!value)
        return undefined;
    const withoutRelative = value.replace(/\s*\([^)]*ago\)\s*$/, "").trim();
    const parsed = Date.parse(withoutRelative);
    if (Number.isNaN(parsed))
        return undefined;
    return parsed * 1000;
}

function parseSizeOnDisk(value?: string): number | undefined {
    if (!value || value === "-")
        return undefined;
    const match = value.trim().match(/^([\d.]+)\s*([KMGTPE]i?B?)?$/i);
    if (!match)
        return undefined;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount))
        return undefined;
    const unit = (match[2] ?? "").toUpperCase();
    const factor =
        unit.startsWith("K")
            ? 1024
            : unit.startsWith("M")
                ? 1024 ** 2
                : unit.startsWith("G")
                    ? 1024 ** 3
                    : unit.startsWith("T")
                        ? 1024 ** 4
                        : 1;
    return Math.round(amount * factor);
}

function parseStorageState(value: unknown): CoreStorageState | undefined {
    if (value === null || value === undefined)
        return undefined;
    const raw = String(value)
            .trim()
            .toLowerCase();
    if (raw === "" || raw === "-")
        return undefined;
    if (STORAGE_STATES.has(raw as CoreStorageState))
        return raw as CoreStorageState;
    return "unknown";
}

function signalName(signal: number): string | undefined {
    return SIGNAL_NAMES[signal];
}

function makeId(bootId: string | undefined, pid: number | undefined, timestampUs: number | undefined, executable?: string): string {
    return [bootId ?? "boot", pid ?? "nopid", timestampUs ?? "notime", executable ?? ""].join(":");
}

function first(record: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined)
            return record[key];
    }
    return undefined;
}

function optionalNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === "" || value === "-")
        return undefined;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()))
        return Number(value.trim());
    return undefined;
}

function optionalString(value: unknown): string | undefined {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "-")
        return undefined;
    return trimmed;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignIfMissing<K extends keyof CoredumpEntry>(
    target: CoredumpEntry,
    key: K,
    value: CoredumpEntry[K] | undefined
): void {
    if (target[key] === undefined && value !== undefined)
        target[key] = value;
}

import type { CoredumpEntry } from "../types/crashes";
import { ProviderError } from "../types/providers";
import { bootIdMatch, parseBootId } from "../parsers/bootId";
import {
    isNoCoredumpsMessage,
    mergeCoredumpInfo,
    parseCoredumpInfo,
    parseCoredumpList,
} from "../parsers/coredumps";
import { runCommand } from "./command";

const COREDUMP_TIMEOUT_MS = 20_000;
const BOOT_ID_PATH = "/proc/sys/kernel/random/boot_id";

export async function loadCoredumps(): Promise<CoredumpEntry[]> {
    const bootId = await readCurrentBootId();
    const output = await runCoredumpctl([
        "--no-pager",
        "--json=short",
        "list",
        bootIdMatch(bootId),
    ]);
    if (output === null)
        return [];
    return parseCoredumpList(output, { bootId });
}

export async function loadCoredumpDetails(entry: CoredumpEntry): Promise<CoredumpEntry> {
    const matches = infoMatches(entry);
    if (matches.length === 0)
        return entry;

    const output = await runCoredumpctl(["--no-pager", "info", ...matches]);
    if (output === null)
        return entry;

    const parsed = parseCoredumpInfo(output, entry.bootId ? { bootId: entry.bootId } : undefined);
    const info = selectInfoRecord(entry, parsed);
    return mergeCoredumpInfo(entry, info);
}

export async function readCurrentBootId(): Promise<string> {
    const output = await runCommand(["cat", BOOT_ID_PATH], { timeoutMs: 5_000 });
    return parseBootId(output);
}

async function runCoredumpctl(args: string[]): Promise<string | null> {
    try {
        return await runCommand(["coredumpctl", ...args], { timeoutMs: COREDUMP_TIMEOUT_MS });
    } catch (error) {
        if (error instanceof ProviderError && isNoCoredumpsMessage(error.message))
            return null;
        throw error;
    }
}

function infoMatches(entry: CoredumpEntry): string[] {
    const matches: string[] = [];
    if (entry.pid !== undefined)
        matches.push("COREDUMP_PID=" + String(entry.pid));
    if (entry.bootId)
        matches.push(bootIdMatch(entry.bootId));
    return matches;
}

function selectInfoRecord(entry: CoredumpEntry, records: CoredumpEntry[]): CoredumpEntry | undefined {
    if (records.length === 0)
        return undefined;
    if (records.length === 1)
        return records[0];

    const byPid = entry.pid === undefined
        ? records
        : records.filter(record => record.pid === entry.pid);
    const pool = byPid.length > 0 ? byPid : records;
    if (entry.timestampUs === undefined)
        return pool[0];

    let best = pool[0];
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const record of pool) {
        if (record.timestampUs === undefined)
            continue;
        const delta = Math.abs(record.timestampUs - entry.timestampUs);
        if (delta < bestDelta) {
            best = record;
            bestDelta = delta;
        }
    }
    return best;
}

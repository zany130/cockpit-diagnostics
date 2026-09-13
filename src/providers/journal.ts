import type { DiagnosticFinding, FindingsSnapshot } from "../types/findings";
import type { JournalEntry } from "../types/journal";
import { ProviderError } from "../types/providers";
import { detectKernelFindings } from "../detectors/kernel";
import { detectOomFindings } from "../detectors/oom";
import { parseJournalOutput } from "../parsers/journal";
import { normalizeSpawnError } from "../utils/errors";
import { runCommand } from "./command";

const JOURNAL_TIMEOUT_MS = 20_000;

/** Current-boot high-priority kernel events (emerg..err). */
export const KERNEL_PRIORITY_LINE_LIMIT = 200;
/** Focused kernel OOM-kill completion lines. */
export const KERNEL_OOM_LINE_LIMIT = 50;
/** systemd-oomd.service notices for the current boot. */
export const OOMD_LINE_LIMIT = 100;
/** PID 1 catalog OOM / oomd-kill messages. */
export const CATALOG_LINE_LIMIT = 100;

const OUTPUT_FIELDS = [
    "MESSAGE",
    "PRIORITY",
    "_TRANSPORT",
    "SYSLOG_IDENTIFIER",
    "_PID",
    "_COMM",
    "_SYSTEMD_UNIT",
    "UNIT",
    "MESSAGE_ID",
].join(",");

const BASE_ARGV = [
    "--no-pager",
    "--quiet",
    "--output=json",
    "--output-fields=" + OUTPUT_FIELDS,
    "--boot=0",
];

/**
 * Current-boot diagnostic findings from bounded journalctl queries.
 *
 * Queries are independent: a failed OOM query does not hide kernel
 * findings, and the reverse. Unprivileged; no superuser. `--grep` is
 * documented to exit 1 when nothing matches — that is treated as empty.
 */
export async function loadFindings(): Promise<FindingsSnapshot> {
    const queries = await Promise.all([
        queryJournal([
            ...BASE_ARGV,
            "--dmesg",
            "--priority=err",
            "--lines=" + String(KERNEL_PRIORITY_LINE_LIMIT),
        ], KERNEL_PRIORITY_LINE_LIMIT),
        queryJournal([
            ...BASE_ARGV,
            "--dmesg",
            "--grep=[Oo]ut of memory: Killed process",
            "--lines=" + String(KERNEL_OOM_LINE_LIMIT),
        ], KERNEL_OOM_LINE_LIMIT),
        queryJournal([
            ...BASE_ARGV,
            "--unit=systemd-oomd.service",
            "--lines=" + String(OOMD_LINE_LIMIT),
        ], OOMD_LINE_LIMIT),
        queryJournal([
            ...BASE_ARGV,
            "MESSAGE_ID=d989611b15e44c9dbf31e3c81256e4ed",
            "MESSAGE_ID=fe6faa94e7774663a0da52717891d8ef",
            "--lines=" + String(CATALOG_LINE_LIMIT),
        ], CATALOG_LINE_LIMIT),
    ]);

    const succeeded = queries.filter(query => query.error === undefined);
    if (succeeded.length === 0) {
        throw queries[0]?.error ?? new ProviderError(
            "unknown",
            "journalctl did not return any diagnostic data.",
            { source: "journalctl" }
        );
    }

    const kernelEntries = mergeEntries(
        queries[0].entries,
        queries[1].entries,
    );
    const oomEntries = mergeEntries(
        queries[0].entries,
        queries[1].entries,
        queries[2].entries,
        queries[3].entries,
    );

    let oomFindings: DiagnosticFinding[] = [];
    let kernelFindings: DiagnosticFinding[] = [];
    try {
        oomFindings = detectOomFindings(oomEntries);
    } catch {
        oomFindings = [];
    }
    try {
        kernelFindings = detectKernelFindings(kernelEntries);
    } catch {
        kernelFindings = [];
    }

    const findings = [...oomFindings, ...kernelFindings]
            .sort(compareFindings);

    return {
        findings,
        truncated: queries.some(query => query.truncated),
        incomplete: queries.some(query => query.error !== undefined),
    };
}

interface JournalQueryResult {
    entries: JournalEntry[];
    truncated: boolean;
    error?: ProviderError;
}

async function queryJournal(args: string[], lineLimit: number): Promise<JournalQueryResult> {
    try {
        const output = await runJournalctl(args);
        const parsed = parseJournalOutput(output);
        return {
            entries: parsed.entries,
            truncated: parsed.entries.length >= lineLimit,
        };
    } catch (error) {
        const normalized = error instanceof ProviderError
            ? error
            : normalizeSpawnError(error, "journalctl");
        return { entries: [], truncated: false, error: normalized };
    }
}

async function runJournalctl(args: string[]): Promise<string> {
    try {
        return await runCommand(["journalctl", ...args], { timeoutMs: JOURNAL_TIMEOUT_MS });
    } catch (error) {
        const normalized = error instanceof ProviderError
            ? error
            : normalizeSpawnError(error, "journalctl");
        if (isNoJournalMatches(normalized, args))
            return "";
        throw normalized;
    }
}

export function isNoJournalMatches(error: ProviderError, args: string[]): boolean {
    if (error.kind === "permission-denied" ||
            error.kind === "not-found" ||
            error.kind === "timeout" ||
            error.kind === "not-supported")
        return false;

    const message = error.message.toLowerCase();
    if (message.includes("no journal files") ||
            message.includes("no entries") ||
            message.includes("-- no entries --"))
        return true;

    const usedGrep = args.some(arg => arg === "--grep" || arg === "-g" || arg.startsWith("--grep="));
    if (!usedGrep)
        return false;
    if (error.kind !== "command-failed" && error.kind !== "unknown")
        return false;
    return message === "" || message === "the diagnostic command failed.";
}

function mergeEntries(...lists: JournalEntry[][]): JournalEntry[] {
    const byCursor = new Map<string, JournalEntry>();
    const noCursor: JournalEntry[] = [];
    for (const list of lists) {
        for (const entry of list) {
            if (entry.cursor) {
                if (!byCursor.has(entry.cursor))
                    byCursor.set(entry.cursor, entry);
            } else {
                noCursor.push(entry);
            }
        }
    }
    return [...byCursor.values(), ...noCursor];
}

function compareFindings(a: DiagnosticFinding, b: DiagnosticFinding): number {
    if (a.category !== b.category)
        return a.category === "memory" ? -1 : 1;
    return (b.lastTimestampUs ?? 0) - (a.lastTimestampUs ?? 0);
}

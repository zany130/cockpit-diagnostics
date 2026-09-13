import type { DiagnosticSeverity } from "../types/diagnostics";
import type { DiagnosticFinding, FindingEvidence } from "../types/findings";
import { isKernelOriginated, type JournalEntry } from "../types/journal";
import { isKernelOomKillMessage, truncateEvidence } from "./oom";

/**
 * High-priority kernel journal events for the current boot.
 *
 * Uses journal PRIORITY metadata, not severity guessed from MESSAGE.
 * Includes emerg (0), alert (1), crit (2), and err (3) only.
 * Kernel warnings (4) are out of scope.
 *
 * Grouping is exact trimmed MESSAGE text. Distinct messages stay separate.
 * Kernel OOM-kill completion lines are owned by the memory detector.
 */
export const KERNEL_FINDING_PRIORITY_MAX = 3;

export function detectKernelFindings(entries: JournalEntry[]): DiagnosticFinding[] {
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of entries) {
        if (!isKernelHighPriorityEvent(entry) || !entry.message)
            continue;
        pushGroup(groups, entry.message, entry);
    }

    return [...groups.entries()].map(([message, group]) => {
        const representative = latest(group);
        const priority = representative.priority ?? highestPriority(group);
        const times = group
                .map(entry => entry.realtimeUs)
                .filter((value): value is number => value !== undefined)
                .sort((a, b) => a - b);
        const finding: DiagnosticFinding = {
            id: "kernel:" + stableKey(message),
            category: "kernel",
            severity: kernelSeverity(priority),
            title: conciseTitle(message),
            summary: message,
            count: group.length,
            source: "kernel",
            logsTarget: { tag: "kernel", start: "boot", prio: "err" },
        };
        if (times[0] !== undefined)
            finding.firstTimestampUs = times[0];
        if (times[times.length - 1] !== undefined)
            finding.lastTimestampUs = times[times.length - 1];
        const evidence = evidenceFrom(representative);
        if (evidence)
            finding.evidence = evidence;
        return finding;
    });
}

export function isKernelHighPriorityEvent(entry: JournalEntry): boolean {
    if (!isKernelOriginated(entry))
        return false;
    if (entry.priority === undefined || entry.priority > KERNEL_FINDING_PRIORITY_MAX)
        return false;
    if (entry.message && isKernelOomKillMessage(entry.message))
        return false;
    return true;
}

function kernelSeverity(priority: number): DiagnosticSeverity {
    return priority <= 2 ? "error" : "warning";
}

function conciseTitle(message: string): string {
    const firstLine = message.split("\n")[0]?.trim() || message;
    if (firstLine.length <= 120)
        return firstLine;
    return firstLine.slice(0, 119) + "…";
}

function stableKey(message: string): string {
    let hash = 2166136261;
    for (let i = 0; i < message.length; i++) {
        hash ^= message.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

function evidenceFrom(entry: JournalEntry): FindingEvidence | undefined {
    const evidence: FindingEvidence = {};
    if (entry.message !== undefined)
        evidence.message = truncateEvidence(entry.message);
    if (entry.cursor !== undefined)
        evidence.cursor = entry.cursor;
    if (entry.priority !== undefined)
        evidence.priority = entry.priority;
    if (entry.identifier !== undefined)
        evidence.identifier = entry.identifier;
    if (entry.unit !== undefined)
        evidence.unit = entry.unit;
    return Object.keys(evidence).length > 0 ? evidence : undefined;
}

function highestPriority(entries: JournalEntry[]): number {
    let best = 3;
    for (const entry of entries) {
        if (entry.priority !== undefined && entry.priority < best)
            best = entry.priority;
    }
    return best;
}

function latest(entries: JournalEntry[]): JournalEntry {
    return entries.reduce((best, entry) => {
        if ((entry.realtimeUs ?? 0) >= (best.realtimeUs ?? 0))
            return entry;
        return best;
    });
}

function pushGroup(groups: Map<string, JournalEntry[]>, key: string, entry: JournalEntry): void {
    const list = groups.get(key);
    if (list)
        list.push(entry);
    else
        groups.set(key, [entry]);
}

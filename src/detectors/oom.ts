import type { DiagnosticFinding, FindingEvidence, LogsTarget } from "../types/findings";
import { isKernelOriginated, type JournalEntry } from "../types/journal";
import { literalLogsGrep } from "../utils/cockpitLinks";

/**
 * Conservative kernel OOM-killer evidence.
 *
 * Matches the kill completion lines from mm/oom_kill.c:
 *   "Out of memory: Killed process <pid> (<comm>) ..."
 *   "Memory cgroup out of memory: Killed process <pid> (<comm>) ..."
 *
 * Does not treat "invoked oom-killer", oom_reaper, oom_score_adj, or
 * generic "memory pressure" lines as kills.
 */
export const KERNEL_OOM_KILL_RE =
    /^(?:Memory cgroup out of memory|Out of memory): Killed process (\d+) \(([^)]+)\)/;

/**
 * systemd catalog ID for a kernel OOM kill attributed to a unit (PID 1).
 * sd-messages.h: SD_MESSAGE_UNIT_OUT_OF_MEMORY
 */
export const KERNEL_OOM_UNIT_MESSAGE_ID = "fe6faa94e7774663a0da52717891d8ef";

/**
 * systemd catalog ID for systemd-oomd killing processes in a unit (PID 1).
 * sd-messages.h: SD_MESSAGE_UNIT_OOMD_KILL
 */
export const SYSTEMD_OOMD_KILL_MESSAGE_ID = "d989611b15e44c9dbf31e3c81256e4ed";

/**
 * systemd-oomd daemon notice when it actually kills a cgroup.
 * src/oom/oomd-manager.c: "Killed %s due to memory used|pressure ..."
 * Does not match "Failed to kill any cgroups...".
 */
export const SYSTEMD_OOMD_KILL_RE = /^Killed (.+?) due to memory (used|pressure)\b/;

export function isKernelOomKillMessage(message: string): boolean {
    return KERNEL_OOM_KILL_RE.test(message.trim());
}

export function detectOomFindings(entries: JournalEntry[]): DiagnosticFinding[] {
    const kernelKills: JournalEntry[] = [];
    const catalogKernel: JournalEntry[] = [];
    const oomdKills: JournalEntry[] = [];
    const catalogOomd: JournalEntry[] = [];

    for (const entry of entries) {
        if (isKernelOomKill(entry))
            kernelKills.push(entry);
        else if (isCatalogKernelOom(entry))
            catalogKernel.push(entry);
        else if (isSystemdOomdKill(entry))
            oomdKills.push(entry);
        else if (isCatalogOomdKill(entry))
            catalogOomd.push(entry);
    }

    const findings: DiagnosticFinding[] = [];
    findings.push(...groupKernelOom(kernelKills));

    if (findings.length === 0)
        findings.push(...groupCatalogKernelOom(catalogKernel));

    const oomd = [
        ...groupSystemdOomd(oomdKills),
        ...groupCatalogOomd(catalogOomd),
    ];
    findings.push(...dedupeOomd(oomd));
    return findings;
}

function isKernelOomKill(entry: JournalEntry): boolean {
    if (!isKernelOriginated(entry) || !entry.message)
        return false;
    return isKernelOomKillMessage(entry.message);
}

function isCatalogKernelOom(entry: JournalEntry): boolean {
    return entry.messageId === KERNEL_OOM_UNIT_MESSAGE_ID;
}

function isSystemdOomdKill(entry: JournalEntry): boolean {
    if (!entry.message)
        return false;
    if (entry.messageId === SYSTEMD_OOMD_KILL_MESSAGE_ID)
        return false;
    return SYSTEMD_OOMD_KILL_RE.test(entry.message.trim());
}

function isCatalogOomdKill(entry: JournalEntry): boolean {
    return entry.messageId === SYSTEMD_OOMD_KILL_MESSAGE_ID;
}

function groupKernelOom(entries: JournalEntry[]): DiagnosticFinding[] {
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of entries) {
        const parsed = parseKernelOom(entry.message ?? "");
        const key = parsed?.comm
            ? "comm:" + parsed.comm
            : parsed?.pid !== undefined
                ? "pid:" + String(parsed.pid)
                : "unknown";
        pushGroup(groups, key, entry);
    }
    return [...groups.entries()].map(([key, group]) => {
        const representative = latest(group);
        const parsed = parseKernelOom(representative.message ?? "");
        return makeOomFinding({
            id: "memory:kernel:" + key,
            source: "kernel",
            entries: group,
            representative,
            process: parsed?.comm,
            pid: parsed?.pid ?? representative.pid,
            logsTarget: kernelOomLogsTarget(),
        });
    });
}

function groupCatalogKernelOom(entries: JournalEntry[]): DiagnosticFinding[] {
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of entries)
        pushGroup(groups, entry.unit ? "unit:" + entry.unit : "unknown", entry);
    return [...groups.entries()].map(([key, group]) => {
        const representative = latest(group);
        return makeOomFinding({
            id: "memory:kernel-catalog:" + key,
            source: "kernel",
            entries: group,
            representative,
            unit: representative.unit,
            logsTarget: kernelOomLogsTarget(),
        });
    });
}

function groupSystemdOomd(entries: JournalEntry[]): DiagnosticFinding[] {
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of entries) {
        const parsed = parseOomdKill(entry.message ?? "");
        const key = parsed?.cgroup
            ? "cgroup:" + parsed.cgroup
            : entry.unit
                ? "unit:" + entry.unit
                : "unknown";
        pushGroup(groups, key, entry);
    }
    return [...groups.entries()].map(([key, group]) => {
        const representative = latest(group);
        const parsed = parseOomdKill(representative.message ?? "");
        const cgroup = parsed?.cgroup ?? representative.unit;
        return makeOomFinding({
            id: "memory:oomd:" + key,
            source: "systemd-oomd",
            entries: group,
            representative,
            cgroup,
            unit: looksLikeUnit(cgroup) ? cgroup : representative.unit,
            logsTarget: oomdLogsTarget(looksLikeUnit(cgroup) ? cgroup : representative.unit),
        });
    });
}

function groupCatalogOomd(entries: JournalEntry[]): DiagnosticFinding[] {
    const groups = new Map<string, JournalEntry[]>();
    for (const entry of entries)
        pushGroup(groups, entry.unit ? "unit:" + entry.unit : "unknown", entry);
    return [...groups.entries()].map(([key, group]) => {
        const representative = latest(group);
        return makeOomFinding({
            id: "memory:oomd-catalog:" + key,
            source: "systemd-oomd",
            entries: group,
            representative,
            unit: representative.unit,
            cgroup: representative.unit,
            logsTarget: oomdLogsTarget(representative.unit),
        });
    });
}

function dedupeOomd(findings: DiagnosticFinding[]): DiagnosticFinding[] {
    const seen = new Set<string>();
    const result: DiagnosticFinding[] = [];
    for (const finding of findings) {
        const identity = (finding.cgroup ?? finding.unit ?? finding.id).toLowerCase();
        if (seen.has(identity))
            continue;
        seen.add(identity);
        result.push(finding);
    }
    return result;
}

function makeOomFinding(options: {
    id: string;
    source: "kernel" | "systemd-oomd";
    entries: JournalEntry[];
    representative: JournalEntry;
    process?: string | undefined;
    pid?: number | undefined;
    cgroup?: string | undefined;
    unit?: string | undefined;
    logsTarget: LogsTarget;
}): DiagnosticFinding {
    const times = options.entries
            .map(entry => entry.realtimeUs)
            .filter((value): value is number => value !== undefined)
            .sort((a, b) => a - b);
    const process = options.process;
    const cgroup = options.cgroup;
    const subject = process ?? cgroup ?? options.unit;
    const title = subject
        ? "Out-of-memory kill: " + subject
        : "Out-of-memory kill activity detected";
    const summary = options.source === "systemd-oomd"
        ? subject
            ? "systemd-oomd reported a kill of " + subject + "."
            : "systemd-oomd reported a kill."
        : subject
            ? "The kernel OOM killer reported a kill of " + subject + "."
            : "Kernel out-of-memory kill activity was recorded.";

    const finding: DiagnosticFinding = {
        id: options.id,
        category: "memory",
        severity: "warning",
        title,
        summary,
        count: options.entries.length,
        source: options.source,
        logsTarget: options.logsTarget,
    };
    if (times[0] !== undefined)
        finding.firstTimestampUs = times[0];
    if (times[times.length - 1] !== undefined)
        finding.lastTimestampUs = times[times.length - 1];
    if (process !== undefined)
        finding.process = process;
    if (options.pid !== undefined)
        finding.pid = options.pid;
    if (cgroup !== undefined)
        finding.cgroup = cgroup;
    if (options.unit !== undefined)
        finding.unit = options.unit;
    const evidence = evidenceFrom(options.representative);
    if (evidence)
        finding.evidence = evidence;
    return finding;
}

function parseKernelOom(message: string): { pid: number; comm: string } | undefined {
    const match = KERNEL_OOM_KILL_RE.exec(message.trim());
    if (!match)
        return undefined;
    return { pid: Number(match[1]), comm: match[2] };
}

function parseOomdKill(message: string): { cgroup: string; reason: string } | undefined {
    const match = SYSTEMD_OOMD_KILL_RE.exec(message.trim());
    if (!match)
        return undefined;
    return { cgroup: match[1], reason: match[2] };
}

function kernelOomLogsTarget(): LogsTarget {
    const grep = literalLogsGrep("Killed process");
    const target: LogsTarget = { tag: "kernel", start: "boot", prio: "err" };
    if (grep !== undefined)
        target.grep = grep;
    return target;
}

function oomdLogsTarget(unit?: string): LogsTarget {
    return {
        service: unit && looksLikeUnit(unit) ? unit : "systemd-oomd.service",
        start: "boot",
        prio: "*",
    };
}

function looksLikeUnit(value?: string): boolean {
    return Boolean(value && /^[\w@.:\\-]+\.(service|slice|scope|socket|mount|target)$/.test(value));
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

export function truncateEvidence(message: string, max = 500): string {
    if (message.length <= max)
        return message;
    return message.slice(0, max) + "…";
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

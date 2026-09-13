import type { DiagnosticSeverity } from "./diagnostics";

export type FindingCategory = "memory" | "kernel";
export type FindingSource = "kernel" | "systemd-oomd";

/**
 * Cockpit Logs navigation target. These are Logs UI filters, not journalctl
 * JSON field names. Keep route construction in cockpitLinks.
 */
export interface LogsTarget {
    start?: "boot";
    prio?: string;
    tag?: string;
    service?: string;
    grep?: string;
}

export interface FindingEvidence {
    message?: string;
    cursor?: string;
    priority?: number;
    identifier?: string;
    unit?: string;
}

export interface DiagnosticFinding {
    id: string;
    category: FindingCategory;
    severity: DiagnosticSeverity;
    title: string;
    summary: string;
    count: number;
    source: FindingSource;
    firstTimestampUs?: number;
    lastTimestampUs?: number;
    process?: string;
    pid?: number;
    cgroup?: string;
    unit?: string;
    evidence?: FindingEvidence;
    logsTarget?: LogsTarget;
}

export interface FindingsSnapshot {
    findings: DiagnosticFinding[];
    truncated: boolean;
    incomplete: boolean;
}

export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticCategory =
    | "boot"
    | "unit"
    | "crash"
    | "journal"
    | "kernel"
    | "memory"
    | "security";

export interface DiagnosticFinding {
    severity: DiagnosticSeverity;
    category: DiagnosticCategory;
    title: string;
    summary: string;
    source: string;
    evidence?: string[];
}

export interface FailedUnit {
    unit: string;
    loadState?: string;
    activeState?: string;
    subState?: string;
    description?: string;
    result?: string;
    execMainStatus?: number;
    inactiveEnterTimestamp?: string;
}

/**
 * Capability matrix for implemented milestones only. v0.2 adds coredumpctl.
 * Do not add journalctl, plot, or security probes until those milestones
 * actually consume them.
 */
export interface DiagnosticCapabilities {
    systemdAnalyze: boolean;
    systemdAnalyzeTime: boolean;
    systemdAnalyzeBlame: boolean;
    systemdAnalyzeCriticalChain: boolean;
    systemctl: boolean;
    coredumpctl: boolean;
    systemdVersion?: number;
}

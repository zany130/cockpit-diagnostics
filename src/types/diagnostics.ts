export type DiagnosticSeverity = "info" | "warning" | "error";

export type DiagnosticCategory =
    | "boot"
    | "unit"
    | "crash"
    | "kernel"
    | "memory"
    | "security";

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
 * Capability matrix for implemented milestones only. v0.4 adds
 * systemd-analyze security. Do not add plot or verify probes until those
 * milestones consume them.
 */
export interface DiagnosticCapabilities {
    systemdAnalyze: boolean;
    systemdAnalyzeTime: boolean;
    systemdAnalyzeBlame: boolean;
    systemdAnalyzeCriticalChain: boolean;
    systemdAnalyzeSecurity: boolean;
    systemctl: boolean;
    coredumpctl: boolean;
    journalctl: boolean;
    systemdVersion?: number;
}

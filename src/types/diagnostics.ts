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
 * Capability matrix for implemented milestones only. v0.5 adds
 * systemd-analyze plot and verify.
 */
export interface DiagnosticCapabilities {
    systemdAnalyze: boolean;
    systemdAnalyzeTime: boolean;
    systemdAnalyzeBlame: boolean;
    systemdAnalyzeCriticalChain: boolean;
    systemdAnalyzeSecurity: boolean;
    systemdAnalyzePlot: boolean;
    systemdAnalyzeVerify: boolean;
    systemctl: boolean;
    coredumpctl: boolean;
    journalctl: boolean;
    systemdVersion?: number;
}

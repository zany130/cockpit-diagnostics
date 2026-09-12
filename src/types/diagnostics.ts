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

export interface DiagnosticCapabilities {
    systemdAnalyze: boolean;
    systemdAnalyzeTime: boolean;
    systemdAnalyzeBlame: boolean;
    systemdAnalyzeCriticalChain: boolean;
    systemdAnalyzePlot: boolean;
    systemdAnalyzeSecurity: boolean;
    journalctl: boolean;
    coredumpctl: boolean;
    systemctl: boolean;
    systemdVersion?: number;
}

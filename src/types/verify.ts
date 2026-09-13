export type VerificationSeverity = "error" | "warning" | "info";

export interface InstalledUnitFile {
    unit: string;
    state?: string;
}

export interface VerificationFinding {
    severity: VerificationSeverity;
    message: string;
    unit?: string;
    path?: string;
    line?: number;
    related: boolean;
}

export interface VerificationResult {
    requestedUnit: string;
    findings: VerificationFinding[];
}

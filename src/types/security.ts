export type SecurityAssessment =
    | "PERFECT"
    | "SAFE"
    | "OK"
    | "MEDIUM"
    | "EXPOSED"
    | "UNSAFE"
    | "DANGEROUS";

/**
 * systemd-analyze security summary row. Field names here are not the raw
 * JSON keys (`predicate`, `happy`, …).
 */
export interface ServiceSecuritySummary {
    unit: string;
    exposure?: number;
    assessment?: string;
}

export type SecurityCheckState = "applied" | "not-applied" | "not-applicable";

export interface ServiceSecurityCheck {
    id: string;
    name: string;
    description?: string;
    exposure?: number;
    state: SecurityCheckState;
}

export interface ServiceSecurityDetail {
    unit: string;
    exposure?: number;
    assessment?: string;
    checks: ServiceSecurityCheck[];
}

/** systemd's own assessment order, highest exposure first. */
export const SECURITY_ASSESSMENT_RANK: Record<string, number> = {
    DANGEROUS: 6,
    UNSAFE: 5,
    EXPOSED: 4,
    MEDIUM: 3,
    OK: 2,
    SAFE: 1,
    PERFECT: 0,
};

export function assessmentRank(assessment?: string): number {
    if (!assessment)
        return -1;
    return SECURITY_ASSESSMENT_RANK[assessment] ?? -1;
}

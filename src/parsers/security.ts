import { parseFailed } from "../utils/errors";
import type {
    ServiceSecurityCheck,
    ServiceSecurityDetail,
    ServiceSecuritySummary,
    SecurityCheckState,
} from "../types/security";

/**
 * Parse `systemd-analyze --json=short security` output.
 *
 * Verified against systemd 255:
 * - No unit names: JSON array of { unit, exposure, predicate, happy }.
 *   `exposure` is a decimal string 0.0–10.0. `predicate` is the assessment.
 *   `happy` is a smiley glyph and is ignored.
 * - One unit name: JSON array of { set, name, json_field, description, exposure }.
 *   `set` is true (applied), false (not applied), or null (not applicable).
 *
 * Unknown extra fields are ignored. One bad record does not drop the rest.
 */
export function parseSecuritySummaries(output: string): ServiceSecuritySummary[] {
    const records = decodeJsonArray(output, "systemd-analyze security");
    const summaries: ServiceSecuritySummary[] = [];
    for (const record of records) {
        const summary = parseSummaryRecord(record);
        if (summary)
            summaries.push(summary);
    }
    if (summaries.length === 0 && records.length > 0)
        throw parseFailed("systemd-analyze security JSON did not contain any service rows.", "systemd-analyze");
    return summaries;
}

export function parseSecurityDetails(output: string, unit: string): ServiceSecurityDetail {
    const records = decodeJsonArray(output, "systemd-analyze security");
    const checks: ServiceSecurityCheck[] = [];
    for (const record of records) {
        const check = parseCheckRecord(record);
        if (check)
            checks.push(check);
    }
    if (checks.length === 0 && records.length > 0)
        throw parseFailed("systemd-analyze security JSON did not contain any setting checks.", "systemd-analyze");

    const detail: ServiceSecurityDetail = { unit, checks };
    return detail;
}

function parseSummaryRecord(record: Record<string, unknown>): ServiceSecuritySummary | undefined {
    const unit = optionalString(record.unit);
    if (!unit)
        return undefined;
    const summary: ServiceSecuritySummary = { unit };
    const exposure = optionalExposure(record.exposure);
    const assessment = optionalString(record.predicate);
    if (exposure !== undefined)
        summary.exposure = exposure;
    if (assessment !== undefined)
        summary.assessment = assessment;
    return summary;
}

function parseCheckRecord(record: Record<string, unknown>): ServiceSecurityCheck | undefined {
    const id = optionalString(record.json_field) ?? optionalString(record.name);
    if (!id)
        return undefined;
    const name = optionalString(record.name) ?? id;
    const check: ServiceSecurityCheck = {
        id,
        name,
        state: checkState(record.set),
    };
    const description = optionalString(record.description);
    const exposure = optionalExposure(record.exposure);
    if (description !== undefined)
        check.description = description;
    if (exposure !== undefined)
        check.exposure = exposure;
    return check;
}

function checkState(value: unknown): SecurityCheckState {
    if (value === true)
        return "applied";
    if (value === false)
        return "not-applied";
    return "not-applicable";
}

function optionalExposure(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0)
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0)
            return n;
    }
    return undefined;
}

function optionalString(value: unknown): string | undefined {
    if (typeof value !== "string")
        return undefined;
    const text = value.trim();
    return text === "" ? undefined : text;
}

function decodeJsonArray(output: string, source: string): Record<string, unknown>[] {
    const text = output.replace(/^\uFEFF/, "").trim();
    if (text === "")
        return [];
    try {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed))
            throw parseFailed("systemd-analyze security JSON was not an array.", source);
        return parsed.filter((item): item is Record<string, unknown> => isPlainObject(item));
    } catch (error) {
        if (error instanceof Error && error.name === "ProviderError")
            throw error;
        throw parseFailed("systemd-analyze security JSON could not be parsed.", source);
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

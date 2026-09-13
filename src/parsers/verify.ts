import { stripAnsi } from "../utils/ansi";
import type { VerificationFinding, VerificationResult, VerificationSeverity } from "../types/verify";

const UNIT_NAME_RE = /^[A-Za-z0-9_.@\\-]+\.[A-Za-z][A-Za-z0-9-]*$/;

/**
 * Parse systemd-analyze verify stderr/stdout.
 *
 * Verified against systemd 255: findings are text lines (usually stderr).
 * There is no JSON mode. Default exit status is 0 even when warnings exist;
 * missing dependencies can still exit 1. Do not treat exit status as the
 * finding list.
 */
export function parseVerifyOutput(output: string, requestedUnit: string): VerificationResult {
    const lines = stripAnsi(output)
            .replace(/^\uFEFF/, "")
            .split(/\r?\n/);
    const findings: VerificationFinding[] = [];
    let pending: VerificationFinding | undefined;

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.trim() === "")
            continue;
        if (/^\s/.test(line) && pending) {
            pending.message = `${pending.message} ${line.trim()}`;
            continue;
        }
        const finding = parseVerifyLine(line.trim(), requestedUnit);
        if (!finding)
            continue;
        findings.push(finding);
        pending = finding;
    }

    return { requestedUnit, findings };
}

function parseVerifyLine(line: string, requestedUnit: string): VerificationFinding | undefined {
    const bracket = line.match(/^\[(.+):(\d+)\]\s+(.*)$/);
    if (bracket)
        return makeFinding(requestedUnit, bracket[3], locationFromPath(bracket[1]), Number(bracket[2]));

    const pathLine = line.match(/^(\S+):(\d+):\s+(.*)$/);
    if (pathLine)
        return makeFinding(requestedUnit, pathLine[3], locationFromPath(pathLine[1]), Number(pathLine[2]));

    const missing = line.match(/^Unit\s+(\S+)\s+not found\.?$/i);
    if (missing)
        return makeFinding(requestedUnit, line, { unit: missing[1] });

    const failedLoad = line.match(/^Unit\s+(\S+)\s+failed to load:/i);
    if (failedLoad)
        return makeFinding(requestedUnit, line, { unit: failedLoad[1] });

    const unitPrefix = line.match(/^(\S+):\s+(.*)$/);
    if (unitPrefix && looksLikeUnitOrPath(unitPrefix[1]))
        return makeFinding(requestedUnit, unitPrefix[2], locationFromPath(unitPrefix[1]));

    if (/^error:/i.test(line) || /^failed\b/i.test(line) || /cannot be started/i.test(line))
        return makeFinding(requestedUnit, line);

    return makeFinding(requestedUnit, line);
}

function makeFinding(
    requestedUnit: string,
    message: string,
    location?: { unit?: string; path?: string },
    line?: number
): VerificationFinding {
    const finding: VerificationFinding = {
        severity: classifySeverity(message),
        message: message.trim(),
        related: false,
    };
    const unit = location?.unit && UNIT_NAME_RE.test(location.unit) ? location.unit : undefined;
    if (unit !== undefined)
        finding.unit = unit;
    if (location?.path !== undefined)
        finding.path = location.path;
    if (line !== undefined && Number.isFinite(line))
        finding.line = line;
    finding.related = finding.unit !== undefined && finding.unit !== requestedUnit;
    return finding;
}

function locationFromPath(value: string): { unit?: string; path?: string } {
    const trimmed = value.replace(/^\.\//, "");
    const base = trimmed.includes("/") ? trimmed.slice(trimmed.lastIndexOf("/") + 1) : trimmed;
    const location: { unit?: string; path?: string } = {};
    if (value.includes("/") || value.startsWith("."))
        location.path = value;
    if (UNIT_NAME_RE.test(base))
        location.unit = base;
    return location;
}

function looksLikeUnitOrPath(value: string): boolean {
    if (value === "Error" || value === "Warning" || value === "Failed")
        return false;
    return UNIT_NAME_RE.test(value) || value.includes("/") || value.startsWith(".");
}

function classifySeverity(message: string): VerificationSeverity {
    const lower = message.toLowerCase();
    if (/\bignoring\b/.test(lower) || /unknown (key|lvalue|section)/.test(lower))
        return "warning";
    if (/not found|failed to|cannot be started|invalid argument|loadfailed|error:/.test(lower))
        return "error";
    return "warning";
}

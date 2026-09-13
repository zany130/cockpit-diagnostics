import type { ServiceSecurityDetail, ServiceSecuritySummary } from "../types/security";
import { ProviderError } from "../types/providers";
import { parseSecurityDetails, parseSecuritySummaries } from "../parsers/security";
import { runCommand } from "./command";

const LIST_TIMEOUT_MS = 60_000;
const DETAIL_TIMEOUT_MS = 25_000;

/**
 * Loaded long-running system services from the live systemd manager.
 *
 * One process inspects every matching unit. Do not poll. Call again only
 * on explicit refresh. Per-unit details are a separate, cheaper command.
 */
export async function loadSecuritySummaries(): Promise<ServiceSecuritySummary[]> {
    const output = await runSecurity([]);
    return parseSecuritySummaries(output);
}

export async function loadSecurityDetails(unit: string): Promise<ServiceSecurityDetail> {
    assertServiceUnit(unit);
    const output = await runSecurity([unit], DETAIL_TIMEOUT_MS);
    const detail = parseSecurityDetails(output, unit);
    return detail;
}

/**
 * systemd-analyze treats some leading-dash tokens as options. Pass only a
 * unit name as its own argv entry; never a path or an option-like string.
 */
function assertServiceUnit(unit: string): void {
    if (unit === "" || unit.startsWith("-") || unit.includes("/") || /\s/.test(unit)) {
        throw new ProviderError(
            "not-supported",
            "Unsupported unit name for systemd-analyze security.",
            { source: "systemd-analyze" }
        );
    }
}

async function runSecurity(units: string[], timeoutMs = LIST_TIMEOUT_MS): Promise<string> {
    return await runCommand(
        ["systemd-analyze", "--system", "--no-pager", "--json=short", "security", ...units],
        { timeoutMs }
    );
}

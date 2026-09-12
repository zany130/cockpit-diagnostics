import type { BootSummary, CriticalChainNode, UnitActivationTiming } from "../types/boot";
import { ProviderError } from "../types/providers";
import { parseBlame } from "../parsers/blame";
import { parseBootTime } from "../parsers/bootTime";
import { parseCriticalChain } from "../parsers/criticalChain";
import { runCommand } from "./command";

const ANALYZE_TIMEOUT_MS = 25_000;

export async function loadBootSummary(): Promise<BootSummary> {
    const output = await runAnalyze(["time"]);
    return parseBootTime(output);
}

export async function loadBlame(): Promise<UnitActivationTiming[]> {
    const output = await runAnalyze(["blame"]);
    return parseBlame(output);
}

export async function loadCriticalChain(): Promise<CriticalChainNode[]> {
    const output = await runAnalyze(["critical-chain"], { quiet: true });
    return parseCriticalChain(output);
}

async function runAnalyze(command: string[], extra?: { quiet?: boolean }): Promise<string> {
    const options = ["--system", "--no-pager"];
    try {
        const argv = extra?.quiet
            ? ["systemd-analyze", "--quiet", ...options, ...command]
            : ["systemd-analyze", ...options, ...command];
        return await runCommand(argv, { timeoutMs: ANALYZE_TIMEOUT_MS });
    } catch (error) {
        if (extra?.quiet && error instanceof ProviderError)
            return await runCommand(["systemd-analyze", ...options, ...command], { timeoutMs: ANALYZE_TIMEOUT_MS });
        throw error;
    }
}

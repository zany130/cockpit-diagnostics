import type { DiagnosticCapabilities } from "../types/diagnostics";
import { ProviderError } from "../types/providers";
import { parseAnalyzeHelp, parseSystemdVersion } from "../parsers/analyzeHelp";
import { runCommand } from "./command";

let cached: Promise<DiagnosticCapabilities> | null = null;

const EMPTY_CAPABILITIES: DiagnosticCapabilities = {
    systemdAnalyze: false,
    systemdAnalyzeTime: false,
    systemdAnalyzeBlame: false,
    systemdAnalyzeCriticalChain: false,
    systemctl: false,
    coredumpctl: false,
};

export function detectCapabilities(): Promise<DiagnosticCapabilities> {
    if (!cached)
        cached = probeCapabilities();
    return cached;
}

export function resetCapabilitiesCache(): void {
    cached = null;
}

async function probeCapabilities(): Promise<DiagnosticCapabilities> {
    const caps: DiagnosticCapabilities = { ...EMPTY_CAPABILITIES };

    const analyze = await probeAnalyze();
    Object.assign(caps, analyze);

    const systemctl = await probeVersionCommand("systemctl");
    caps.systemctl = systemctl.present;
    if (caps.systemdVersion === undefined && systemctl.version !== undefined)
        caps.systemdVersion = systemctl.version;

    const coredumpctl = await probeVersionCommand("coredumpctl");
    caps.coredumpctl = coredumpctl.present;
    if (caps.systemdVersion === undefined && coredumpctl.version !== undefined)
        caps.systemdVersion = coredumpctl.version;

    return caps;
}

async function probeAnalyze(): Promise<Partial<DiagnosticCapabilities>> {
    try {
        const [help, versionOutput] = await Promise.all([
            runCommand(["systemd-analyze", "--no-pager", "--help"], { timeoutMs: 8_000 }),
            runCommand(["systemd-analyze", "--no-pager", "--version"], { timeoutMs: 8_000 }).catch(() => ""),
        ]);
        const features = parseAnalyzeHelp(help);
        const result: Partial<DiagnosticCapabilities> = {
            systemdAnalyze: true,
            systemdAnalyzeTime: features.time,
            systemdAnalyzeBlame: features.blame,
            systemdAnalyzeCriticalChain: features.criticalChain,
        };
        const version = parseSystemdVersion(versionOutput || help);
        if (version !== undefined)
            result.systemdVersion = version;
        return result;
    } catch (error) {
        if (error instanceof ProviderError && error.kind === "not-found")
            return { systemdAnalyze: false };
        return { systemdAnalyze: false };
    }
}

async function probeVersionCommand(command: string): Promise<{ present: boolean; version?: number }> {
    try {
        const output = await runCommand([command, "--no-pager", "--version"], { timeoutMs: 8_000 });
        const version = parseSystemdVersion(output);
        return version !== undefined ? { present: true, version } : { present: true };
    } catch (error) {
        if (error instanceof ProviderError && error.kind === "not-found")
            return { present: false };
        return { present: true };
    }
}

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
    systemdAnalyzePlot: false,
    systemdAnalyzeSecurity: false,
    journalctl: false,
    coredumpctl: false,
    systemctl: false,
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

    const [systemctl, journalctl, coredumpctl] = await Promise.all([
        probeVersionCommand("systemctl"),
        probeVersionCommand("journalctl"),
        probeVersionCommand("coredumpctl"),
    ]);
    caps.systemctl = systemctl.present;
    caps.journalctl = journalctl.present;
    caps.coredumpctl = coredumpctl.present;
    if (caps.systemdVersion === undefined && systemctl.version !== undefined)
        caps.systemdVersion = systemctl.version;

    return caps;
}

async function probeAnalyze(): Promise<Partial<DiagnosticCapabilities>> {
    try {
        const [help, versionOutput] = await Promise.all([
            runCommand(["systemd-analyze", "--help"], { timeoutMs: 8_000 }),
            runCommand(["systemd-analyze", "--version"], { timeoutMs: 8_000 }).catch(() => ""),
        ]);
        const features = parseAnalyzeHelp(help);
        const result: Partial<DiagnosticCapabilities> = {
            systemdAnalyze: true,
            systemdAnalyzeTime: features.time,
            systemdAnalyzeBlame: features.blame,
            systemdAnalyzeCriticalChain: features.criticalChain,
            systemdAnalyzePlot: features.plot,
            systemdAnalyzeSecurity: features.security,
        };
        const version = parseSystemdVersion(versionOutput || help);
        if (version !== undefined)
            result.systemdVersion = version;
        return result;
    } catch (error) {
        if (error instanceof ProviderError && error.kind === "not-found")
            return { systemdAnalyze: false };
        // Binary exists but probing failed; keep analyze marked unavailable.
        return { systemdAnalyze: false };
    }
}

async function probeVersionCommand(command: string): Promise<{ present: boolean; version?: number }> {
    try {
        const output = await runCommand([command, "--version"], { timeoutMs: 8_000 });
        const version = parseSystemdVersion(output);
        return version !== undefined ? { present: true, version } : { present: true };
    } catch (error) {
        if (error instanceof ProviderError && error.kind === "not-found")
            return { present: false };
        return { present: true };
    }
}

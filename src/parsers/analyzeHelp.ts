export interface AnalyzeHelpFeatures {
    time: boolean;
    blame: boolean;
    criticalChain: boolean;
    plot: boolean;
    security: boolean;
}

export function parseSystemdVersion(output: string): number | undefined {
    const match = output.match(/systemd[^\d]*(\d+)/i);
    if (!match)
        return undefined;
    const version = Number(match[1]);
    return Number.isFinite(version) ? version : undefined;
}

export function parseAnalyzeHelp(output: string): AnalyzeHelpFeatures {
    const text = output.toLowerCase();
    return {
        time: /(^|\s)\[time\]|\btime\b/.test(text),
        blame: /\bblame\b/.test(text),
        criticalChain: /\bcritical-chain\b/.test(text),
        plot: /\bplot\b/.test(text),
        security: /\bsecurity\b/.test(text),
    };
}

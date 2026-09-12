import type { BootSummary } from "../types/boot";
import { parseFailed } from "../utils/errors";
import { parseTimespan } from "../utils/duration";
import { stripAnsi } from "../utils/ansi";

const STARTUP_PREFIX = "Startup finished in ";
const PHASE_NAMES = ["firmware", "loader", "kernel", "initrd", "userspace"] as const;

type PhaseName = typeof PHASE_NAMES[number];

export function parseBootTime(output: string): BootSummary {
    const lines = stripAnsi(output).split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0);
    const startupLine = lines.find(line => line.includes(STARTUP_PREFIX));
    if (!startupLine)
        throw parseFailed("systemd-analyze time did not include a 'Startup finished in' line.", "boot-time");

    const withoutPrefix = startupLine.slice(startupLine.indexOf(STARTUP_PREFIX) + STARTUP_PREFIX.length);
    const eq = withoutPrefix.lastIndexOf(" = ");
    if (eq === -1)
        throw parseFailed("systemd-analyze time output is missing a total duration.", "boot-time");

    const phasesText = withoutPrefix.slice(0, eq);
    const totalText = withoutPrefix.slice(eq + 3);
    const totalUs = parseTimespan(totalText);
    if (totalUs === null)
        throw parseFailed(`Could not parse total boot duration '${totalText}'.`, "boot-time");

    const summary: BootSummary = { totalUs };
    const phaseParts = phasesText.split(" + ");
    if (phaseParts.length === 0 || (phaseParts.length === 1 && phaseParts[0] === ""))
        throw parseFailed("systemd-analyze time output listed no boot phases.", "boot-time");

    let parsedPhases = 0;
    for (const part of phaseParts) {
        const match = part.match(/^(.+) \(([^)]+)\)$/);
        if (!match) {
            // Partial output: skip unparseable fragments rather than failing the rest.
            continue;
        }
        const duration = parseTimespan(match[1]);
        const name = match[2].toLowerCase();
        if (duration === null || !isPhaseName(name))
            continue;
        assignPhase(summary, name, duration);
        parsedPhases++;
    }

    if (parsedPhases === 0)
        throw parseFailed("systemd-analyze time output listed no recognized boot phases.", "boot-time");

    const reachedLine = lines.find(line => / reached after /.test(line));
    if (reachedLine) {
        const reached = stripAnsi(reachedLine).match(/^(\S+) reached after (.+) in userspace\.?$/i);
        if (reached) {
            const reachedUs = parseTimespan(reached[2]);
            summary.target = reached[1];
            if (reachedUs !== null)
                summary.targetReachedUs = reachedUs;
        }
    }

    return summary;
}

function isPhaseName(name: string): name is PhaseName {
    return (PHASE_NAMES as readonly string[]).includes(name);
}

function assignPhase(summary: BootSummary, name: PhaseName, duration: number): void {
    if (name === "firmware")
        summary.firmwareUs = duration;
    else if (name === "loader")
        summary.loaderUs = duration;
    else if (name === "kernel")
        summary.kernelUs = duration;
    else if (name === "initrd")
        summary.initrdUs = duration;
    else
        summary.userspaceUs = duration;
}

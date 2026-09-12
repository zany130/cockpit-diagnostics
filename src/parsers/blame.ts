import type { UnitActivationTiming } from "../types/boot";
import { stripAnsi } from "../utils/ansi";
import { parseFailed } from "../utils/errors";
import { parseTimespan } from "../utils/duration";

export function parseBlame(output: string): UnitActivationTiming[] {
    const lines = output.split(/\r?\n/);
    const timings: UnitActivationTiming[] = [];
    let sawContent = false;

    for (const raw of lines) {
        const line = stripAnsi(raw).trim();
        if (line === "")
            continue;
        sawContent = true;

        const parsed = parseBlameLine(line);
        if (parsed === null)
            continue;
        timings.push(parsed);
    }

    if (sawContent && timings.length === 0)
        throw parseFailed("systemd-analyze blame output could not be parsed.", "blame");

    return timings;
}

function parseBlameLine(line: string): UnitActivationTiming | null {
    // Duration may contain spaces ("1min 2.345s"); the unit name is the last token.
    const match = line.match(/^((?:\d+(?:\.\d+)?(?:us|µs|ms|s|min|h|d)\s*)+)\s+(\S+)$/);
    if (!match)
        return null;

    const durationUs = parseTimespan(match[1]);
    if (durationUs === null)
        return null;

    return { unit: match[2], durationUs };
}

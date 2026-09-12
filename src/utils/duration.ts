const UNIT_MICROSECONDS: Record<string, number> = {
    us: 1,
    µs: 1,
    ms: 1_000,
    s: 1_000_000,
    min: 60_000_000,
    h: 3_600_000_000,
    d: 86_400_000_000,
};

const TIMESPAN_TOKEN = /(\d+(?:\.\d+)?)(us|µs|ms|s|min|h|d)/g;

export function parseTimespan(input: string): number | null {
    const text = input.trim();
    if (!text)
        return null;

    TIMESPAN_TOKEN.lastIndex = 0;
    let total = 0;
    let matched = false;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = TIMESPAN_TOKEN.exec(text)) !== null) {
        const gap = text.slice(cursor, match.index);
        if (gap.trim() !== "")
            return null;
        matched = true;
        const amount = Number(match[1]);
        const unit = match[2];
        if (!Number.isFinite(amount) || UNIT_MICROSECONDS[unit] === undefined)
            return null;
        total += amount * UNIT_MICROSECONDS[unit];
        cursor = TIMESPAN_TOKEN.lastIndex;
    }

    if (!matched || text.slice(cursor).trim() !== "")
        return null;

    return Math.round(total);
}

export function formatDuration(durationUs: number): string {
    if (!Number.isFinite(durationUs))
        return "—";

    const abs = Math.abs(durationUs);
    const sign = durationUs < 0 ? "-" : "";

    if (abs < 1000)
        return `${sign}${Math.round(abs)} µs`;
    if (abs < 1_000_000) {
        const ms = abs / 1000;
        return `${sign}${trimNumber(ms)} ms`;
    }

    const totalSeconds = abs / 1_000_000;
    if (totalSeconds < 60)
        return `${sign}${trimNumber(totalSeconds)} s`;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;
    if (minutes < 60) {
        if (seconds < 0.0005)
            return `${sign}${minutes} min`;
        return `${sign}${minutes} min ${trimNumber(seconds)} s`;
    }

    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes - hours * 60;
    if (remainMinutes === 0 && seconds < 0.0005)
        return `${sign}${hours} h`;
    if (seconds < 0.0005)
        return `${sign}${hours} h ${remainMinutes} min`;
    return `${sign}${hours} h ${remainMinutes} min ${trimNumber(seconds)} s`;
}

export function formatDurationExact(durationUs: number): string {
    return `${Math.round(durationUs)} µs`;
}

function trimNumber(value: number): string {
    if (Number.isInteger(value))
        return String(value);
    return value.toFixed(3).replace(/\.?0+$/, "");
}

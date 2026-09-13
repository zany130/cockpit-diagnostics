import {
    isKernelOriginated,
    type JournalEntry,
} from "../types/journal";

/**
 * Parse `journalctl --output=json` (NDJSON: one object per line).
 *
 * Verified against systemd 255/257: field values are usually strings.
 * `__CURSOR`, `__REALTIME_TIMESTAMP`, `__MONOTONIC_TIMESTAMP`, and
 * `_BOOT_ID` are always printed even when `--output-fields=` is used.
 * MESSAGE may be `null` when truncated (>4096 bytes) or a number array
 * when binary; those are skipped rather than decoded.
 *
 * One malformed line does not invalidate other valid entries.
 */
export interface JournalParseResult {
    entries: JournalEntry[];
    skipped: number;
}

export function parseJournalOutput(output: string): JournalParseResult {
    const text = output.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
    if (text.trim() === "")
        return { entries: [], skipped: 0 };

    const trimmed = text.trim();
    if (trimmed.startsWith("[")) {
        const fromArray = parseJsonArray(trimmed);
        if (fromArray)
            return fromArray;
    }

    const entries: JournalEntry[] = [];
    let skipped = 0;
    for (const line of text.split("\n")) {
        const raw = line.trim();
        if (raw === "")
            continue;
        const entry = parseJournalRecord(parseJsonObject(raw));
        if (entry)
            entries.push(entry);
        else
            skipped++;
    }
    return { entries, skipped };
}

function parseJsonArray(text: string): JournalParseResult | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        if (!Array.isArray(parsed))
            return undefined;
        const entries: JournalEntry[] = [];
        let skipped = 0;
        for (const item of parsed) {
            const entry = parseJournalRecord(isPlainObject(item) ? item : undefined);
            if (entry)
                entries.push(entry);
            else
                skipped++;
        }
        return { entries, skipped };
    } catch {
        return undefined;
    }
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        return isPlainObject(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

export function parseJournalRecord(record: Record<string, unknown> | undefined): JournalEntry | undefined {
    if (!record)
        return undefined;

    const entry: JournalEntry = {};
    const cursor = optionalString(record.__CURSOR);
    const realtimeUs = optionalMicroseconds(record.__REALTIME_TIMESTAMP);
    const bootId = optionalString(record._BOOT_ID);
    const message = optionalMessage(record.MESSAGE);
    const priority = optionalPriority(record.PRIORITY);
    const transport = optionalString(record._TRANSPORT);
    const identifier = optionalString(record.SYSLOG_IDENTIFIER);
    const pid = optionalPid(record._PID);
    const comm = optionalString(record._COMM);
    const unit = optionalString(record._SYSTEMD_UNIT) ?? optionalString(record.UNIT);
    const messageId = optionalMessageId(record.MESSAGE_ID);

    if (cursor !== undefined)
        entry.cursor = cursor;
    if (realtimeUs !== undefined)
        entry.realtimeUs = realtimeUs;
    if (bootId !== undefined)
        entry.bootId = bootId;
    if (message !== undefined)
        entry.message = message;
    if (priority !== undefined)
        entry.priority = priority;
    if (transport !== undefined)
        entry.transport = transport;
    if (identifier !== undefined)
        entry.identifier = identifier;
    if (pid !== undefined)
        entry.pid = pid;
    if (comm !== undefined)
        entry.comm = comm;
    if (unit !== undefined)
        entry.unit = unit;
    if (messageId !== undefined)
        entry.messageId = messageId;

    return entry;
}

export { isKernelOriginated };

function optionalMessage(value: unknown): string | undefined {
    if (typeof value !== "string")
        return undefined;
    const text = value.trim();
    return text === "" ? undefined : text;
}

function optionalString(value: unknown): string | undefined {
    if (typeof value === "string") {
        const text = value.trim();
        return text === "" ? undefined : text;
    }
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    return undefined;
}

function optionalMessageId(value: unknown): string | undefined {
    const text = optionalString(value);
    return text === undefined ? undefined : text.toLowerCase();
}

function optionalPriority(value: unknown): number | undefined {
    const n = asFiniteNumber(value);
    if (n === undefined || !Number.isInteger(n) || n < 0 || n > 7)
        return undefined;
    return n;
}

function optionalPid(value: unknown): number | undefined {
    const n = asFiniteNumber(value);
    if (n === undefined || !Number.isInteger(n) || n < 0)
        return undefined;
    return n;
}

function optionalMicroseconds(value: unknown): number | undefined {
    if (typeof value === "string" && /^\d+$/.test(value)) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    const n = asFiniteNumber(value);
    if (n === undefined || n <= 0)
        return undefined;
    return Math.round(n);
}

function asFiniteNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

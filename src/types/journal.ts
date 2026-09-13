/**
 * Normalized journal entry. Field names here are not journalctl JSON keys.
 * React components must consume DiagnosticFinding, not this type.
 */
export interface JournalEntry {
    cursor?: string;
    realtimeUs?: number;
    bootId?: string;
    message?: string;
    priority?: number;
    transport?: string;
    identifier?: string;
    pid?: number;
    comm?: string;
    unit?: string;
    messageId?: string;
}

export const JOURNAL_PRIORITY_NAMES = [
    "emerg",
    "alert",
    "crit",
    "err",
    "warning",
    "notice",
    "info",
    "debug",
] as const;

export type JournalPriorityName = (typeof JOURNAL_PRIORITY_NAMES)[number];

export function journalPriorityName(priority?: number): JournalPriorityName | undefined {
    if (priority === undefined || priority < 0 || priority > 7)
        return undefined;
    return JOURNAL_PRIORITY_NAMES[priority];
}

export function isKernelOriginated(entry: JournalEntry): boolean {
    return entry.transport === "kernel" || entry.identifier === "kernel";
}

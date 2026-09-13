import { parseFailed } from "../utils/errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COMPACT_RE = /^[0-9a-f]{32}$/;

/**
 * Normalize a kernel/journal boot ID to 32 lowercase hex digits.
 *
 * Accepts only the two systemd representations:
 * canonical UUID (8-4-4-4-12) and compact 32-hex. Does not strip hyphens
 * from arbitrary strings or extract a substring of hex characters.
 */
export function parseBootId(raw: string): string {
    const trimmed = raw.replace(/^\uFEFF/, "")
            .trim()
            .toLowerCase();
    let hex: string | undefined;
    if (UUID_RE.test(trimmed))
        hex = trimmed.replace(/-/g, "");
    else if (COMPACT_RE.test(trimmed))
        hex = trimmed;
    if (hex === undefined)
        throw parseFailed("The current boot ID could not be parsed.", "boot-id");
    return hex;
}

/** journal/coredumpctl match using the compact `_BOOT_ID` form. */
export function bootIdMatch(bootId: string): string {
    return "_BOOT_ID=" + bootId;
}

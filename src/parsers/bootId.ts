import { parseFailed } from "../utils/errors";

/** Kernel boot ID as a 32-character lowercase hex string (journal `_BOOT_ID`). */
export function parseBootId(raw: string): string {
    const hex = raw.trim()
            .toLowerCase()
            .replace(/-/g, "");
    if (!/^[0-9a-f]{32}$/.test(hex))
        throw parseFailed("The current boot ID could not be parsed.", "boot-id");
    return hex;
}

export function bootIdMatch(bootId: string): string {
    return "_BOOT_ID=" + bootId;
}

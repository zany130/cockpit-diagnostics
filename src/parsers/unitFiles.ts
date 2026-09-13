import type { InstalledUnitFile } from "../types/verify";
import { parseFailed } from "../utils/errors";
import { stripAnsi } from "../utils/ansi";

const UNIT_NAME_RE = /^[A-Za-z0-9_.@\\-]+\.[A-Za-z][A-Za-z0-9-]*$/;

export function parseUnitFilesPlain(output: string): InstalledUnitFile[] {
    const files: InstalledUnitFile[] = [];
    for (const raw of stripAnsi(output).split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "" || /^unit file\b/i.test(line) || line.startsWith("UNIT"))
            continue;
        const match = line.match(/^(\S+)\s+(\S+)(?:\s+\S+)?$/);
        if (!match)
            continue;
        const unit = basenameUnit(match[1]);
        if (!UNIT_NAME_RE.test(unit))
            continue;
        const item: InstalledUnitFile = { unit };
        if (match[2] && match[2] !== "-")
            item.state = match[2];
        files.push(item);
    }
    return uniqueUnits(files);
}

export function unitFilesFromDbusCall(result: unknown): InstalledUnitFile[] {
    if (!Array.isArray(result))
        throw parseFailed("systemd ListUnitFiles did not return an array.", "systemctl");
    const tuples = result.length === 1 && Array.isArray(result[0]) ? result[0] : result;
    const files: InstalledUnitFile[] = [];
    for (const entry of tuples) {
        if (!Array.isArray(entry) || entry.length < 1)
            continue;
        const unit = basenameUnit(String(entry[0] ?? ""));
        if (!UNIT_NAME_RE.test(unit))
            continue;
        const item: InstalledUnitFile = { unit };
        const state = String(entry[1] ?? "");
        if (state)
            item.state = state;
        files.push(item);
    }
    return uniqueUnits(files);
}

function basenameUnit(value: string): string {
    const trimmed = value.trim();
    if (!trimmed.includes("/"))
        return trimmed;
    return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}

function uniqueUnits(files: InstalledUnitFile[]): InstalledUnitFile[] {
    const seen = new Set<string>();
    const unique: InstalledUnitFile[] = [];
    for (const file of files) {
        if (seen.has(file.unit))
            continue;
        seen.add(file.unit);
        unique.push(file);
    }
    return unique;
}

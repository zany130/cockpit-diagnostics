import type { FailedUnit } from "../types/diagnostics";
import { parseFailed } from "../utils/errors";
import { stripAnsi } from "../utils/ansi";

export type SystemdListUnitTuple = [
    string, // name
    string, // description
    string, // load state
    string, // active state
    string, // sub state
    string, // following
    string, // object path
    number, // job id
    string, // job type
    string, // job path
];

const UNIT_NAME_RE = /^[A-Za-z0-9:_.\\@-]+\.[A-Za-z][A-Za-z0-9-]*$/;

export function parseFailedUnits(output: string): FailedUnit[] {
    const text = output.trim();
    if (text === "")
        return [];

    if (text.startsWith("[") || text.startsWith("{"))
        return parseFailedUnitsJson(text);

    return parseFailedUnitsPlain(text);
}

/**
 * Accept either the D-Bus out-args array (`[tuples]`) or the tuples array
 * itself so a Cockpit call-shape mismatch cannot throw in React.
 */
export function unitsFromDbusCall(result: unknown): FailedUnit[] {
    if (!Array.isArray(result))
        throw parseFailed("systemd ListUnits did not return an array.", "failed-units");
    if (result.length === 1 && Array.isArray(result[0])) {
        const only = result[0];
        if (only.length === 0 || Array.isArray(only[0]))
            return unitsFromDbusTuples(only);
    }
    return unitsFromDbusTuples(result);
}

export function unitsFromDbusTuples(tuples: unknown): FailedUnit[] {
    if (!Array.isArray(tuples))
        throw parseFailed("systemd ListUnits did not return an array.", "failed-units");

    const units: FailedUnit[] = [];
    for (const entry of tuples) {
        if (!Array.isArray(entry) || entry.length < 5)
            continue;
        const unit = String(entry[0] ?? "");
        const description = String(entry[1] ?? "");
        const loadState = String(entry[2] ?? "");
        const activeState = String(entry[3] ?? "");
        const subState = String(entry[4] ?? "");
        if (!unit)
            continue;
        if (activeState !== "failed")
            continue;
        const item: FailedUnit = { unit, activeState };
        if (description)
            item.description = description;
        if (loadState)
            item.loadState = loadState;
        if (subState)
            item.subState = subState;
        units.push(item);
    }
    return units;
}

function parseFailedUnitsJson(text: string): FailedUnit[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw parseFailed("systemctl JSON output for failed units was malformed.", "failed-units");
    }

    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const units: FailedUnit[] = [];
    for (const row of rows) {
        if (typeof row !== "object" || row === null)
            continue;
        const record = row as Record<string, unknown>;
        const unit = stringField(record, ["unit", "unit_file", "id"]);
        if (!unit)
            continue;
        const item: FailedUnit = { unit };
        const loadState = stringField(record, ["load", "loadState"]);
        const activeState = stringField(record, ["active", "activeState"]);
        const subState = stringField(record, ["sub", "subState"]);
        const description = stringField(record, ["description"]);
        if (activeState && activeState !== "failed")
            continue;
        if (loadState)
            item.loadState = loadState;
        if (activeState)
            item.activeState = activeState;
        if (subState)
            item.subState = subState;
        if (description)
            item.description = description;
        units.push(item);
    }
    return units;
}

function parseFailedUnitsPlain(text: string): FailedUnit[] {
    const units: FailedUnit[] = [];
    let sawCandidate = false;

    for (const raw of text.split(/\r?\n/)) {
        let line = stripAnsi(raw).trim();
        if (line === "" || isListUnitsChrome(line))
            continue;
        line = line.replace(/^[●○*]\s+/, "");
        const parsed = parseFailedUnitLine(line);
        if (parsed === null) {
            sawCandidate = true;
            continue;
        }
        units.push(parsed);
    }

    if (units.length === 0 && sawCandidate)
        throw parseFailed("systemctl failed-unit output could not be parsed.", "failed-units");

    return units;
}

function parseFailedUnitLine(line: string): FailedUnit | null {
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!match)
        return null;
    if (!UNIT_NAME_RE.test(match[1]))
        return null;

    const item: FailedUnit = {
        unit: match[1],
        loadState: match[2],
        activeState: match[3],
        subState: match[4],
    };
    const description = match[5].trim();
    if (description)
        item.description = description;
    return item;
}

function isListUnitsChrome(line: string): boolean {
    if (/^UNIT(\s|$)/i.test(line))
        return true;
    if (/^(LOAD|ACTIVE|SUB)\s*=/.test(line))
        return true;
    if (/^Legend:/i.test(line))
        return true;
    if (/loaded units listed/i.test(line) || /unit files listed/i.test(line))
        return true;
    if (/^To show all /i.test(line))
        return true;
    return false;
}

function stringField(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.trim() !== "")
            return value;
    }
    return undefined;
}

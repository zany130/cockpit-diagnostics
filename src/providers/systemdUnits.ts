import type { FailedUnit } from "../types/diagnostics";
import { ProviderError } from "../types/providers";
import { parseFailedUnits, unitsFromDbusTuples } from "../parsers/failedUnits";
import { parseUnitShow } from "../parsers/unitShow";
import { dbusCall, runCommand } from "./command";

const UNITS_TIMEOUT_MS = 20_000;

export async function loadFailedUnits(): Promise<FailedUnit[]> {
    let units: FailedUnit[];
    try {
        units = await listFailedUnitsDbus();
    } catch (dbusError) {
        try {
            units = await listFailedUnitsSystemctl();
        } catch (systemctlError) {
            throw systemctlError instanceof ProviderError ? systemctlError : dbusError;
        }
    }

    return enrichFailedUnits(units);
}

async function listFailedUnitsDbus(): Promise<FailedUnit[]> {
    try {
        const result = await dbusCall(
            "org.freedesktop.systemd1",
            "/org/freedesktop/systemd1",
            "org.freedesktop.systemd1.Manager",
            "ListUnitsFiltered",
            [["failed"]],
            { timeoutMs: UNITS_TIMEOUT_MS }
        );
        return unitsFromDbusTuples(result[0]);
    } catch {
        const result = await dbusCall(
            "org.freedesktop.systemd1",
            "/org/freedesktop/systemd1",
            "org.freedesktop.systemd1.Manager",
            "ListUnits",
            [],
            { timeoutMs: UNITS_TIMEOUT_MS }
        );
        return unitsFromDbusTuples(result[0]);
    }
}

async function listFailedUnitsSystemctl(): Promise<FailedUnit[]> {
    const output = await runCommand(
        [
            "systemctl",
            "--system",
            "--no-pager",
            "--no-ask-password",
            "list-units",
            "--state=failed",
            "--plain",
            "--no-legend",
            "--full",
        ],
        { timeoutMs: UNITS_TIMEOUT_MS }
    );
    return parseFailedUnits(output);
}

async function enrichFailedUnits(units: FailedUnit[]): Promise<FailedUnit[]> {
    if (units.length === 0)
        return units;

    try {
        const output = await runCommand(
            [
                "systemctl",
                "--system",
                "--no-pager",
                "--no-ask-password",
                "show",
                "--property=Id,Result,ExecMainStatus,InactiveEnterTimestamp",
                ...units.map(unit => unit.unit),
            ],
            { timeoutMs: UNITS_TIMEOUT_MS }
        );
        const extras = parseUnitShow(output);
        return units.map(unit => {
            const extra = extras.get(unit.unit);
            if (!extra)
                return unit;
            return { ...unit, ...extra };
        });
    } catch {
        return units;
    }
}

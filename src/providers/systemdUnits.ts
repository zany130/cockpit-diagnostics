import type { FailedUnit } from "../types/diagnostics";
import { ProviderError } from "../types/providers";
import { parseFailedUnits, unitsFromDbusCall } from "../parsers/failedUnits";
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
        return unitsFromDbusCall(result);
    } catch {
        const result = await dbusCall(
            "org.freedesktop.systemd1",
            "/org/freedesktop/systemd1",
            "org.freedesktop.systemd1.Manager",
            "ListUnits",
            [],
            { timeoutMs: UNITS_TIMEOUT_MS }
        );
        return unitsFromDbusCall(result);
    }
}

async function listFailedUnitsSystemctl(): Promise<FailedUnit[]> {
    const withPlain = [
        "systemctl",
        "--system",
        "--no-pager",
        "--no-ask-password",
        "list-units",
        "--state=failed",
        "--plain",
        "--no-legend",
        "--full",
    ];
    const withoutPlain = [
        "systemctl",
        "--system",
        "--no-pager",
        "--no-ask-password",
        "list-units",
        "--state=failed",
        "--no-legend",
        "--full",
    ];

    try {
        return parseFailedUnits(await runCommand(withPlain, { timeoutMs: UNITS_TIMEOUT_MS }));
    } catch (error) {
        if (!isInvalidOption(error))
            throw error;
        return parseFailedUnits(await runCommand(withoutPlain, { timeoutMs: UNITS_TIMEOUT_MS }));
    }
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

function isInvalidOption(error: unknown): boolean {
    if (!(error instanceof ProviderError))
        return false;
    const text = error.message.toLowerCase();
    return /unrecognized option|invalid option|unknown option/.test(text);
}

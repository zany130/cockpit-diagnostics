import { ProviderError } from "../types/providers";
import type { InstalledUnitFile, VerificationResult } from "../types/verify";
import { parseUnitFilesPlain, unitFilesFromDbusCall } from "../parsers/unitFiles";
import { parseVerifyOutput } from "../parsers/verify";
import { normalizeSpawnError } from "../utils/errors";
import { dbusCall, runCommand } from "./command";

const LIST_TIMEOUT_MS = 20_000;
const VERIFY_TIMEOUT_MS = 25_000;
const UNIT_NAME_RE = /^[A-Za-z0-9_.@\\-]+\.[A-Za-z][A-Za-z0-9-]*$/;

export async function loadInstalledUnitFiles(): Promise<InstalledUnitFile[]> {
    try {
        return await listUnitFilesDbus();
    } catch (dbusError) {
        try {
            return await listUnitFilesSystemctl();
        } catch (systemctlError) {
            throw systemctlError instanceof ProviderError ? systemctlError : dbusError;
        }
    }
}

export async function verifyUnit(unit: string): Promise<VerificationResult> {
    assertVerifyUnit(unit);
    const output = await runCommand(
        ["systemd-analyze", "--system", "--no-pager", "--man=no", "verify", unit],
        { timeoutMs: VERIFY_TIMEOUT_MS, err: "out", outputOnFailure: true }
    );
    if (isVerifyInvocationError(output))
        throw normalizeSpawnError({ message: output, exit_status: 1 }, "systemd-analyze");
    return parseVerifyOutput(output, unit);
}

function isVerifyInvocationError(output: string): boolean {
    const lower = output.toLowerCase();
    return lower.includes("unknown command") ||
            lower.includes("invalid option") ||
            lower.includes("unrecognized option") ||
            lower.includes("too few arguments");
}

function assertVerifyUnit(unit: string): void {
    if (!UNIT_NAME_RE.test(unit) || unit.startsWith("-") || unit.includes("/") || unit.includes(":")) {
        throw new ProviderError(
            "not-supported",
            "Unsupported unit name for systemd-analyze verify.",
            { source: "systemd-analyze" }
        );
    }
}

async function listUnitFilesDbus(): Promise<InstalledUnitFile[]> {
    const result = await dbusCall(
        "org.freedesktop.systemd1",
        "/org/freedesktop/systemd1",
        "org.freedesktop.systemd1.Manager",
        "ListUnitFiles",
        [],
        { timeoutMs: LIST_TIMEOUT_MS }
    );
    return unitFilesFromDbusCall(result);
}

async function listUnitFilesSystemctl(): Promise<InstalledUnitFile[]> {
    const withPlain = [
        "systemctl",
        "--system",
        "--no-pager",
        "--no-ask-password",
        "list-unit-files",
        "--plain",
        "--no-legend",
        "--full",
    ];
    const withoutPlain = [
        "systemctl",
        "--system",
        "--no-pager",
        "--no-ask-password",
        "list-unit-files",
        "--no-legend",
        "--full",
    ];
    try {
        return parseUnitFilesPlain(await runCommand(withPlain, { timeoutMs: LIST_TIMEOUT_MS }));
    } catch (error) {
        if (!(error instanceof ProviderError))
            throw error;
        const text = error.message.toLowerCase();
        if (!/unrecognized option|invalid option|unknown option/.test(text))
            throw error;
        return parseUnitFilesPlain(await runCommand(withoutPlain, { timeoutMs: LIST_TIMEOUT_MS }));
    }
}

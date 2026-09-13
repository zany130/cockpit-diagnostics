import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import { loadInstalledUnitFiles, verifyUnit } from "../../src/providers/verify";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk } from "../helpers/spawn";

function lastCall() {
    const calls = vi.mocked(cockpit.spawn).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
}

describe("systemd-analyze verify provider", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
        vi.spyOn(cockpit, "dbus").mockReturnValue({
            call: async () => {
                throw Object.assign(new Error("no dbus"), { problem: "not-supported" });
            },
            close() {},
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("lists installed unit files through D-Bus when available", async () => {
        vi.mocked(cockpit.dbus).mockReturnValue({
            call: async () => [[["foo.service", "enabled"], ["warn.service", "static"]]],
            close() {},
        });
        const files = await loadInstalledUnitFiles();
        expect(files).toEqual([
            { unit: "foo.service", state: "enabled" },
            { unit: "warn.service", state: "static" },
        ]);
        expect(vi.mocked(cockpit.spawn)).not.toHaveBeenCalled();
    });

    it("lists installed unit files through systemctl argv when D-Bus is unavailable", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("unit-files-plain.txt")));
        const files = await loadInstalledUnitFiles();
        expect(files.some(file => file.unit === "foo.service")).toBe(true);
        expect(lastCall()[0]).toEqual([
            "systemctl",
            "--system",
            "--no-pager",
            "--no-ask-password",
            "list-unit-files",
            "--plain",
            "--no-legend",
            "--full",
        ]);
    });

    it("verifies an installed unit name as a separate argv entry", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("verify-warning.txt")));
        const result = await verifyUnit("warn.service");
        expect(result.requestedUnit).toBe("warn.service");
        expect(result.findings[0].severity).toBe("warning");
        expect(lastCall()[0]).toEqual([
            "systemd-analyze",
            "--system",
            "--no-pager",
            "--man=no",
            "verify",
            "warn.service",
        ]);
        expect(lastCall()[1]?.err).toBe("out");
        expect(lastCall()[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
        expect(lastCall()[1]?.superuser).toBeUndefined();
        expect(lastCall()[0]).not.toContain("--user");
        expect(lastCall()[0][5]).toBe("warn.service");
    });

    it("parses findings when verify exits non-zero", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", fixture("verify-error.txt"), { exit_status: 1 })
        );
        const result = await verifyUnit("demo.service");
        expect(result.findings.some(item => item.severity === "error")).toBe(true);
    });

    it("parses a missing installed unit from verify output", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("verify-not-found.txt")));
        const result = await verifyUnit("nosuch.service");
        expect(result.findings[0]).toMatchObject({
            severity: "error",
            unit: "nosuch.service",
            message: "Unit nosuch.service not found.",
        });
        expect(lastCall()[0][5]).toBe("nosuch.service");
    });

    it("does not spawn for a path or option-like unit name", async () => {
        await expect(verifyUnit("")).rejects.toMatchObject({ kind: "not-supported" });
        await expect(verifyUnit("/etc/systemd/system/foo.service")).rejects.toMatchObject({ kind: "not-supported" });
        await expect(verifyUnit("--root=/tmp")).rejects.toMatchObject({ kind: "not-supported" });
        await expect(verifyUnit("foo:bar.service")).rejects.toMatchObject({ kind: "not-supported" });
        expect(vi.mocked(cockpit.spawn)).not.toHaveBeenCalled();
    });

    it("surfaces a missing executable", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("not-found", "systemd-analyze: not found"));
        await expect(verifyUnit("foo.service")).rejects.toMatchObject({ kind: "not-found" });
    });

    it("surfaces an unavailable verify subcommand", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", "Unknown command verb 'verify'.", { exit_status: 1 })
        );
        await expect(verifyUnit("foo.service")).rejects.toMatchObject({ kind: "not-supported" });
    });

    it("surfaces a permission failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("access-denied", "Permission denied"));
        await expect(verifyUnit("foo.service")).rejects.toMatchObject({ kind: "permission-denied" });
    });

    it("surfaces a timeout", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("timeout", "terminated"));
        await expect(verifyUnit("foo.service")).rejects.toMatchObject({ kind: "timeout" });
        await expect(verifyUnit("foo.service")).rejects.toBeInstanceOf(ProviderError);
    });
});

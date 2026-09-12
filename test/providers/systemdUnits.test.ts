import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import { loadFailedUnits } from "../../src/providers/systemdUnits";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk } from "../helpers/spawn";

const failedTuples = [
    ["foo.service", "Foo Service", "loaded", "failed", "failed", "", "/org/foo", 0, "", ""],
    ["ok.service", "Ok", "loaded", "active", "running", "", "/org/ok", 0, "", ""],
];

describe("failed-unit providers", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
        vi.spyOn(cockpit, "dbus");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses ListUnitsFiltered then enriches with systemctl show", async () => {
        vi.mocked(cockpit.dbus).mockImplementation(() => ({
            call: async (_path, _iface, method) => {
                if (method === "ListUnitsFiltered")
                    return [failedTuples];
                throw new Error("unexpected D-Bus method " + method);
            },
            close() {},
        }));
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv.includes("show"))
                return spawnOk(fixture("unit-show-normal.txt"));
            return spawnFail("not-found", "unexpected spawn " + argv.join(" "));
        });

        const units = await loadFailedUnits();
        expect(units.map(unit => unit.unit)).toEqual(["foo.service"]);
        expect(units[0].result).toBe("exit-code");
        expect(vi.mocked(cockpit.spawn).mock.calls[0][0].slice(0, 6)).toEqual([
            "systemctl",
            "--system",
            "--no-pager",
            "--no-ask-password",
            "show",
            "--property=Id,Result,ExecMainStatus,InactiveEnterTimestamp",
        ]);
        expect(vi.mocked(cockpit.spawn).mock.calls[0][1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
    });

    it("falls back to ListUnits when ListUnitsFiltered is missing", async () => {
        vi.mocked(cockpit.dbus).mockImplementation(() => ({
            call: async (_path, _iface, method) => {
                if (method === "ListUnitsFiltered")
                    throw Object.assign(new Error("Unknown method 'ListUnitsFiltered'"), { problem: "not-supported" });
                if (method === "ListUnits")
                    return [failedTuples];
                throw new Error("unexpected D-Bus method " + method);
            },
            close() {},
        }));
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("unit-show-normal.txt")));

        const units = await loadFailedUnits();
        expect(units.map(unit => unit.unit)).toEqual(["foo.service"]);
    });

    it("falls back to systemctl when D-Bus is unavailable", async () => {
        vi.mocked(cockpit.dbus).mockImplementation(() => ({
            call: async () => {
                throw Object.assign(new Error("not mocked"), { problem: "not-found" });
            },
            close() {},
        }));
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv.includes("list-units"))
                return spawnOk(fixture("failed-units-plain.txt"));
            if (argv.includes("show"))
                return spawnOk(fixture("unit-show-normal.txt"));
            return spawnFail("not-found", argv.join(" "));
        });

        const units = await loadFailedUnits();
        expect(units.map(unit => unit.unit)).toEqual(["foo.service", "bar.mount"]);
        expect(units[0].result).toBe("exit-code");
        const listCall = vi.mocked(cockpit.spawn).mock.calls.find(call => call[0].includes("list-units"));
        expect(listCall?.[0]).toEqual([
            "systemctl",
            "--system",
            "--no-pager",
            "--no-ask-password",
            "list-units",
            "--state=failed",
            "--plain",
            "--no-legend",
            "--full",
        ]);
        expect(listCall?.[1]?.environ).toEqual(expect.arrayContaining(["LC_ALL=C", "SYSTEMD_PAGER="]));
    });

    it("retries systemctl without --plain when the option is unknown", async () => {
        vi.mocked(cockpit.dbus).mockImplementation(() => ({
            call: async () => {
                throw Object.assign(new Error("D-Bus unavailable"), { problem: "not-found" });
            },
            close() {},
        }));
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv.includes("--plain"))
                return spawnFail("not-supported", "systemctl: unrecognized option '--plain'");
            if (argv.includes("list-units"))
                return spawnOk(fixture("failed-units-header.txt"));
            if (argv.includes("show"))
                return spawnFail("access-denied", "Permission denied");
            return spawnFail("not-found", argv.join(" "));
        });

        const units = await loadFailedUnits();
        expect(units.map(unit => unit.unit)).toEqual(["foo.service", "user@1000.service"]);
        expect(units[0].result).toBeUndefined();
        const listCalls = vi.mocked(cockpit.spawn).mock.calls.filter(call => call[0].includes("list-units"));
        expect(listCalls[1][0]).not.toContain("--plain");
        expect(listCalls[1][0]).toContain("--no-legend");
    });

    it("surfaces a missing systemctl executable on the command fallback", async () => {
        vi.mocked(cockpit.dbus).mockImplementation(() => ({
            call: async () => {
                throw Object.assign(new Error("D-Bus unavailable"), { problem: "not-found" });
            },
            close() {},
        }));
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("not-found", "systemctl: not found"));
        await expect(loadFailedUnits()).rejects.toMatchObject({ kind: "not-found" });
    });
});

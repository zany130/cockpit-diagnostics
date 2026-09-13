import { afterEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { jumpToLogs, jumpToService, jumpToServices, jumpToUnitLogs, literalLogsGrep, logsPath, serviceUnitPath, unitLogsPath } from "../../src/utils/cockpitLinks";

function assertLogsJump(route: string, encodedUnit: string) {
    expect(route).toBe(`/system/logs#?service=${encodedUnit}&start=boot&prio=*`);
    expect(route.startsWith("/system/logs")).toBe(true);
    expect(route).toContain(`service=${encodedUnit}`);
    expect(route).toContain("start=boot");
    expect(route).toContain("prio=*");
    expect(route).not.toContain(".html");
}

describe("cockpitLinks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("keeps template-instance @ characters in the undocumented Services unit hash", () => {
        expect(serviceUnitPath("user@1000.service")).toBe("/system/services#/user@1000.service");
        expect(serviceUnitPath("foo.service")).toBe("/system/services#/foo.service");
    });

    it("jumps to Logs with service, current-boot, and all-priority filters", () => {
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);

        jumpToUnitLogs("NetworkManager.service");
        expect(jump).toHaveBeenCalledTimes(1);
        assertLogsJump(String(jump.mock.calls[0][0]), "NetworkManager.service");
        expect(jump).toHaveBeenCalledWith("/system/logs#?service=NetworkManager.service&start=boot&prio=*");
    });

    it("encodes @ in the Logs service filter while leaving prio=* intact", () => {
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);

        jumpToUnitLogs("user@1000.service");
        expect(jump).toHaveBeenCalledTimes(1);
        assertLogsJump(String(jump.mock.calls[0][0]), "user%401000.service");
        expect(jump).toHaveBeenCalledWith("/system/logs#?service=user%401000.service&start=boot&prio=*");
        expect(String(jump.mock.calls[0][0])).toContain("prio=*");
        expect(String(jump.mock.calls[0][0])).not.toContain("prio=%2A");
    });

    it("keeps unitLogsPath aligned with the shell jump route", () => {
        expect(unitLogsPath("foo.service")).toBe("/system/logs#?service=foo.service&start=boot&prio=*");
        expect(unitLogsPath("foo.service")).not.toContain(".html");
    });

    it("jumps through the helper rather than embedding hashes in components", () => {
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);
        jumpToService("user@1000.service");
        jumpToUnitLogs("foo.service");
        jumpToServices();
        expect(jump.mock.calls.map(call => call[0])).toEqual([
            "/system/services#/user@1000.service",
            "/system/logs#?service=foo.service&start=boot&prio=*",
            "/system/services",
        ]);
        expect(String(jump.mock.calls[1][0])).not.toContain(".html");
        expect(String(jump.mock.calls[1][0])).toContain("prio=*");
    });

    it("builds documented Logs filters for findings without encoding prio=*", () => {
        expect(logsPath({ tag: "kernel", start: "boot", prio: "err" }))
                .toBe("/system/logs#?tag=kernel&start=boot&prio=err");
        expect(logsPath({ tag: "kernel", start: "boot", prio: "err", grep: "Killed process" }))
                .toBe("/system/logs#?tag=kernel&grep=Killed%20process&start=boot&prio=err");
        expect(logsPath({ service: "systemd-oomd.service", start: "boot", prio: "*" }))
                .toBe("/system/logs#?service=systemd-oomd.service&start=boot&prio=*");
        expect(logsPath({ start: "boot" })).toContain("prio=*");
        expect(logsPath({ start: "boot" })).not.toContain("prio=%2A");
        expect(literalLogsGrep("Killed process")).toBe("Killed process");
        expect(literalLogsGrep("amdgpu: [gfxhub] page fault")).toBeUndefined();
        expect(literalLogsGrep("a".repeat(81))).toBeUndefined();

        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);
        jumpToLogs({ tag: "kernel", start: "boot", prio: "err" });
        expect(jump).toHaveBeenCalledWith("/system/logs#?tag=kernel&start=boot&prio=err");
    });
});

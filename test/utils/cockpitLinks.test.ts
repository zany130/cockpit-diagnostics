import { afterEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { jumpToService, jumpToServices, jumpToUnitLogs, serviceUnitPath, unitLogsPath } from "../../src/utils/cockpitLinks";

describe("cockpitLinks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("keeps template-instance @ characters in the undocumented Services unit hash", () => {
        expect(serviceUnitPath("user@1000.service")).toBe("/system/services#/user@1000.service");
        expect(serviceUnitPath("foo.service")).toBe("/system/services#/foo.service");
    });

    it("uses documented Logs filters for the current boot and service", () => {
        expect(unitLogsPath("foo.service")).toBe("/system/logs.html#?service=foo.service&start=boot");
        expect(unitLogsPath("user@1000.service")).toBe("/system/logs.html#?service=user%401000.service&start=boot");
    });

    it("jumps through the helper rather than embedding hashes in components", () => {
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);
        jumpToService("user@1000.service");
        jumpToUnitLogs("foo.service");
        jumpToServices();
        expect(jump.mock.calls.map(call => call[0])).toEqual([
            "/system/services#/user@1000.service",
            "/system/logs.html#?service=foo.service&start=boot",
            "/system/services",
        ]);
    });
});

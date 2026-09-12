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

    it("jumps to the Logs shell component with documented service and boot filters", () => {
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);

        jumpToUnitLogs("foo.service");
        expect(jump).toHaveBeenCalledTimes(1);
        expect(jump).toHaveBeenCalledWith("/system/logs#?service=foo.service&start=boot");

        const logsRoute = String(jump.mock.calls[0][0]);
        expect(logsRoute.startsWith("/system/logs#")).toBe(true);
        expect(logsRoute).not.toContain(".html");
        expect(logsRoute).toContain("service=foo.service");
        expect(logsRoute).toContain("start=boot");
    });

    it("encodes template-instance @ characters in the Logs service filter", () => {
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);

        jumpToUnitLogs("user@1000.service");
        expect(jump).toHaveBeenCalledWith("/system/logs#?service=user%401000.service&start=boot");

        const logsRoute = String(jump.mock.calls[0][0]);
        expect(logsRoute).not.toContain(".html");
        expect(logsRoute).toContain("service=user%401000.service");
    });

    it("keeps unitLogsPath aligned with the shell jump route", () => {
        expect(unitLogsPath("foo.service")).toBe("/system/logs#?service=foo.service&start=boot");
        expect(unitLogsPath("foo.service")).not.toContain(".html");
    });

    it("jumps through the helper rather than embedding hashes in components", () => {
        const jump = vi.spyOn(cockpit, "jump").mockImplementation(() => undefined);
        jumpToService("user@1000.service");
        jumpToUnitLogs("foo.service");
        jumpToServices();
        expect(jump.mock.calls.map(call => call[0])).toEqual([
            "/system/services#/user@1000.service",
            "/system/logs#?service=foo.service&start=boot",
            "/system/services",
        ]);
        expect(String(jump.mock.calls[1][0])).not.toContain(".html");
    });
});

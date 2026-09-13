import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import { loadSecurityDetails, loadSecuritySummaries } from "../../src/providers/security";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk, spawnOkStreamConsumed } from "../helpers/spawn";

function lastCall() {
    const calls = vi.mocked(cockpit.spawn).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
}

describe("systemd-analyze security provider", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("requests JSON for all loaded system services with argv", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("security-list-normal.txt")));
        const rows = await loadSecuritySummaries();
        expect(rows).toHaveLength(4);
        expect(lastCall()[0]).toEqual([
            "systemd-analyze",
            "--system",
            "--no-pager",
            "--json=short",
            "security",
        ]);
        expect(lastCall()[0].some(arg => arg.includes(" "))).toBe(false);
        expect(lastCall()[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
        expect(lastCall()[1]?.superuser).toBeUndefined();
        expect(lastCall()[0]).not.toContain("--user");
        expect(lastCall()[0]).not.toContain("--offline=yes");
    });

    it("still parses security JSON when spawn uses Cockpit stream consumption", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOkStreamConsumed(fixture("security-list-normal.txt")));
        const rows = await loadSecuritySummaries();
        expect(rows).toHaveLength(4);
        expect(rows[0]?.unit).toBe("systemd-journald.service");
    });

    it("requests JSON for one unit as a separate argv entry", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("security-detail-normal.txt")));
        const detail = await loadSecurityDetails("user@1000.service");
        expect(detail.unit).toBe("user@1000.service");
        expect(detail.checks.length).toBeGreaterThan(0);
        expect(lastCall()[0]).toEqual([
            "systemd-analyze",
            "--system",
            "--no-pager",
            "--json=short",
            "security",
            "user@1000.service",
        ]);
        expect(lastCall()[0][5]).toBe("user@1000.service");
    });

    it("does not spawn for an empty or option-like unit name", async () => {
        await expect(loadSecurityDetails("")).rejects.toMatchObject({ kind: "not-supported" });
        await expect(loadSecurityDetails("--offline=yes")).rejects.toMatchObject({ kind: "not-supported" });
        await expect(loadSecurityDetails("/etc/systemd/system/foo.service")).rejects.toMatchObject({ kind: "not-supported" });
        expect(vi.mocked(cockpit.spawn)).not.toHaveBeenCalled();
    });

    it("surfaces a missing executable", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("not-found", "systemd-analyze: not found"));
        await expect(loadSecuritySummaries()).rejects.toMatchObject({ kind: "not-found" });
    });

    it("surfaces an unavailable security subcommand", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", "Unknown command verb 'security'.", { exit_status: 1 })
        );
        await expect(loadSecuritySummaries()).rejects.toMatchObject({ kind: "not-supported" });
    });

    it("surfaces a permission failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("access-denied", "Permission denied"));
        await expect(loadSecuritySummaries()).rejects.toMatchObject({ kind: "permission-denied" });
    });

    it("surfaces a command failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", "Unit foo.socket is not a service unit, refusing.", { exit_status: 1 })
        );
        await expect(loadSecurityDetails("foo.socket")).rejects.toBeInstanceOf(ProviderError);
    });

    it("surfaces a timeout", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("timeout", "terminated"));
        await expect(loadSecuritySummaries()).rejects.toMatchObject({ kind: "timeout" });
    });
});

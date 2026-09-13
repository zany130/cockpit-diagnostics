import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import { loadBlame, loadBootSummary, loadCriticalChain } from "../../src/providers/systemdAnalyze";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk, spawnOkStreamConsumed } from "../helpers/spawn";

function lastCall() {
    const calls = vi.mocked(cockpit.spawn).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
}

describe("systemd-analyze providers", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("invokes time with argv, --no-pager, and LC_ALL=C", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("boot-time-normal.txt")));
        const summary = await loadBootSummary();
        expect(summary.totalUs).toBe(69_608_000);
        expect(lastCall()[0]).toEqual(["systemd-analyze", "--system", "--no-pager", "time"]);
        expect(lastCall()[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
    });

    it("still parses boot timing when spawn uses Cockpit stream consumption", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOkStreamConsumed(fixture("boot-time-normal.txt")));
        const summary = await loadBootSummary();
        expect(summary.totalUs).toBe(69_608_000);
    });

    it("invokes blame without a shell string", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("blame-normal.txt")));
        const rows = await loadBlame();
        expect(rows[0].unit).toBe("NetworkManager.service");
        expect(lastCall()[0]).toEqual(["systemd-analyze", "--system", "--no-pager", "blame"]);
        expect(lastCall()[0].some(arg => arg.includes(" "))).toBe(false);
    });

    it("invokes critical-chain with --quiet and retries without it", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv.includes("--quiet"))
                return spawnFail("not-supported", "systemd-analyze: unrecognized option '--quiet'");
            return spawnOk(fixture("critical-chain-normal.txt"));
        });
        const tree = await loadCriticalChain();
        expect(tree[0].unit).toBe("graphical.target");
        const argvs = vi.mocked(cockpit.spawn).mock.calls.map(call => call[0]);
        expect(argvs[0]).toEqual(["systemd-analyze", "--quiet", "--system", "--no-pager", "critical-chain"]);
        expect(argvs[1]).toEqual(["systemd-analyze", "--system", "--no-pager", "critical-chain"]);
    });

    it("surfaces a missing executable", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("not-found", "systemd-analyze: not found"));
        await expect(loadBootSummary()).rejects.toMatchObject({ kind: "not-found" });
    });

    it("surfaces a permission failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("access-denied", "Permission denied"));
        await expect(loadBlame()).rejects.toMatchObject({ kind: "permission-denied" });
    });

    it("surfaces a command failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("", "Boot timing is not available", { exit_status: 1 }));
        await expect(loadBootSummary()).rejects.toBeInstanceOf(ProviderError);
    });
});

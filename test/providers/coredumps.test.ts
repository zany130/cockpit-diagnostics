import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import { loadCoredumpDetails, loadCoredumps } from "../../src/providers/coredumps";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk, spawnOkStreamConsumed } from "../helpers/spawn";

const BOOT_ID = "6580ca3716f24ca8981f1528242512c4";
/** Real-host kernel UUID from /proc/sys/kernel/random/boot_id on Bazzite. */
const REAL_HOST_UUID = "ddedc358-8083-492d-bf01-483937b16622";
const REAL_HOST_COMPACT = "ddedc3588083492dbf01483937b16622";

function lastCall() {
    const calls = vi.mocked(cockpit.spawn).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
}

describe("coredump providers", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("lists current-boot coredumps with JSON, argv, and a stable locale", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOk(fixture("boot-id.txt"));
            return spawnOk(fixture("coredump-list-multiple.txt"));
        });

        const rows = await loadCoredumps();
        expect(rows).toHaveLength(3);
        expect(rows[0].bootId).toBe(BOOT_ID);
        expect(lastCall()[0]).toEqual([
            "coredumpctl",
            "--no-pager",
            "--json=short",
            "list",
            "_BOOT_ID=" + BOOT_ID,
        ]);
        expect(lastCall()[0].some(arg => arg.includes(" "))).toBe(false);
        expect(lastCall()[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
        expect(lastCall()[1]?.superuser).toBeUndefined();
    });

    it("reads /proc boot_id, accepts a real-host UUID, and filters coredumpctl with compact _BOOT_ID", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOkStreamConsumed(REAL_HOST_UUID + "\n");
            return spawnOk(fixture("coredump-list-multiple.txt"));
        });

        const rows = await loadCoredumps();
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].bootId).toBe(REAL_HOST_COMPACT);

        const catCall = vi.mocked(cockpit.spawn).mock.calls.find(call => call[0][0] === "cat");
        expect(catCall?.[0]).toEqual(["cat", "/proc/sys/kernel/random/boot_id"]);
        expect(catCall?.[1]?.superuser).toBeUndefined();
        expect(catCall?.[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));

        expect(lastCall()[0]).toEqual([
            "coredumpctl",
            "--no-pager",
            "--json=short",
            "list",
            "_BOOT_ID=" + REAL_HOST_COMPACT,
        ]);
    });

    it("treats a compact /proc boot_id the same as the canonical UUID", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOk(REAL_HOST_COMPACT + "\n");
            return spawnOk(fixture("coredump-list-one.txt"));
        });
        const rows = await loadCoredumps();
        expect(rows[0].bootId).toBe(REAL_HOST_COMPACT);
        expect(lastCall()[0]).toContain("_BOOT_ID=" + REAL_HOST_COMPACT);
    });

    it("surfaces a controlled parse error for a malformed boot ID", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOk("not-a-boot-id\n");
            return spawnOk(fixture("coredump-list-one.txt"));
        });
        await expect(loadCoredumps()).rejects.toMatchObject({
            kind: "parse-failed",
            message: expect.stringMatching(/boot ID/),
        });
        const coredumpCalls = vi.mocked(cockpit.spawn).mock.calls.filter(call => call[0][0] === "coredumpctl");
        expect(coredumpCalls).toHaveLength(0);
    });

    it("treats the documented empty-list failure as zero coredumps", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOk(fixture("boot-id.txt"));
            return spawnFail("", "No coredumps found.", { exit_status: 1 });
        });
        await expect(loadCoredumps()).resolves.toEqual([]);
    });

    it("surfaces a missing executable", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOk(fixture("boot-id.txt"));
            return spawnFail("not-found", "coredumpctl: not found");
        });
        await expect(loadCoredumps()).rejects.toMatchObject({ kind: "not-found" });
    });

    it("surfaces a permission failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOk(fixture("boot-id.txt"));
            return spawnFail("", "No journal files were opened due to insufficient permissions.", { exit_status: 1 });
        });
        await expect(loadCoredumps()).rejects.toMatchObject({ kind: "permission-denied" });
    });

    it("surfaces a command failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "cat")
                return spawnOk(fixture("boot-id.txt"));
            return spawnFail("", "Failed to open journal: Connection refused", { exit_status: 1 });
        });
        await expect(loadCoredumps()).rejects.toBeInstanceOf(ProviderError);
    });

    it("loads details with journal matches rather than a shell string", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("coredump-info-normal.txt")));
        const listed = {
            id: "x",
            pid: 6654,
            bootId: BOOT_ID,
            executable: "/usr/bin/bash",
        };
        const detail = await loadCoredumpDetails(listed);
        expect(detail.unit).toBe("user@1000.service");
        expect(detail.command).toContain("kill -SEGV");
        expect(lastCall()[0]).toEqual([
            "coredumpctl",
            "--no-pager",
            "info",
            "COREDUMP_PID=6654",
            "_BOOT_ID=" + BOOT_ID,
        ]);
        expect(lastCall()[0].some(arg => arg.includes(" "))).toBe(false);
        expect(lastCall()[1]?.superuser).toBeUndefined();
    });
});

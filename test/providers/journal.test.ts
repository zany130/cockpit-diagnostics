import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import {
    CATALOG_LINE_LIMIT,
    KERNEL_OOM_LINE_LIMIT,
    KERNEL_PRIORITY_LINE_LIMIT,
    OOMD_LINE_LIMIT,
    isNoJournalMatches,
    loadFindings,
} from "../../src/providers/journal";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk, spawnOkStreamConsumed } from "../helpers/spawn";

function lastJournalCall() {
    const calls = vi.mocked(cockpit.spawn).mock.calls.filter(call => call[0][0] === "journalctl");
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
}

function journalCalls() {
    return vi.mocked(cockpit.spawn).mock.calls.filter(call => call[0][0] === "journalctl");
}

function isKernelPriorityQuery(argv: string[]): boolean {
    return argv.includes("--dmesg") && argv.some(arg => arg.startsWith("--priority="));
}

function isKernelOomQuery(argv: string[]): boolean {
    return argv.some(arg => arg.startsWith("--grep="));
}

function isOomdQuery(argv: string[]): boolean {
    return argv.some(arg => arg === "--unit=systemd-oomd.service");
}

function isCatalogQuery(argv: string[]): boolean {
    return argv.some(arg => arg.startsWith("MESSAGE_ID="));
}

describe("journal findings provider", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("requests structured current-boot JSON with argv and a stable locale", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (isKernelPriorityQuery(argv))
                return spawnOk(fixture("journal-kernel-err.txt"));
            if (isKernelOomQuery(argv))
                return spawnOk(fixture("journal-oom-kernel.txt"));
            if (isOomdQuery(argv))
                return spawnOk(fixture("journal-oom-oomd.txt"));
            if (isCatalogQuery(argv))
                return spawnOk("");
            return spawnFail("not-found", "unexpected");
        });

        const snapshot = await loadFindings();
        expect(snapshot.findings.some(item => item.category === "kernel")).toBe(true);
        expect(snapshot.findings.some(item => item.source === "kernel" && item.category === "memory")).toBe(true);
        expect(snapshot.findings.some(item => item.source === "systemd-oomd")).toBe(true);
        expect(snapshot.truncated).toBe(false);

        const calls = journalCalls();
        expect(calls).toHaveLength(4);
        for (const call of calls) {
            expect(call[0][0]).toBe("journalctl");
            expect(call[0]).toContain("--no-pager");
            expect(call[0]).toContain("--quiet");
            expect(call[0]).toContain("--output=json");
            expect(call[0]).toContain("--boot=0");
            expect(call[0].some(arg => arg.startsWith("--output-fields="))).toBe(true);
            expect(call[0].some(arg => arg.startsWith("--lines="))).toBe(true);
            expect(call[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
            expect(call[1]?.superuser).toBeUndefined();
        }
        expect(calls.some(call => call[0].includes("--dmesg"))).toBe(true);
        expect(calls.some(call => call[0].includes("--priority=err"))).toBe(true);
        expect(calls.some(call => call[0].includes("--grep=[Oo]ut of memory: Killed process"))).toBe(true);
        expect(calls.some(call => call[0].includes("--unit=systemd-oomd.service"))).toBe(true);
        expect(calls.some(call => call[0].includes("--lines=" + String(KERNEL_PRIORITY_LINE_LIMIT)))).toBe(true);
        expect(calls.some(call => call[0].includes("--lines=" + String(KERNEL_OOM_LINE_LIMIT)))).toBe(true);
        expect(calls.some(call => call[0].includes("--lines=" + String(OOMD_LINE_LIMIT)))).toBe(true);
        expect(calls.some(call => call[0].includes("--lines=" + String(CATALOG_LINE_LIMIT)))).toBe(true);
        expect(lastJournalCall()[0].filter(arg => arg.startsWith("MESSAGE_ID="))).toHaveLength(2);
    });

    it("still parses findings when spawn uses Cockpit stream consumption", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (isKernelPriorityQuery(argv))
                return spawnOkStreamConsumed(fixture("journal-kernel-err.txt"));
            if (isKernelOomQuery(argv))
                return spawnOkStreamConsumed(fixture("journal-oom-kernel.txt"));
            if (isOomdQuery(argv))
                return spawnOkStreamConsumed(fixture("journal-oom-oomd.txt"));
            if (isCatalogQuery(argv))
                return spawnOkStreamConsumed("");
            return spawnFail("not-found", "unexpected");
        });
        const snapshot = await loadFindings();
        expect(snapshot.findings.some(item => item.category === "kernel")).toBe(true);
        expect(snapshot.findings.some(item => item.category === "memory")).toBe(true);
    });

    it("treats empty output as no findings", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(""));
        const snapshot = await loadFindings();
        expect(snapshot.findings).toEqual([]);
        expect(snapshot.incomplete).toBe(false);
    });

    it("treats documented --grep zero-match exit as empty for that query", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (isKernelOomQuery(argv))
                return spawnFail("", "", { exit_status: 1 });
            return spawnOk("");
        });
        const snapshot = await loadFindings();
        expect(snapshot.findings).toEqual([]);
        expect(snapshot.incomplete).toBe(false);
    });

    it("surfaces a missing executable", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("not-found", "journalctl: not found"));
        await expect(loadFindings()).rejects.toMatchObject({ kind: "not-found" });
    });

    it("surfaces a permission failure when every query is denied", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", "No journal files were opened due to insufficient permissions.", { exit_status: 1 })
        );
        await expect(loadFindings()).rejects.toMatchObject({ kind: "permission-denied" });
    });

    it("keeps successful queries when one query is permission-denied", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (isOomdQuery(argv))
                return spawnFail("", "Permission denied", { exit_status: 1 });
            if (isKernelPriorityQuery(argv))
                return spawnOk(fixture("journal-kernel-err.txt"));
            return spawnOk("");
        });
        const snapshot = await loadFindings();
        expect(snapshot.incomplete).toBe(true);
        expect(snapshot.findings.some(item => item.category === "kernel")).toBe(true);
    });

    it("surfaces a timeout", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("timeout", "terminated"));
        await expect(loadFindings()).rejects.toMatchObject({ kind: "timeout" });
    });

    it("surfaces a command failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", "Failed to open journal: Connection refused", { exit_status: 1 })
        );
        await expect(loadFindings()).rejects.toBeInstanceOf(ProviderError);
    });

    it("marks a query truncated when the line bound is hit", async () => {
        const line = fixture("journal-kernel-err.txt").trim();
        const flood = Array.from({ length: KERNEL_PRIORITY_LINE_LIMIT }, () => line).join("\n");
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (isKernelPriorityQuery(argv))
                return spawnOk(flood);
            return spawnOk("");
        });
        const snapshot = await loadFindings();
        expect(snapshot.truncated).toBe(true);
        expect(snapshot.findings.some(item => item.category === "kernel")).toBe(true);
    });
});

describe("isNoJournalMatches", () => {
    it("recognizes grep zero-match and missing-journal empty failures", () => {
        expect(isNoJournalMatches(
            new ProviderError("command-failed", "The diagnostic command failed."),
            ["--grep=Out of memory: Killed process"]
        )).toBe(true);
        expect(isNoJournalMatches(
            new ProviderError("command-failed", "No journal files were found."),
            ["--dmesg"]
        )).toBe(true);
        expect(isNoJournalMatches(
            new ProviderError("permission-denied", "Permission denied"),
            ["--grep=x"]
        )).toBe(false);
    });
});

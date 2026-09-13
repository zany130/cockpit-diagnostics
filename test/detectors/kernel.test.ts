import { describe, expect, it } from "vitest";

import { detectKernelFindings, isKernelHighPriorityEvent } from "../../src/detectors/kernel";
import { parseJournalOutput } from "../../src/parsers/journal";
import type { JournalEntry } from "../../src/types/journal";
import { fixture } from "../readFixture";

function entries(name: string): JournalEntry[] {
    return parseJournalOutput(fixture(name)).entries;
}

describe("detectKernelFindings", () => {
    it("creates a finding for a kernel err event", () => {
        const findings = detectKernelFindings(entries("journal-kernel-err.txt"));
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
            category: "kernel",
            severity: "warning",
            source: "kernel",
            count: 1,
            logsTarget: { tag: "kernel", start: "boot", prio: "err" },
        });
        expect(findings[0].title).toContain("amdgpu");
        expect(findings[0].evidence?.message).toContain("Failed to initialize parser");
        expect(findings[0].evidence?.priority).toBe(3);
    });

    it("maps crit, alert, and emerg to error findings", () => {
        const findings = detectKernelFindings([
            {
                message: "critical kernel failure",
                priority: 2,
                transport: "kernel",
                realtimeUs: 1,
            },
            {
                message: "alert kernel failure",
                priority: 1,
                identifier: "kernel",
                realtimeUs: 2,
            },
            {
                message: "emergency kernel failure",
                priority: 0,
                transport: "kernel",
                realtimeUs: 3,
            },
        ]);
        expect(findings).toHaveLength(3);
        expect(findings.map(item => item.severity)).toEqual(["error", "error", "error"]);
    });

    it("does not create a finding for a warning-only kernel event", () => {
        expect(detectKernelFindings(entries("journal-kernel-warning.txt"))).toEqual([]);
        expect(isKernelHighPriorityEvent(entries("journal-kernel-warning.txt")[0])).toBe(false);
    });

    it("does not treat application errors as kernel findings", () => {
        expect(detectKernelFindings(entries("journal-app-err.txt"))).toEqual([]);
    });

    it("groups identical kernel errors and keeps different errors separate", () => {
        const findings = detectKernelFindings(entries("journal-kernel-grouped.txt"));
        expect(findings).toHaveLength(2);
        const amdgpu = findings.find(item => item.title.includes("amdgpu"));
        const ext4 = findings.find(item => item.title.includes("EXT4"));
        expect(amdgpu?.count).toBe(3);
        expect(amdgpu?.firstTimestampUs).toBe(1757677330000000);
        expect(amdgpu?.lastTimestampUs).toBe(1757677340000000);
        expect(ext4?.count).toBe(1);
        expect(ext4?.severity).toBe("error");
    });

    it("does not put kernel OOM-kill lines in the Kernel category", () => {
        const findings = detectKernelFindings(entries("journal-oom-kernel.txt"));
        expect(findings).toEqual([]);
    });

    it("skips entries with no priority or no message", () => {
        expect(detectKernelFindings([
            { transport: "kernel", message: "no priority" },
            { transport: "kernel", priority: 3 },
        ])).toEqual([]);
    });
});

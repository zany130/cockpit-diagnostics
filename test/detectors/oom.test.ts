import { describe, expect, it } from "vitest";

import { detectOomFindings } from "../../src/detectors/oom";
import { parseJournalOutput } from "../../src/parsers/journal";
import type { JournalEntry } from "../../src/types/journal";
import { fixture } from "../readFixture";

function entries(name: string): JournalEntry[] {
    return parseJournalOutput(fixture(name)).entries;
}

describe("detectOomFindings", () => {
    it("detects a representative kernel OOM-kill sequence", () => {
        const findings = detectOomFindings(entries("journal-oom-kernel.txt"));
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
            category: "memory",
            severity: "warning",
            source: "kernel",
            process: "firefox",
            pid: 4321,
            count: 1,
        });
        expect(findings[0].title).toBe("Out-of-memory kill: firefox");
        expect(findings[0].summary).toContain("kernel OOM killer");
        expect(findings[0].logsTarget).toMatchObject({
            tag: "kernel",
            start: "boot",
            prio: "err",
            grep: "Killed process",
        });
        expect(findings[0].evidence?.message).toContain("Out of memory: Killed process 4321 (firefox)");
    });

    it("detects a memory-cgroup kernel OOM kill", () => {
        const findings = detectOomFindings(entries("journal-oom-cgroup.txt"));
        expect(findings).toHaveLength(1);
        expect(findings[0].process).toBe("build");
        expect(findings[0].pid).toBe(9911);
        expect(findings[0].source).toBe("kernel");
    });

    it("detects a systemd-oomd kill", () => {
        const findings = detectOomFindings(entries("journal-oom-oomd.txt"));
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
            source: "systemd-oomd",
            cgroup: "user.slice",
            severity: "warning",
        });
        expect(findings[0].title).toBe("Out-of-memory kill: user.slice");
        expect(findings[0].logsTarget).toMatchObject({
            service: "user.slice",
            start: "boot",
            prio: "*",
        });
    });

    it("uses catalog oomd evidence and generic kernel catalog without process details", () => {
        const findings = detectOomFindings(entries("journal-oom-catalog.txt"));
        const oomd = findings.find(item => item.source === "systemd-oomd");
        const kernel = findings.find(item => item.source === "kernel");
        expect(oomd?.unit).toBe("user-1000.slice");
        expect(kernel?.title).toBe("Out-of-memory kill: foo.service");
        expect(kernel?.unit).toBe("foo.service");
    });

    it("shows a generic finding when killed-process metadata is missing", () => {
        const findings = detectOomFindings(entries("journal-oom-generic.txt"));
        expect(findings).toHaveLength(1);
        expect(findings[0].title).toBe("Out-of-memory kill activity detected");
        expect(findings[0].process).toBeUndefined();
        expect(findings[0].pid).toBeUndefined();
        expect(findings[0].source).toBe("kernel");
    });

    it("groups repeated kills of the same process and keeps different processes separate", () => {
        const findings = detectOomFindings(entries("journal-oom-multiple.txt"));
        expect(findings).toHaveLength(2);
        const firefox = findings.find(item => item.process === "firefox");
        const postgres = findings.find(item => item.process === "postgres");
        expect(firefox?.count).toBe(2);
        expect(firefox?.pid).toBe(4400);
        expect(postgres?.count).toBe(1);
        expect(postgres?.pid).toBe(881);
    });

    it("does not treat misleading oom or memory-pressure text as a kill", () => {
        expect(detectOomFindings(entries("journal-oom-false-positives.txt"))).toEqual([]);
    });

    it("ignores malformed evidence without throwing", () => {
        expect(detectOomFindings([
            { transport: "kernel", priority: 3, message: "not an oom line" },
            { message: "Killed" },
            { messageId: "not-a-real-id" },
        ])).toEqual([]);
    });

    it("prefers kernel killed-process evidence over catalog duplicates", () => {
        const combined = [
            ...entries("journal-oom-kernel.txt"),
            ...entries("journal-oom-catalog.txt"),
        ];
        const findings = detectOomFindings(combined);
        const kernel = findings.filter(item => item.source === "kernel");
        expect(kernel).toHaveLength(1);
        expect(kernel[0].process).toBe("firefox");
        expect(kernel.some(item => item.unit === "foo.service")).toBe(false);
    });
});

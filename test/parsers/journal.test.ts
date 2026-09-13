import { describe, expect, it } from "vitest";

import { parseJournalOutput, parseJournalRecord } from "../../src/parsers/journal";
import { journalPriorityName } from "../../src/types/journal";
import { fixture } from "../readFixture";

describe("parseJournalOutput", () => {
    it("parses a normal JSON entry and converts priority and timestamp", () => {
        const { entries, skipped } = parseJournalOutput(fixture("journal-kernel-err.txt"));
        expect(skipped).toBe(0);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            message: "amdgpu 0000:03:00.0: [drm] *ERROR* Failed to initialize parser -125",
            priority: 3,
            transport: "kernel",
            identifier: "kernel",
            bootId: "6580ca3716f24ca8981f1528242512c4",
            realtimeUs: 1757678401000000,
            pid: 0,
            comm: "swapper/0",
        });
        expect(entries[0].cursor).toContain("s=abc");
        expect(journalPriorityName(entries[0].priority)).toBe("err");
    });

    it("keeps going after a malformed line", () => {
        const { entries, skipped } = parseJournalOutput(fixture("journal-malformed.txt"));
        expect(skipped).toBe(1);
        expect(entries.map(entry => entry.message)).toEqual(["amdgpu reset", "EXT4-fs error"]);
    });

    it("accepts missing optional fields", () => {
        const { entries, skipped } = parseJournalOutput(fixture("journal-missing-fields.txt"));
        expect(skipped).toBe(0);
        expect(entries).toHaveLength(1);
        expect(entries[0].message).toBe("partial kernel record");
        expect(entries[0].priority).toBeUndefined();
        expect(entries[0].transport).toBeUndefined();
        expect(entries[0].realtimeUs).toBeUndefined();
    });

    it("ignores unknown extra fields", () => {
        const { entries } = parseJournalOutput(fixture("journal-unknown-fields.txt"));
        expect(entries[0].message).toBe("known plus extra fields");
        expect(entries[0]).not.toHaveProperty("CUSTOM_FIELD");
        expect(entries[0]).not.toHaveProperty("_SELINUX_CONTEXT");
    });

    it("skips binary MESSAGE byte arrays", () => {
        const { entries } = parseJournalOutput(fixture("journal-message-bytes.txt"));
        expect(entries).toHaveLength(1);
        expect(entries[0].message).toBeUndefined();
        expect(entries[0].transport).toBe("kernel");
    });

    it("returns an empty list for empty output", () => {
        expect(parseJournalOutput(fixture("journal-empty.txt"))).toEqual({ entries: [], skipped: 0 });
        expect(parseJournalOutput("")).toEqual({ entries: [], skipped: 0 });
        expect(parseJournalOutput("   \n")).toEqual({ entries: [], skipped: 0 });
    });

    it("parses a JSON array when the whole payload is an array", () => {
        const payload = JSON.stringify([
            { MESSAGE: "one", PRIORITY: "2", _TRANSPORT: "kernel", __REALTIME_TIMESTAMP: "10" },
            { MESSAGE: "two", PRIORITY: 1, _TRANSPORT: "kernel", __REALTIME_TIMESTAMP: "11" },
        ]);
        const { entries, skipped } = parseJournalOutput(payload);
        expect(skipped).toBe(0);
        expect(entries.map(entry => entry.priority)).toEqual([2, 1]);
        expect(journalPriorityName(1)).toBe("alert");
        expect(journalPriorityName(0)).toBe("emerg");
        expect(journalPriorityName(2)).toBe("crit");
    });

    it("skips a non-object JSON line", () => {
        const { entries, skipped } = parseJournalOutput("null\n[]\n\"x\"\n");
        expect(entries).toEqual([]);
        expect(skipped).toBe(3);
    });

    it("returns undefined for a non-record", () => {
        expect(parseJournalRecord(undefined)).toBeUndefined();
    });
});

import { describe, expect, it } from "vitest";

import {
    isNoCoredumpsMessage,
    mergeCoredumpInfo,
    parseCoredumpInfo,
    parseCoredumpList,
} from "../../src/parsers/coredumps";
import { parseBootId } from "../../src/parsers/bootId";
import { coredumpLogsUnit, coredumpProcessLabel } from "../../src/types/crashes";
import { fixture } from "../readFixture";

const BOOT_ID = "6580ca3716f24ca8981f1528242512c4";

describe("parseCoredumpList", () => {
    it("parses one normal coredump from JSON list output", () => {
        const rows = parseCoredumpList(fixture("coredump-list-one.txt"), { bootId: BOOT_ID });
        expect(rows).toHaveLength(1);
        expect(rows[0].pid).toBe(6654);
        expect(rows[0].uid).toBe(1000);
        expect(rows[0].gid).toBe(1000);
        expect(rows[0].signal).toBe(11);
        expect(rows[0].signalName).toBe("SIGSEGV");
        expect(rows[0].executable).toBe("/usr/bin/bash");
        expect(rows[0].storageState).toBe("present");
        expect(rows[0].corePresent).toBe(true);
        expect(rows[0].sizeBytes).toBe(52940);
        expect(rows[0].timestampUs).toBe(1757678401000000);
        expect(rows[0].bootId).toBe(BOOT_ID);
        expect(rows[0].currentBoot).toBe(true);
        expect(rows[0]).not.toHaveProperty("corefile");
        expect(rows[0]).not.toHaveProperty("exe");
        expect(rows[0]).not.toHaveProperty("sig");
    });

    it("parses multiple coredumps", () => {
        const rows = parseCoredumpList(fixture("coredump-list-multiple.txt"), { bootId: BOOT_ID });
        expect(rows).toHaveLength(3);
        expect(rows.map(row => row.pid)).toEqual([6654, 8018, 219544]);
        expect(rows[1].storageState).toBe("missing");
        expect(rows[1].corePresent).toBe(false);
        expect(rows[1].sizeBytes).toBeUndefined();
        expect(rows[2].storageState).toBe("journal");
        expect(rows[2].corePresent).toBe(true);
    });

    it("parses an empty JSON array", () => {
        expect(parseCoredumpList(fixture("coredump-list-empty.txt"))).toEqual([]);
        expect(parseCoredumpList("")).toEqual([]);
        expect(parseCoredumpList("   \n")).toEqual([]);
    });

    it("keeps records that omit optional fields", () => {
        const rows = parseCoredumpList(fixture("coredump-list-missing-fields.txt"));
        expect(rows).toHaveLength(1);
        expect(rows[0].pid).toBe(12);
        expect(rows[0].executable).toBeUndefined();
        expect(rows[0].signal).toBeUndefined();
        expect(rows[0].timestampUs).toBeUndefined();
        expect(rows[0].storageState).toBe("present");
    });

    it("accepts a missing executable", () => {
        const rows = parseCoredumpList(fixture("coredump-list-no-exe.txt"));
        expect(rows[0].pid).toBe(99);
        expect(rows[0].executable).toBeUndefined();
        expect(coredumpProcessLabel(rows[0])).toBe("PID 99");
    });

    it("records that the core file is no longer stored", () => {
        const rows = parseCoredumpList(fixture("coredump-list-core-missing.txt"));
        expect(rows[0].storageState).toBe("missing");
        expect(rows[0].corePresent).toBe(false);
        expect(rows[0].executable).toBe("/usr/lib64/firefox/firefox");
    });

    it("ignores unknown JSON fields", () => {
        const rows = parseCoredumpList(fixture("coredump-list-unknown-fields.txt"));
        expect(rows[0].pid).toBe(42);
        expect(rows[0].storageState).toBe("truncated");
        expect(rows[0].corePresent).toBe(true);
        expect(rows[0]).not.toHaveProperty("new_column");
        expect(rows[0]).not.toHaveProperty("package");
    });

    it("skips a malformed record without dropping valid neighbors", () => {
        const rows = parseCoredumpList(fixture("coredump-list-malformed.txt"));
        expect(rows.map(row => row.pid)).toEqual([1, 2]);
        expect(rows[1].storageState).toBe("none");
        expect(rows[1].corePresent).toBe(false);
    });

    it("parses pretty-printed JSON", () => {
        const rows = parseCoredumpList(fixture("coredump-list-pretty.txt"));
        expect(rows[0].pid).toBe(6654);
        expect(rows[0].executable).toBe("/usr/bin/bash");
    });

    it("rejects completely invalid JSON", () => {
        expect(() => parseCoredumpList(fixture("coredump-list-invalid.txt"))).toThrow(/could not be parsed/);
    });
});

describe("parseCoredumpInfo", () => {
    it("parses detailed metadata including unit and user", () => {
        const rows = parseCoredumpInfo(fixture("coredump-info-normal.txt"), { bootId: BOOT_ID });
        expect(rows).toHaveLength(1);
        expect(rows[0].pid).toBe(6654);
        expect(rows[0].comm).toBe("bash");
        expect(rows[0].user).toBe("user");
        expect(rows[0].command).toBe("/usr/bin/bash -c 'kill -SEGV $$'");
        expect(rows[0].executable).toBe("/usr/bin/bash");
        expect(rows[0].unit).toBe("user@1000.service");
        expect(rows[0].userUnit).toBe("vte-spawn-example.scope");
        expect(rows[0].signal).toBe(11);
        expect(rows[0].signalName).toBe("SIGSEGV");
        expect(rows[0].storageState).toBe("present");
        expect(rows[0].storagePath).toContain("/var/lib/systemd/coredump/");
        expect(rows[0].corePresent).toBe(true);
        expect(rows[0].bootId).toBe(BOOT_ID);
        expect(rows[0].currentBoot).toBe(true);
        expect(coredumpLogsUnit(rows[0])).toBe("user@1000.service");
    });

    it("allows a missing unit and omits a logs target", () => {
        const rows = parseCoredumpInfo(fixture("coredump-info-no-unit.txt"));
        expect(rows[0].unit).toBeUndefined();
        expect(rows[0].storageState).toBe("none");
        expect(rows[0].corePresent).toBe(false);
        expect(coredumpLogsUnit(rows[0])).toBeUndefined();
    });

    it("keeps metadata when the core file has been removed", () => {
        const rows = parseCoredumpInfo(fixture("coredump-info-core-missing.txt"));
        expect(rows[0].unit).toBe("nginx.service");
        expect(rows[0].storageState).toBe("missing");
        expect(rows[0].corePresent).toBe(false);
        expect(coredumpLogsUnit(rows[0])).toBe("nginx.service");
    });

    it("parses multiple info records", () => {
        const rows = parseCoredumpInfo(fixture("coredump-info-multiple.txt"));
        expect(rows).toHaveLength(2);
        expect(rows[0].pid).toBe(6654);
        expect(rows[1].pid).toBe(8018);
        expect(rows[1].unit).toBe("nginx.service");
    });

    it("strips ANSI from highlighted info fields", () => {
        const esc = String.fromCharCode(27);
        const output = [
            `           PID: ${esc}[1m6654${esc}[0m (bash)`,
            `    Executable: ${esc}[1m/usr/bin/bash${esc}[0m`,
            "          Unit: user@1000.service",
            "       Storage: journal",
        ].join("\n");
        const rows = parseCoredumpInfo(output);
        expect(rows[0].pid).toBe(6654);
        expect(rows[0].executable).toBe("/usr/bin/bash");
        expect(rows[0].storageState).toBe("journal");
    });
});

describe("mergeCoredumpInfo", () => {
    it("fills detail fields without replacing list JSON facts", () => {
        const listed = parseCoredumpList(fixture("coredump-list-one.txt"), { bootId: BOOT_ID })[0];
        const info = parseCoredumpInfo(fixture("coredump-info-normal.txt"), { bootId: BOOT_ID })[0];
        const merged = mergeCoredumpInfo(listed, info);
        expect(merged.pid).toBe(6654);
        expect(merged.timestampUs).toBe(1757678401000000);
        expect(merged.unit).toBe("user@1000.service");
        expect(merged.command).toContain("kill -SEGV");
        expect(merged.user).toBe("user");
    });
});

describe("parseBootId", () => {
    it("normalizes a UUID boot id to journal hex", () => {
        expect(parseBootId(fixture("boot-id.txt"))).toBe(BOOT_ID);
    });

    it("rejects malformed boot ids", () => {
        expect(() => parseBootId("not-a-boot-id")).toThrow(/boot ID/);
    });
});

describe("isNoCoredumpsMessage", () => {
    it("recognizes the documented empty-list notice", () => {
        expect(isNoCoredumpsMessage("No coredumps found.")).toBe(true);
        expect(isNoCoredumpsMessage("No match found.")).toBe(true);
        expect(isNoCoredumpsMessage("Permission denied")).toBe(false);
    });
});

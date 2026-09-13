import { describe, expect, it } from "vitest";

import { parseVerifyOutput } from "../../src/parsers/verify";
import { parseUnitFilesPlain, unitFilesFromDbusCall } from "../../src/parsers/unitFiles";
import { fixture } from "../readFixture";

describe("parseVerifyOutput", () => {
    it("returns no findings for empty output", () => {
        expect(parseVerifyOutput("", "apt-daily.service")).toEqual({
            requestedUnit: "apt-daily.service",
            findings: [],
        });
    });

    it("parses a warning with path and line", () => {
        const result = parseVerifyOutput(fixture("verify-warning.txt"), "warn.service");
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]).toMatchObject({
            severity: "warning",
            unit: "warn.service",
            path: "/tmp/verify-unit/warn.service",
            line: 6,
            related: false,
        });
        expect(result.findings[0].message).toMatch(/MysteryKey/);
    });

    it("parses errors and does not call them a selected-unit-only problem when the unit differs", () => {
        const result = parseVerifyOutput(fixture("verify-error.txt"), "demo.service");
        expect(result.findings.length).toBeGreaterThan(1);
        expect(result.findings.some(item => item.severity === "warning")).toBe(true);
        expect(result.findings.some(item => item.severity === "error" && /missing-dep/.test(item.message))).toBe(true);
        expect(result.findings.every(item => item.unit === "demo.service")).toBe(true);
        expect(result.findings.every(item => item.related === false)).toBe(true);
    });

    it("marks findings from another unit as related", () => {
        const result = parseVerifyOutput(fixture("verify-related.txt"), "ok.service");
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].unit).toBe("warn.service");
        expect(result.findings[0].related).toBe(true);
        expect(result.findings[0].severity).toBe("warning");
    });

    it("parses a missing unit", () => {
        const result = parseVerifyOutput(fixture("verify-not-found.txt"), "nosuch.service");
        expect(result.findings[0]).toMatchObject({
            severity: "error",
            unit: "nosuch.service",
            related: false,
            message: "Unit nosuch.service not found.",
        });
    });

    it("parses bracket locations, continuations, and related load failures", () => {
        const result = parseVerifyOutput(fixture("verify-multiple.txt"), "user.slice");
        expect(result.findings.some(item => item.path === "./user.slice" && item.line === 9)).toBe(true);
        const load = result.findings.find(item => item.message.includes("different.service"));
        expect(load?.severity).toBe("error");
        expect(load?.message).toMatch(/No such file or directory/);
    });

    it("keeps unknown wording as a finding without inventing a unit", () => {
        const result = parseVerifyOutput(fixture("verify-malformed.txt"), "foo.service");
        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].severity).toBe("warning");
        expect(result.findings[0].message).toMatch(/not systemd-analyze verify output/);
        expect(result.findings[0].unit).toBeUndefined();
        expect(result.findings[0].related).toBe(false);
    });
});

describe("parseUnitFilesPlain", () => {
    it("parses unit file names and states", () => {
        const files = parseUnitFilesPlain(fixture("unit-files-plain.txt"));
        expect(files.map(file => file.unit)).toEqual([
            "apt-daily.service",
            "console-getty.service",
            "getty@.service",
            "foo.service",
            "user.slice",
        ]);
        expect(files[2]).toMatchObject({ unit: "getty@.service", state: "enabled" });
    });

    it("parses D-Bus tuples and ignores unknown extra fields", () => {
        const files = unitFilesFromDbusCall([[
            ["foo.service", "enabled", "extra"],
            ["/lib/systemd/system/bar.service", "static"],
        ]]);
        expect(files).toEqual([
            { unit: "foo.service", state: "enabled" },
            { unit: "bar.service", state: "static" },
        ]);
    });
});

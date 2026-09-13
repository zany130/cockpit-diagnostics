import { describe, expect, it } from "vitest";

import { parseSecurityDetails, parseSecuritySummaries } from "../../src/parsers/security";
import { fixture } from "../readFixture";

describe("parseSecuritySummaries", () => {
    it("parses multiple services, exposure strings, and assessments", () => {
        const rows = parseSecuritySummaries(fixture("security-list-normal.txt"));
        expect(rows).toHaveLength(4);
        expect(rows[0]).toEqual({ unit: "systemd-journald.service", exposure: 2.1, assessment: "OK" });
        expect(rows[1].assessment).toBe("MEDIUM");
        expect(rows[2].assessment).toBe("EXPOSED");
        expect(rows[3]).toMatchObject({ unit: "legacy.service", exposure: 9.2, assessment: "UNSAFE" });
        expect(rows[0]).not.toHaveProperty("happy");
        expect(rows[0]).not.toHaveProperty("predicate");
    });

    it("parses a single service and numeric exposure", () => {
        const rows = parseSecuritySummaries(fixture("security-list-one.txt"));
        expect(rows).toEqual([{ unit: "only.service", exposure: 1, assessment: "SAFE" }]);
        expect(rows[0]).not.toHaveProperty("extra");
    });

    it("keeps a row with missing optional fields and skips a row without a unit", () => {
        const rows = parseSecuritySummaries(fixture("security-list-missing-fields.txt"));
        expect(rows).toEqual([{ unit: "partial.service" }]);
    });

    it("skips a malformed record without dropping valid neighbors", () => {
        const rows = parseSecuritySummaries(fixture("security-list-malformed.txt"));
        expect(rows.map(row => row.unit)).toEqual(["ok.service", "also.service"]);
    });

    it("returns an empty list for an empty array", () => {
        expect(parseSecuritySummaries(fixture("security-list-empty.txt"))).toEqual([]);
        expect(parseSecuritySummaries("")).toEqual([]);
    });

    it("rejects a non-array document", () => {
        expect(() => parseSecuritySummaries(fixture("security-list-invalid.txt"))).toThrow(/not an array/);
    });
});

describe("parseSecurityDetails", () => {
    it("parses individual security checks and maps set to state", () => {
        const detail = parseSecurityDetails(fixture("security-detail-normal.txt"), "systemd-journald.service");
        expect(detail.unit).toBe("systemd-journald.service");
        expect(detail.checks.length).toBeGreaterThan(0);
        const applied = detail.checks.find(check => check.id === "SystemCallFilter_swap");
        const exposed = detail.checks.find(check => check.id === "UserOrDynamicUser");
        const na = detail.checks.find(check => check.id === "PrivateTmp");
        expect(applied).toMatchObject({ state: "applied", name: "SystemCallFilter=~@swap" });
        expect(exposed).toMatchObject({ state: "not-applied", exposure: 0.4 });
        expect(na?.state).toBe("not-applicable");
        expect(detail.checks[0]).not.toHaveProperty("json_field");
        expect(detail.checks[0]).not.toHaveProperty("set");
    });

    it("ignores unknown extra fields", () => {
        const detail = parseSecurityDetails(fixture("security-detail-unknown-fields.txt"), "foo.service");
        expect(detail.checks[0].id).toBe("NoNewPrivileges");
        expect(detail.checks[0]).not.toHaveProperty("unexpected");
    });

    it("skips a check without an id and keeps a valid check", () => {
        const detail = parseSecurityDetails(fixture("security-detail-malformed.txt"), "foo.service");
        expect(detail.checks).toHaveLength(1);
        expect(detail.checks[0].id).toBe("PrivateTmp");
    });

    it("returns no checks for an empty array", () => {
        expect(parseSecurityDetails(fixture("security-list-empty.txt"), "foo.service")).toEqual({
            unit: "foo.service",
            checks: [],
        });
    });

    it("rejects human-readable security tables", () => {
        expect(() => parseSecuritySummaries("UNIT EXPOSURE PREDICATE\nfoo.service 9.2 UNSAFE\n")).toThrow(/could not be parsed/);
    });
});

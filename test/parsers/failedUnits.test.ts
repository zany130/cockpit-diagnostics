import { describe, expect, it } from "vitest";

import { parseFailedUnits, unitsFromDbusCall, unitsFromDbusTuples } from "../../src/parsers/failedUnits";
import { parseUnitShow } from "../../src/parsers/unitShow";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";

describe("parseFailedUnits", () => {
    it("parses plain systemctl list-units output", () => {
        const units = parseFailedUnits(fixture("failed-units-plain.txt"));
        expect(units).toEqual([
            {
                unit: "foo.service",
                loadState: "loaded",
                activeState: "failed",
                subState: "failed",
                description: "Foo Service",
            },
            {
                unit: "bar.mount",
                loadState: "loaded",
                activeState: "failed",
                subState: "failed",
                description: "Bar Mount",
            },
        ]);
    });

    it("parses JSON list-units output when systemd emits it", () => {
        const units = parseFailedUnits(fixture("failed-units-json.txt"));
        expect(units.map(unit => unit.unit)).toEqual(["foo.service", "bar.mount"]);
        expect(units[0].description).toBe("Foo Service");
    });

    it("returns an empty list for empty output", () => {
        expect(parseFailedUnits("")).toEqual([]);
    });

    it("ignores headers, legends, and count footers", () => {
        const units = parseFailedUnits(fixture("failed-units-header.txt"));
        expect(units.map(unit => unit.unit)).toEqual(["foo.service", "user@1000.service"]);
        expect(units.find(unit => unit.unit === "2")).toBeUndefined();
    });

    it("treats legend-only empty output as no failed units", () => {
        expect(parseFailedUnits(fixture("failed-units-empty-legend.txt"))).toEqual([]);
    });

    it("strips ANSI color and status bullets", () => {
        const units = parseFailedUnits(fixture("failed-units-ansi.txt"));
        expect(units.map(unit => unit.unit)).toEqual(["foo.service", "bar.mount"]);
    });

    it("throws on malformed JSON", () => {
        expect(() => parseFailedUnits(fixture("failed-units-malformed.txt"))).toThrow(ProviderError);
    });

    it("throws when leftover plain text is not a unit listing", () => {
        expect(() => parseFailedUnits("this is not a unit listing")).toThrow(ProviderError);
    });
});

describe("unitsFromDbusTuples", () => {
    it("keeps only failed units from ListUnits", () => {
        const units = unitsFromDbusTuples([
            ["foo.service", "Foo", "loaded", "failed", "failed", "", "/x", 0, "", ""],
            ["ok.service", "Ok", "loaded", "active", "running", "", "/y", 0, "", ""],
        ]);
        expect(units).toEqual([
            {
                unit: "foo.service",
                description: "Foo",
                loadState: "loaded",
                activeState: "failed",
                subState: "failed",
            },
        ]);
    });

    it("accepts Cockpit D-Bus out-args wrapping", () => {
        const units = unitsFromDbusCall([
            [
                ["foo.service", "Foo", "loaded", "failed", "failed", "", "/x", 0, "", ""],
                ["ok.service", "Ok", "loaded", "active", "running", "", "/y", 0, "", ""],
            ],
        ]);
        expect(units.map(unit => unit.unit)).toEqual(["foo.service"]);
    });

    it("returns an empty list for an empty tuple array", () => {
        expect(unitsFromDbusCall([[]])).toEqual([]);
    });
});

describe("parseUnitShow", () => {
    it("maps Result and timestamps onto unit names", () => {
        const extras = parseUnitShow(fixture("unit-show-normal.txt"));
        expect(extras.get("foo.service")).toEqual({
            result: "exit-code",
            execMainStatus: 1,
            inactiveEnterTimestamp: "Sat 2026-09-12 12:00:00 UTC",
        });
        expect(extras.get("bar.mount")?.result).toBe("resources");
        expect(extras.get("bar.mount")?.inactiveEnterTimestamp).toBeUndefined();
    });
});

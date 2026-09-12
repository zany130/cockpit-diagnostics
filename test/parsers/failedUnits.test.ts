import { describe, expect, it } from "vitest";

import { parseFailedUnits, unitsFromDbusTuples } from "../../src/parsers/failedUnits";
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

    it("throws on malformed JSON", () => {
        expect(() => parseFailedUnits(fixture("failed-units-malformed.txt"))).toThrow(ProviderError);
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

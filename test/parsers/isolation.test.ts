import { describe, expect, it } from "vitest";

import { parseBootTime } from "../../src/parsers/bootTime";
import { parseBlame } from "../../src/parsers/blame";
import { parseCriticalChain } from "../../src/parsers/criticalChain";
import { parseFailedUnits } from "../../src/parsers/failedUnits";
import { parseCoredumpList } from "../../src/parsers/coredumps";
import { fixture } from "../readFixture";

describe("provider isolation at the data layer", () => {
    it("can parse successful diagnostics after another fixture fails", () => {
        expect(() => parseBootTime(fixture("boot-time-malformed.txt"))).toThrow();
        const blame = parseBlame(fixture("blame-normal.txt"));
        const chain = parseCriticalChain(fixture("critical-chain-normal.txt"));
        const failed = parseFailedUnits(fixture("failed-units-plain.txt"));
        const dumps = parseCoredumpList(fixture("coredump-list-one.txt"));
        expect(blame.length).toBeGreaterThan(0);
        expect(chain[0].unit).toBe("graphical.target");
        expect(failed[0].unit).toBe("foo.service");
        expect(dumps[0].pid).toBe(6654);
    });
});

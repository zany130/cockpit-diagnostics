import { describe, expect, it } from "vitest";

import { parseBootTime } from "../../src/parsers/bootTime";
import { parseBlame } from "../../src/parsers/blame";
import { parseCriticalChain } from "../../src/parsers/criticalChain";
import { parseFailedUnits } from "../../src/parsers/failedUnits";
import { parseCoredumpList } from "../../src/parsers/coredumps";
import { parseJournalOutput } from "../../src/parsers/journal";
import { parseSecuritySummaries } from "../../src/parsers/security";
import { parseBootPlotSvg } from "../../src/parsers/plot";
import { parseVerifyOutput } from "../../src/parsers/verify";
import { detectKernelFindings } from "../../src/detectors/kernel";
import { detectOomFindings } from "../../src/detectors/oom";
import { fixture } from "../readFixture";

describe("provider isolation at the data layer", () => {
    it("can parse successful diagnostics after another fixture fails", () => {
        expect(() => parseBootTime(fixture("boot-time-malformed.txt"))).toThrow();
        const blame = parseBlame(fixture("blame-normal.txt"));
        const chain = parseCriticalChain(fixture("critical-chain-normal.txt"));
        const failed = parseFailedUnits(fixture("failed-units-plain.txt"));
        const dumps = parseCoredumpList(fixture("coredump-list-one.txt"));
        const journal = parseJournalOutput(fixture("journal-malformed.txt"));
        expect(blame.length).toBeGreaterThan(0);
        expect(chain[0].unit).toBe("graphical.target");
        expect(failed[0].unit).toBe("foo.service");
        expect(dumps[0].pid).toBe(6654);
        expect(journal.entries.length).toBe(2);
        expect(detectOomFindings(journal.entries)).toEqual([]);
        expect(detectKernelFindings(parseJournalOutput(fixture("journal-kernel-err.txt")).entries).length).toBe(1);

        expect(() => parseSecuritySummaries(fixture("security-list-invalid.txt"))).toThrow();
        const summaries = parseSecuritySummaries(fixture("security-list-normal.txt"));
        expect(summaries).toHaveLength(4);
        expect(summaries[0]?.unit).toBe("systemd-journald.service");

        expect(() => parseBootPlotSvg(fixture("plot-invalid.txt"))).toThrow();
        const plot = parseBootPlotSvg(fixture("plot-normal.txt"));
        expect(plot.svg).toContain("foo.service");

        const clean = parseVerifyOutput("", "apt-daily.service");
        expect(clean.findings).toEqual([]);
        const warning = parseVerifyOutput(fixture("verify-warning.txt"), "warn.service");
        expect(warning.findings[0]?.severity).toBe("warning");
    });
});

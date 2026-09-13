import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import { loadBootPlot } from "../../src/providers/plot";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk, spawnOkStreamConsumed } from "../helpers/spawn";

function lastCall() {
    const calls = vi.mocked(cockpit.spawn).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    return calls[calls.length - 1];
}

describe("systemd-analyze plot provider", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("requests SVG for the system manager with argv", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("plot-normal.txt")));
        const plot = await loadBootPlot();
        expect(plot.svg).toContain("foo.service");
        expect(lastCall()[0]).toEqual(["systemd-analyze", "--system", "--no-pager", "plot"]);
        expect(lastCall()[0]).not.toContain("--json=short");
        expect(lastCall()[0]).not.toContain("--table");
        expect(lastCall()[0]).not.toContain("--user");
        expect(lastCall()[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
        expect(lastCall()[1]?.superuser).toBeUndefined();
    });

    it("still parses plot SVG when spawn uses Cockpit stream consumption", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOkStreamConsumed(fixture("plot-normal.txt")));
        const plot = await loadBootPlot();
        expect(plot.svg).toContain("foo.service");
    });

    it("rejects non-SVG output", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(fixture("plot-invalid.txt")));
        await expect(loadBootPlot()).rejects.toMatchObject({ kind: "parse-failed" });
    });

    it("rejects empty output", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk(""));
        await expect(loadBootPlot()).rejects.toMatchObject({ kind: "parse-failed" });
    });

    it("surfaces a missing executable", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("not-found", "systemd-analyze: not found"));
        await expect(loadBootPlot()).rejects.toMatchObject({ kind: "not-found" });
    });

    it("surfaces an unavailable plot subcommand", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", "Unknown command verb 'plot'.", { exit_status: 1 })
        );
        await expect(loadBootPlot()).rejects.toMatchObject({ kind: "not-supported" });
    });

    it("surfaces a command failure", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnFail("", "Failed to connect to bus: Host is down", { exit_status: 1 })
        );
        await expect(loadBootPlot()).rejects.toMatchObject({ kind: "command-failed" });
    });

    it("surfaces a timeout", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnFail("timeout", "terminated"));
        await expect(loadBootPlot()).rejects.toMatchObject({ kind: "timeout" });
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { COMMAND_ENVIRON } from "../../src/utils/locale";
import { detectCapabilities, resetCapabilitiesCache } from "../../src/providers/capabilities";
import { fixture } from "../readFixture";
import { spawnFail, spawnOk } from "../helpers/spawn";

describe("detectCapabilities", () => {
    beforeEach(() => {
        resetCapabilitiesCache();
        vi.spyOn(cockpit, "spawn");
    });

    afterEach(() => {
        resetCapabilitiesCache();
        vi.restoreAllMocks();
    });

    it("probes only v0.1 tools with a stable parsing environment", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "systemd-analyze" && argv.includes("--help"))
                return spawnOk(fixture("analyze-help.txt"));
            if (argv[0] === "systemd-analyze" && argv.includes("--version"))
                return spawnOk(fixture("analyze-version.txt"));
            if (argv[0] === "systemctl" && argv.includes("--version"))
                return spawnOk(fixture("analyze-version.txt"));
            return spawnFail("not-found", `${argv[0]}: not found`);
        });

        const caps = await detectCapabilities();
        expect(caps).toMatchObject({
            systemdAnalyze: true,
            systemdAnalyzeTime: true,
            systemdAnalyzeBlame: true,
            systemdAnalyzeCriticalChain: true,
            systemctl: true,
            systemdVersion: 255,
        });
        expect(caps).not.toHaveProperty("journalctl");
        expect(caps).not.toHaveProperty("coredumpctl");
        expect(caps).not.toHaveProperty("systemdAnalyzePlot");
        expect(caps).not.toHaveProperty("systemdAnalyzeSecurity");

        const commands = vi.mocked(cockpit.spawn).mock.calls.map(call => call[0][0]);
        expect(commands).toEqual(expect.arrayContaining(["systemd-analyze", "systemctl"]));
        expect(commands).not.toContain("journalctl");
        expect(commands).not.toContain("coredumpctl");

        for (const call of vi.mocked(cockpit.spawn).mock.calls) {
            expect(call[0]).toContain("--no-pager");
            expect(call[1]?.environ).toEqual(expect.arrayContaining(COMMAND_ENVIRON));
        }
    });

    it("keeps systemctl available when systemd-analyze is missing", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "systemctl")
                return spawnOk(fixture("analyze-version.txt"));
            return spawnFail("not-found", `${argv[0]}: not found`);
        });

        const caps = await detectCapabilities();
        expect(caps.systemdAnalyze).toBe(false);
        expect(caps.systemctl).toBe(true);
    });
});

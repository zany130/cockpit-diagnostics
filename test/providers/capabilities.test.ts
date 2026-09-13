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

    it("probes systemd-analyze, systemctl, and coredumpctl with a stable parsing environment", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "systemd-analyze" && argv.includes("--help"))
                return spawnOk(fixture("analyze-help.txt"));
            if (argv[0] === "systemd-analyze" && argv.includes("--version"))
                return spawnOk(fixture("analyze-version.txt"));
            if (argv[0] === "systemctl" && argv.includes("--version"))
                return spawnOk(fixture("analyze-version.txt"));
            if (argv[0] === "coredumpctl" && argv.includes("--version"))
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
            coredumpctl: true,
            systemdVersion: 255,
        });
        expect(caps).not.toHaveProperty("journalctl");
        expect(caps).not.toHaveProperty("systemdAnalyzePlot");
        expect(caps).not.toHaveProperty("systemdAnalyzeSecurity");

        const commands = vi.mocked(cockpit.spawn).mock.calls.map(call => call[0][0]);
        expect(commands).toEqual(expect.arrayContaining(["systemd-analyze", "systemctl", "coredumpctl"]));
        expect(commands).not.toContain("journalctl");

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
        expect(caps.coredumpctl).toBe(false);
    });

    it("keeps boot tools available when coredumpctl is missing", async () => {
        vi.mocked(cockpit.spawn).mockImplementation((argv: string[]) => {
            if (argv[0] === "coredumpctl")
                return spawnFail("not-found", "coredumpctl: not found");
            if (argv[0] === "systemd-analyze" && argv.includes("--help"))
                return spawnOk(fixture("analyze-help.txt"));
            return spawnOk(fixture("analyze-version.txt"));
        });

        const caps = await detectCapabilities();
        expect(caps.coredumpctl).toBe(false);
        expect(caps.systemdAnalyze).toBe(true);
        expect(caps.systemctl).toBe(true);
    });
});

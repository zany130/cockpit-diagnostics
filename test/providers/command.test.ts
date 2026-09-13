import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import cockpit from "cockpit";

import { runCommand } from "../../src/providers/command";
import { spawnOk, spawnOkStreamConsumed } from "../helpers/spawn";

describe("runCommand", () => {
    beforeEach(() => {
        vi.spyOn(cockpit, "spawn");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns promise output when spawn does not stream", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() => spawnOk("hello\n"));
        await expect(runCommand(["echo", "hello"])).resolves.toBe("hello\n");
    });

    it("uses streamed chunks when Cockpit resolves an empty string after stream()", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnOkStreamConsumed("ddedc358-8083-492d-bf01-483937b16622\n")
        );
        await expect(runCommand(["cat", "/proc/sys/kernel/random/boot_id"]))
                .resolves.toBe("ddedc358-8083-492d-bf01-483937b16622\n");
    });
});

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

    it("does not attach a streamer for ordinary diagnostic commands", async () => {
        let streamAttached = false;
        vi.mocked(cockpit.spawn).mockImplementation(() => {
            const promise = Promise.resolve("Startup finished in 1.2s\n");
            return Object.assign(promise, {
                close() {},
                stream() {
                    streamAttached = true;
                    return this;
                },
            });
        });
        await expect(runCommand(["systemd-analyze", "--system", "--no-pager", "time"]))
                .resolves.toBe("Startup finished in 1.2s\n");
        expect(streamAttached).toBe(false);
    });

    it("keeps ordinary command output when Cockpit would have consumed a streamer", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnOkStreamConsumed("Startup finished in 1.2s (kernel)\n")
        );
        await expect(runCommand(["systemd-analyze", "--system", "--no-pager", "time"]))
                .resolves.toBe("Startup finished in 1.2s (kernel)\n");
    });

    it("uses streamed chunks for verify when Cockpit resolves an empty string after stream()", async () => {
        vi.mocked(cockpit.spawn).mockImplementation(() =>
            spawnOkStreamConsumed("/tmp/warn.service:6: Unknown key name 'MysteryKey'\n")
        );
        await expect(runCommand(
            ["systemd-analyze", "--system", "--no-pager", "--man=no", "verify", "warn.service"],
            { err: "out", outputOnFailure: true }
        )).resolves.toBe("/tmp/warn.service:6: Unknown key name 'MysteryKey'\n");
    });
});

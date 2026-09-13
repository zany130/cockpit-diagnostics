import { describe, expect, it } from "vitest";

import { parseAnalyzeHelp, parseSystemdVersion } from "../../src/parsers/analyzeHelp";
import { normalizeSpawnError } from "../../src/utils/errors";
import { fixture } from "../readFixture";

describe("capability parsing", () => {
    it("detects analyze subcommands from --help", () => {
        const features = parseAnalyzeHelp(fixture("analyze-help.txt"));
        expect(features.time).toBe(true);
        expect(features.blame).toBe(true);
        expect(features.criticalChain).toBe(true);
        expect(features.security).toBe(true);
        expect(features.plot).toBe(true);
        expect(features.verify).toBe(true);
    });

    it("parses the systemd version", () => {
        expect(parseSystemdVersion(fixture("analyze-version.txt"))).toBe(255);
    });

    it("treats missing subcommands as absent", () => {
        const features = parseAnalyzeHelp("systemd-analyze\n  time\n");
        expect(features.blame).toBe(false);
        expect(features.criticalChain).toBe(false);
        expect(features.security).toBe(false);
        expect(features.plot).toBe(false);
        expect(features.verify).toBe(false);
    });

    it("does not treat plot's JSON option text as the plot command", () => {
        const features = parseAnalyzeHelp(
            "systemd-analyze\n  time\n     --json=pretty|short|off  plot's raw time data\n"
        );
        expect(features.plot).toBe(false);
        expect(features.time).toBe(true);
    });

    it("does not treat --security-policy as the security subcommand", () => {
        const features = parseAnalyzeHelp("systemd-analyze\n  --security-policy=PATH\n  time\n");
        expect(features.security).toBe(false);
        expect(features.time).toBe(true);
    });
});

describe("normalizeSpawnError", () => {
    it("maps missing binaries", () => {
        const error = normalizeSpawnError({ problem: "not-found", message: "systemd-analyze: not found" });
        expect(error.kind).toBe("not-found");
    });

    it("maps permission failures", () => {
        const error = normalizeSpawnError({ problem: "access-denied", message: "access denied" });
        expect(error.kind).toBe("permission-denied");
    });

    it("does not treat the substring 'auth' as a permission failure", () => {
        const error = normalizeSpawnError({
            problem: null,
            exit_status: 1,
            message: "Failed to parse authoritative unit list",
        });
        expect(error.kind).toBe("command-failed");
    });

    it("maps interactive authentication messages", () => {
        const error = normalizeSpawnError({
            problem: null,
            exit_status: 1,
            message: "Interactive authentication required",
        });
        expect(error.kind).toBe("permission-denied");
    });

    it("maps coredumpctl journal permission messages", () => {
        const error = normalizeSpawnError({
            problem: null,
            exit_status: 1,
            message: "No journal files were opened due to insufficient permissions.",
        });
        expect(error.kind).toBe("permission-denied");
    });

    it("maps timeouts", () => {
        const error = normalizeSpawnError({ problem: "timeout", message: "terminated" });
        expect(error.kind).toBe("timeout");
    });

    it("maps hosts that are not booted with systemd", () => {
        const error = normalizeSpawnError({
            problem: null,
            exit_status: 1,
            message: "System has not been booted with systemd as init system (PID 1). Can't operate.",
        });
        expect(error.kind).toBe("not-supported");
    });
});

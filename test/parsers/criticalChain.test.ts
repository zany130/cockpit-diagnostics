import { describe, expect, it } from "vitest";

import { parseCriticalChain } from "../../src/parsers/criticalChain";
import { flattenCriticalChain } from "../../src/types/boot";
import { ProviderError } from "../../src/types/providers";
import { fixture } from "../readFixture";

describe("parseCriticalChain", () => {
    it("preserves hierarchy and timings", () => {
        const tree = parseCriticalChain(fixture("critical-chain-normal.txt"));
        expect(tree).toHaveLength(1);
        expect(tree[0].unit).toBe("graphical.target");
        expect(tree[0].activatedAtUs).toBe(47_847_000);
        expect(tree[0].children[0].unit).toBe("multi-user.target");
        expect(tree[0].children[0].children[0].unit).toBe("NetworkManager.service");
        expect(tree[0].children[0].children[0].activationDurationUs).toBe(2_500_000);
        expect(flattenCriticalChain(tree)).toEqual([
            "graphical.target",
            "multi-user.target",
            "NetworkManager.service",
            "dbus.socket",
            "sysinit.target",
            "systemd-udevd.service",
        ]);
    });

    it("parses minute-scale timestamps", () => {
        const tree = parseCriticalChain(fixture("critical-chain-minutes.txt"));
        expect(tree[0].activatedAtUs).toBe(69_608_000);
        expect(tree[0].children[0].unit).toBe("chronyd.service");
        expect(tree[0].children[0].activationDurationUs).toBe(234_000);
    });

    it("strips ANSI color codes", () => {
        const tree = parseCriticalChain(fixture("critical-chain-ansi.txt"));
        expect(tree[0].unit).toBe("graphical.target");
        expect(tree[0].children[0].unit).toBe("multi-user.target");
    });

    it("returns an empty tree for empty output", () => {
        expect(parseCriticalChain("")).toEqual([]);
    });

    it("throws on malformed output", () => {
        expect(() => parseCriticalChain(fixture("critical-chain-malformed.txt"))).toThrow(ProviderError);
    });
});

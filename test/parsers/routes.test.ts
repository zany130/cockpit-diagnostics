import { describe, expect, it } from "vitest";

import { currentPage, pageFromPath, pathFromLocation } from "../../src/app/routes";
import cockpit from "cockpit";

describe("routes", () => {
    it("treats an empty path as Overview", () => {
        expect(pageFromPath([])).toBe("overview");
        expect(pageFromPath(["overview"])).toBe("overview");
    });

    it("treats crashes as the Crashes page", () => {
        expect(pageFromPath(["crashes"])).toBe("crashes");
    });

    it("treats findings as the Findings page", () => {
        expect(pageFromPath(["findings"])).toBe("findings");
    });

    it("treats security as the Security page", () => {
        expect(pageFromPath(["security"])).toBe("security");
    });

    it("treats verification as the Verification page", () => {
        expect(pageFromPath(["verification"])).toBe("verification");
    });

    it("follows cockpit.location and hash updates", () => {
        cockpit.location.path = [];
        window.location.hash = "";
        expect(pathFromLocation()).toEqual([]);
        expect(currentPage()).toBe("overview");

        cockpit.location.go(["boot"]);
        expect(cockpit.location.path).toEqual(["boot"]);
        expect(currentPage()).toBe("boot");

        cockpit.location.go(["crashes"]);
        expect(currentPage()).toBe("crashes");

        cockpit.location.go(["findings"]);
        expect(currentPage()).toBe("findings");

        cockpit.location.go(["security"]);
        expect(currentPage()).toBe("security");

        cockpit.location.go(["verification"]);
        expect(currentPage()).toBe("verification");

        cockpit.location.go([]);
        expect(currentPage()).toBe("overview");
    });
});

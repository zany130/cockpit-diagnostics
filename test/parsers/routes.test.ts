import { describe, expect, it } from "vitest";

import { currentPage, pageFromPath, pathFromLocation } from "../../src/app/routes";
import cockpit from "cockpit";

describe("routes", () => {
    it("treats an empty path as Overview", () => {
        expect(pageFromPath([])).toBe("overview");
        expect(pageFromPath(["overview"])).toBe("overview");
    });

    it("treats boot as the Boot page", () => {
        expect(pageFromPath(["boot"])).toBe("boot");
    });

    it("follows cockpit.location and hash updates", () => {
        cockpit.location.path = [];
        window.location.hash = "";
        expect(pathFromLocation()).toEqual([]);
        expect(currentPage()).toBe("overview");

        cockpit.location.go(["boot"]);
        expect(cockpit.location.path).toEqual(["boot"]);
        expect(currentPage()).toBe("boot");

        cockpit.location.go([]);
        expect(currentPage()).toBe("overview");
    });
});

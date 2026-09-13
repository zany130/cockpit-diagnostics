import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function walk(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist" || name === "pkg" || name === "bots")
            continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory())
            walk(path, acc);
        else
            acc.push(path);
    }
    return acc;
}

describe("v1.0 release hygiene", () => {
    it("uses version 1.0.0 and the Starter Kit license", () => {
        const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
            version: string;
            license: string;
        };
        expect(pkg.version).toBe("1.0.0");
        expect(pkg.license).toMatch(/LGPL-2\.1/);
    });

    it("does not invoke a shell or inject HTML from application source", () => {
        const files = walk(join(ROOT, "src")).filter(path => /\.(ts|tsx|js)$/.test(path));
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
            const text = readFileSync(file, "utf8");
            expect(text, file).not.toMatch(/["']sh["']\s*,\s*["']-c["']/);
            expect(text, file).not.toMatch(/["']bash["']\s*,\s*["']-c["']/);
            expect(text, file).not.toMatch(/\beval\s*\(/);
            expect(text, file).not.toMatch(/dangerouslySetInnerHTML/);
            expect(text, file).not.toMatch(/innerHTML\s*=/);
        }
    });

    it("does not label systemd exposure as a vulnerability or system security score", () => {
        const files = walk(join(ROOT, "src")).filter(path => /\.(ts|tsx)$/.test(path));
        for (const file of files) {
            const text = readFileSync(file, "utf8");
            expect(text, file).not.toMatch(/vulnerability score/i);
            expect(text, file).not.toMatch(/system security score/i);
        }
    });
});

import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [
        {
            name: "stub-css",
            enforce: "pre",
            resolveId(id: string) {
                if (id.endsWith(".css") || id.endsWith(".scss"))
                    return path.join(root, "test/mocks/style-stub.js");
            },
        },
    ],
    test: {
        environment: "jsdom",
        setupFiles: ["./test/setup.ts"],
        include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
        server: {
            deps: {
                inline: [/@patternfly/],
            },
        },
    },
    resolve: {
        alias: {
            cockpit: path.join(root, "test/mocks/cockpit.ts"),
        },
    },
    esbuild: {
        jsx: "transform",
        jsxFactory: "React.createElement",
        jsxFragment: "React.Fragment",
    },
});

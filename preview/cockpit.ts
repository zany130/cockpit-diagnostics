import cockpitBase from "../test/mocks/cockpit";
import analyzeHelp from "../test/fixtures/analyze-help.txt";
import analyzeVersion from "../test/fixtures/analyze-version.txt";
import timeOutput from "../test/fixtures/boot-time-firmware.txt";
import blameOutput from "../test/fixtures/blame-minutes.txt";
import chainOutput from "../test/fixtures/critical-chain-normal.txt";
import failedPlain from "../test/fixtures/failed-units-plain.txt";
import unitShow from "../test/fixtures/unit-show-normal.txt";
import bootId from "../test/fixtures/boot-id.txt";
import coredumpList from "../test/fixtures/coredump-list-multiple.txt";
import coredumpInfo from "../test/fixtures/coredump-info-normal.txt";
import coredumpInfoNginx from "../test/fixtures/coredump-info-core-missing.txt";
import journalKernel from "../test/fixtures/journal-kernel-grouped.txt";
import journalOomKernel from "../test/fixtures/journal-oom-kernel.txt";
import journalOomd from "../test/fixtures/journal-oom-oomd.txt";

function ok(data: string) {
    return Object.assign(Promise.resolve(data), {
        close() {},
        stream() {
            return this;
        },
        input() {
            return this;
        },
        done() {
            return this;
        },
        fail() {
            return this;
        },
        always() {
            return this;
        },
        progress() {
            return this;
        },
        state() {
            return "resolved";
        },
    });
}

function fail(problem: string, message: string) {
    const error = Object.assign(new Error(message), {
        problem,
        message,
        exit_status: problem === "not-found" ? null : 1,
        exit_signal: null,
    });
    return Object.assign(Promise.reject(error), {
        close() {},
        stream() {
            return this;
        },
        input() {
            return this;
        },
        done() {
            return this;
        },
        fail() {
            return this;
        },
        always() {
            return this;
        },
        progress() {
            return this;
        },
        state() {
            return "rejected";
        },
    });
}

const dbusUnits = [
    ["foo.service", "Foo Service", "loaded", "failed", "failed", "", "/org/foo", 0, "", ""],
    ["bar.mount", "Bar Mount", "loaded", "failed", "failed", "", "/org/bar", 0, "", ""],
];

const cockpit = {
    ...cockpitBase,
    hidden: false,
    spawn(args: string[]) {
        const argv = args.join(" ");
        if (args[0] === "systemd-analyze") {
            if (args.includes("--help"))
                return ok(analyzeHelp);
            if (args.includes("--version"))
                return ok(analyzeVersion);
            if (args.includes("blame"))
                return ok(blameOutput);
            if (args.includes("critical-chain"))
                return ok(chainOutput);
            return ok(timeOutput);
        }
        if (args[0] === "systemctl") {
            if (args.includes("--version"))
                return ok(analyzeVersion);
            if (args.includes("list-units"))
                return ok(failedPlain);
            if (args.includes("show"))
                return ok(unitShow);
            return fail("not-found", argv + ": not found");
        }
        if (args[0] === "cat" && args[1] === "/proc/sys/kernel/random/boot_id")
            return ok(bootId);
        if (args[0] === "coredumpctl") {
            if (args.includes("--version"))
                return ok(analyzeVersion);
            if (args.includes("info")) {
                if (args.some(arg => arg.includes("8018")))
                    return ok(coredumpInfoNginx);
                return ok(coredumpInfo);
            }
            return ok(coredumpList);
        }
        if (args[0] === "journalctl") {
            if (args.includes("--version"))
                return ok(analyzeVersion);
            if (args.some(arg => arg.startsWith("--grep=")))
                return ok(journalOomKernel);
            if (args.some(arg => arg.includes("systemd-oomd.service")))
                return ok(journalOomd);
            if (args.some(arg => arg.startsWith("MESSAGE_ID=")))
                return ok("");
            if (args.includes("--dmesg"))
                return ok(journalKernel);
            return ok("");
        }
        return fail("not-found", args[0] + ": not found");
    },
    dbus() {
        return {
            call: async (_path: string, _iface: string, method: string) => {
                if (method === "ListUnitsFiltered" || method === "ListUnits")
                    return [dbusUnits];
                throw Object.assign(new Error("unknown method"), { problem: "not-supported" });
            },
            close() {},
        };
    },
};

export default cockpit;

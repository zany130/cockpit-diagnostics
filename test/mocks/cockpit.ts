const listeners = new Map<string, Set<() => void>>();

const cockpit = {
    hidden: false,
    language: "en",
    location: {
        url_root: "",
        options: {},
        path: [] as string[],
        href: "/",
        go(path: string[] | string) {
            this.path = Array.isArray(path) ? path : path.split("/").filter(Boolean);
        },
        replace(path: string[] | string) {
            this.go(path);
        },
        encode() {
            return "";
        },
        decode() {
            return [];
        },
    },
    spawn() {
        return Promise.reject(Object.assign(new Error("not mocked"), { problem: "not-found" }));
    },
    dbus() {
        return {
            call: async () => {
                throw Object.assign(new Error("not mocked"), { problem: "not-found" });
            },
            close() {},
        };
    },
    jump: (path: string) => {
        cockpit.location.href = path;
    },
    gettext: (message: string) => message,
    ngettext: (one: string, many: string, n: number) => n === 1 ? one : many,
    format: (fmt: string, ...args: unknown[]) => {
        let i = 0;
        return fmt.replace(/\$\d+/g, () => String(args[i++] ?? ""));
    },
    addEventListener(name: string, listener: () => void) {
        const set = listeners.get(name) ?? new Set();
        set.add(listener);
        listeners.set(name, set);
    },
    removeEventListener(name: string, listener: () => void) {
        listeners.get(name)?.delete(listener);
    },
};

export default cockpit;

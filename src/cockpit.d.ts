declare module "cockpit" {
    const cockpit: {
        hidden: boolean;
        location: {
            path: string[];
            href: string;
            go(path: string[] | string, options?: { [key: string]: string }): void;
            replace(path: string[] | string, options?: { [key: string]: string }): void;
        };
        spawn(args: string[], options?: {
            err?: "out" | "ignore" | "message";
            environ?: string[];
            superuser?: "require" | "try" | null;
            directory?: string;
        }): Promise<string> & {
            close(problem?: string): void;
            stream?(callback: (data: string) => number | void): unknown;
        };
        dbus(name: string, options?: { bus?: string }): {
            call(path: string, iface: string, method: string, args?: unknown[]): Promise<unknown[]>;
            close(): void;
        };
        jump(path: string | string[], host?: string): void;
        gettext(message: string): string;
        ngettext(one: string, many: string, n: number): string;
        format(fmt: string, ...args: unknown[]): string;
        addEventListener(name: string, listener: () => void): void;
        removeEventListener(name: string, listener: () => void): void;
    };
    export default cockpit;
}

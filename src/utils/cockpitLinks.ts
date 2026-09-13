import cockpit from "cockpit";

import type { LogsTarget } from "../types/findings";

/**
 * Navigation targets for existing Cockpit pages.
 *
 * Logs is the `logs` component in the `system` package. The underlying
 * file is `logs.html`, but Cockpit shell navigation (`cockpit.jump`) uses
 * the component route without the `.html` suffix. The shell resolves that
 * to the HTML file. Passing `logs.html` is not a registered component and
 * falls back to Overview.
 *
 * Documented Logs location filters: `#?service=`, `#?tag=`, `#?grep=`,
 * `#?start=boot`, and `#?prio=`. Omitting prio uses Cockpit's default
 * error-level filter, so current-boot jumps set `prio` explicitly.
 * `prio=*` must not be URI-encoded; encoding turns it into `prio=%2A`
 * and Cockpit ignores the wildcard.
 *
 * An exact-unit Services URL is not listed in that API document. Cockpit's
 * current Services UI (and its own tests) use `/system/services#/<unit>`.
 * Keep that hash in this helper so it can be changed in one place if Cockpit
 * changes the public UI path. If the hash is ignored, Services still opens.
 */

const GREP_METACHARACTERS = /[\\^$.*+?()[\]{}|]/;

export function logsPath(filter: LogsTarget = {}): string {
    const params: string[] = [];
    if (filter.service)
        params.push("service=" + encodeURIComponent(filter.service));
    if (filter.tag)
        params.push("tag=" + encodeURIComponent(filter.tag));
    if (filter.grep)
        params.push("grep=" + encodeURIComponent(filter.grep));
    if (filter.start === "boot")
        params.push("start=boot");
    const prio = filter.prio ?? (params.length > 0 ? "*" : undefined);
    if (prio !== undefined)
        params.push("prio=" + prio);
    if (params.length === 0)
        return "/system/logs";
    return "/system/logs#?" + params.join("&");
}

export function serviceUnitPath(unit: string): string {
    // Do not encode `@`: template instances such as user@1000.service must
    // keep the character. systemd unit names cannot contain `#` or `?`.
    return "/system/services#/" + unit;
}

export function unitLogsPath(unit: string): string {
    return logsPath({ service: unit, start: "boot", prio: "*" });
}

/**
 * Use a grep filter only when the text is a short literal. Cockpit Logs
 * treats grep as a regex; metacharacters would over-match.
 */
export function literalLogsGrep(text: string, maxLength = 80): string | undefined {
    const value = text.trim();
    if (!value || value.length > maxLength || GREP_METACHARACTERS.test(value))
        return undefined;
    return value;
}

export function jumpToLogs(filter: LogsTarget = {}): void {
    cockpit.jump(logsPath(filter));
}

export function jumpToService(unit: string): void {
    cockpit.jump(serviceUnitPath(unit));
}

export function jumpToUnitLogs(unit: string): void {
    cockpit.jump(unitLogsPath(unit));
}

export function jumpToServices(): void {
    cockpit.jump("/system/services");
}

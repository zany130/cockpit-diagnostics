import cockpit from "cockpit";

/**
 * Navigation targets for existing Cockpit pages.
 *
 * Logs filters are documented in Cockpit's system API
 * (`/system/logs.html` with `#?service=` and `#?start=boot`).
 *
 * An exact-unit Services URL is not listed in that API document. Cockpit's
 * current Services UI (and its own tests) use `/system/services#/<unit>`.
 * Keep that hash in this helper so it can be changed in one place if Cockpit
 * changes the public UI path. If the hash is ignored, Services still opens.
 */

export function serviceUnitPath(unit: string): string {
    // Do not encode `@`: template instances such as user@1000.service must
    // keep the character. systemd unit names cannot contain `#` or `?`.
    return "/system/services#/" + unit;
}

export function unitLogsPath(unit: string): string {
    return "/system/logs.html#?service=" + encodeURIComponent(unit) + "&start=boot";
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

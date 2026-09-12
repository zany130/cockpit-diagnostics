import cockpit from "cockpit";

/**
 * Navigation targets for existing Cockpit pages.
 *
 * Logs is the `logs` component in the `system` package. The underlying
 * file is `logs.html`, but Cockpit shell navigation (`cockpit.jump`) uses
 * the component route without the `.html` suffix. The shell resolves that
 * to the HTML file. Passing `logs.html` is not a registered component and
 * falls back to Overview.
 *
 * Documented Logs location filters: `#?service=`, `#?start=boot`, and
 * `#?prio=*`. Omitting prio uses Cockpit's default error-level filter, so
 * View Logs always sets `prio=*` to show every journal priority for the
 * selected unit on the current boot.
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
    return "/system/logs#?service=" + encodeURIComponent(unit) + "&start=boot&prio=*";
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

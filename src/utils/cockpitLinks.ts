import cockpit from "cockpit";

/**
 * Navigation targets for existing Cockpit pages.
 *
 * Logs unit filters are documented in Cockpit's system API
 * (`/system/logs.html` with `#?service=`).
 *
 * An exact-unit Services URL is not listed in that API document. Cockpit's
 * current Services UI (and its own tests) use `/system/services#/<unit>`.
 * This plugin jumps to that public UI path rather than importing private
 * Cockpit modules. If the hash is ignored, the Services page still opens.
 */
export function jumpToService(unit: string): void {
    cockpit.jump("/system/services#/" + encodeURIComponent(unit));
}

export function jumpToUnitLogs(unit: string): void {
    cockpit.jump("/system/logs.html#/?service=" + encodeURIComponent(unit) + "&start=boot");
}

export function jumpToServices(): void {
    cockpit.jump("/system/services");
}

export function jumpToLogs(): void {
    cockpit.jump("/system/logs.html");
}

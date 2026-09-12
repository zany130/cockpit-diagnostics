import cockpit from "cockpit";

export type DiagnosticsPage = "overview" | "boot";

export function pageFromPath(path: string[]): DiagnosticsPage {
    return path[0] === "boot" ? "boot" : "overview";
}

export function goToPage(page: DiagnosticsPage): void {
    cockpit.location.go(page === "overview" ? [] : [page]);
}

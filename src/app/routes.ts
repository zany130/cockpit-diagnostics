import cockpit from "cockpit";

export type DiagnosticsPage = "overview" | "boot";

export function pageFromPath(path: string[]): DiagnosticsPage {
    return path[0] === "boot" ? "boot" : "overview";
}

export function pathFromLocation(): string[] {
    const cockpitPath = cockpit.location.path;
    if (cockpitPath.length > 0)
        return cockpitPath;

    if (typeof window === "undefined")
        return [];

    const hash = window.location.hash.replace(/^#\/?/, "");
    return hash.split("/").filter(Boolean);
}

export function currentPage(): DiagnosticsPage {
    return pageFromPath(pathFromLocation());
}

export function goToPage(page: DiagnosticsPage): void {
    cockpit.location.go(page === "overview" ? [] : [page]);
}

import cockpit from "cockpit";

export type DiagnosticsPage = "overview" | "boot" | "crashes" | "findings" | "security" | "verification";

export function pageFromPath(path: string[]): DiagnosticsPage {
    if (path[0] === "boot")
        return "boot";
    if (path[0] === "crashes")
        return "crashes";
    if (path[0] === "findings")
        return "findings";
    if (path[0] === "security")
        return "security";
    if (path[0] === "verification")
        return "verification";
    return "overview";
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

import React, { useCallback, useEffect, useState } from "react";

import { Nav, NavItem, NavList } from "@patternfly/react-core/dist/esm/components/Nav/index.js";
import { Page, PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Spinner } from "@patternfly/react-core/dist/esm/components/Spinner/index.js";
import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";

import cockpit from "cockpit";

import type { DiagnosticCapabilities } from "./types/diagnostics";
import { detectCapabilities } from "./providers/capabilities";
import { currentPage, goToPage, type DiagnosticsPage } from "./app/routes";
import { BootPage } from "./pages/BootPage";
import { CrashesPage } from "./pages/CrashesPage";
import { FindingsPage } from "./pages/FindingsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SecurityPage } from "./pages/SecurityPage";

const _ = cockpit.gettext;

export const Application = () => {
    const [page, setPage] = useState<DiagnosticsPage>(() => currentPage());
    const [capabilities, setCapabilities] = useState<DiagnosticCapabilities | null>(null);
    const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

    useEffect(() => {
        const onLocation = () => setPage(currentPage());
        cockpit.addEventListener("locationchanged", onLocation);
        window.addEventListener("hashchange", onLocation);
        return () => {
            cockpit.removeEventListener("locationchanged", onLocation);
            window.removeEventListener("hashchange", onLocation);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        detectCapabilities().then(value => {
            if (!cancelled)
                setCapabilities(value);
        })
                .catch(error => {
                    if (!cancelled)
                        setCapabilitiesError(error instanceof Error ? error.message : String(error));
                });
        return () => {
            cancelled = true;
        };
    }, []);

    const markRefreshed = useCallback(() => setLastRefreshed(new Date()), []);

    return (
        <Page className="pf-m-no-sidebar">
            <PageSection type="subnav" isWidthLimited>
                <Nav variant="horizontal" aria-label={_("Diagnostics")}>
                    <NavList>
                        <NavItem
                            to="#/"
                            isActive={page === "overview"}
                            onClick={event => {
                                event.preventDefault();
                                goToPage("overview");
                            }}
                        >
                            {_("Overview")}
                        </NavItem>
                        <NavItem
                            to="#/boot"
                            isActive={page === "boot"}
                            onClick={event => {
                                event.preventDefault();
                                goToPage("boot");
                            }}
                        >
                            {_("Boot")}
                        </NavItem>
                        <NavItem
                            to="#/crashes"
                            isActive={page === "crashes"}
                            onClick={event => {
                                event.preventDefault();
                                goToPage("crashes");
                            }}
                        >
                            {_("Crashes")}
                        </NavItem>
                        <NavItem
                            to="#/findings"
                            isActive={page === "findings"}
                            onClick={event => {
                                event.preventDefault();
                                goToPage("findings");
                            }}
                        >
                            {_("Findings")}
                        </NavItem>
                        <NavItem
                            to="#/security"
                            isActive={page === "security"}
                            onClick={event => {
                                event.preventDefault();
                                goToPage("security");
                            }}
                        >
                            {_("Security")}
                        </NavItem>
                    </NavList>
                </Nav>
            </PageSection>
            {!capabilities && !capabilitiesError && (
                <PageSection>
                    <div className="diagnostics-loading" role="status">
                        <Spinner size="lg" aria-label={_("Detecting available diagnostics")} />
                        <span className="pf-v6-u-ml-sm">{_("Detecting available diagnostics")}</span>
                    </div>
                </PageSection>
            )}
            {capabilitiesError && (
                <PageSection>
                    <Alert variant="danger" title={_("Could not detect diagnostic capabilities")}>
                        {capabilitiesError}
                    </Alert>
                </PageSection>
            )}
            {capabilities && page === "overview" && (
                <OverviewPage
                    capabilities={capabilities}
                    onRefresh={markRefreshed}
                    lastRefreshed={lastRefreshed}
                />
            )}
            {capabilities && page === "boot" && (
                <BootPage
                    capabilities={capabilities}
                    onRefresh={markRefreshed}
                    lastRefreshed={lastRefreshed}
                />
            )}
            {capabilities && page === "crashes" && (
                <CrashesPage
                    capabilities={capabilities}
                    onRefresh={markRefreshed}
                    lastRefreshed={lastRefreshed}
                />
            )}
            {capabilities && page === "findings" && (
                <FindingsPage
                    capabilities={capabilities}
                    onRefresh={markRefreshed}
                    lastRefreshed={lastRefreshed}
                />
            )}
            {capabilities && page === "security" && (
                <SecurityPage
                    capabilities={capabilities}
                    onRefresh={markRefreshed}
                    lastRefreshed={lastRefreshed}
                />
            )}
        </Page>
    );
};

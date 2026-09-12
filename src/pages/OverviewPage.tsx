import React from "react";

import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { List, ListItem } from "@patternfly/react-core/dist/esm/components/List/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import cockpit from "cockpit";

import type { BootSummary } from "../types/boot";
import type { DiagnosticCapabilities, DiagnosticFinding, FailedUnit } from "../types/diagnostics";
import { loadBootSummary, loadCriticalChain } from "../providers/systemdAnalyze";
import { loadFailedUnits } from "../providers/systemdUnits";
import { formatDuration } from "../utils/duration";
import { jumpToServices } from "../utils/cockpitLinks";
import { goToPage } from "../app/routes";
import { useAsyncProvider } from "../app/useAsyncProvider";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
import { DiagnosticStatus } from "../components/DiagnosticStatus";
import { UnitActions } from "../components/UnitLink";

const _ = cockpit.gettext;

export const OverviewPage = ({ capabilities, onRefresh, lastRefreshed }: {
    capabilities: DiagnosticCapabilities;
    onRefresh: () => void;
    lastRefreshed?: Date | undefined;
}) => {
    const boot = useAsyncProvider(loadBootSummary, capabilities.systemdAnalyze && capabilities.systemdAnalyzeTime);
    const chain = useAsyncProvider(loadCriticalChain, capabilities.systemdAnalyze && capabilities.systemdAnalyzeCriticalChain);
    const failed = useAsyncProvider(loadFailedUnits, capabilities.systemctl);

    const refreshAll = () => {
        boot.reload();
        chain.reload();
        failed.reload();
        onRefresh();
    };

    const findings = makeFindings(failed.data ?? []);

    return (
        <PageSection>
            <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
                <FlexItem>
                    <Title headingLevel="h2" id="diagnostics-overview">{_("Overview")}</Title>
                </FlexItem>
                <FlexItem>
                    <Flex spaceItems={{ default: "spaceItemsMd" }} alignItems={{ default: "alignItemsCenter" }}>
                        {lastRefreshed && (
                            <span className="pf-v6-u-color-200">
                                {cockpit.format(_("Last refreshed $0"), lastRefreshed.toLocaleString())}
                            </span>
                        )}
                        <Button variant="secondary" onClick={refreshAll}>{_("Refresh")}</Button>
                    </Flex>
                </FlexItem>
            </Flex>

            <SummaryCard findings={findings} failedStatus={failed.status} />

            <div className="diagnostics-overview-grid">
                <BootOverviewCard
                    capabilities={capabilities}
                    boot={boot}
                    chainHeadline={chainHeadline(chain.data)}
                    chainStatus={chain.status}
                />
                <FailedUnitsCard capabilities={capabilities} failed={failed} />
            </div>
        </PageSection>
    );
};

const SummaryCard = ({
    findings,
    failedStatus,
}: {
    findings: DiagnosticFinding[];
    failedStatus: string;
}) => (
    <Card className="pf-v6-u-mt-md pf-v6-u-mb-md" isPlain>
        <CardHeader>
            <CardTitle>{_("Attention")}</CardTitle>
        </CardHeader>
        <CardBody>
            {failedStatus === "loading" && <p>{_("Collecting current unit state…")}</p>}
            {failedStatus !== "loading" && findings.length === 0 && (
                <p>{_("No failed units are currently reported. This is a factual snapshot, not a health score.")}</p>
            )}
            {findings.length > 0 && (
                <>
                    <p className="pf-v6-u-mb-sm">
                        {cockpit.format(
                            cockpit.ngettext("$0 item may need attention", "$0 items may need attention", findings.length),
                            findings.length
                        )}
                    </p>
                    <List isPlain>
                        {findings.map(finding => (
                            <ListItem key={finding.title}>
                                <DiagnosticStatus severity={finding.severity} />
                                {" "}
                                <strong>{finding.title}</strong>
                                {" — "}
                                {finding.summary}
                            </ListItem>
                        ))}
                    </List>
                </>
            )}
        </CardBody>
    </Card>
);

const BootOverviewCard = ({
    capabilities,
    boot,
    chainHeadline,
    chainStatus,
}: {
    capabilities: DiagnosticCapabilities;
    boot: ReturnType<typeof useAsyncProvider<BootSummary>>;
    chainHeadline?: string | undefined;
    chainStatus: string;
}) => (
    <Card isPlain>
        <CardHeader>
            <CardTitle>{_("Boot")}</CardTitle>
        </CardHeader>
        <CardBody>
            {!capabilities.systemdAnalyze
                ? (
                    <CapabilityNotice>
                        {_("systemd-analyze is not available, so boot timing cannot be summarized.")}
                    </CapabilityNotice>
                )
                : (
                    <AsyncState
                        status={boot.status}
                        error={boot.error}
                        loadingLabel={_("Loading boot summary")}
                    >
                        {boot.data && (
                            <List isPlain>
                                {boot.data.totalUs !== undefined && (
                                    <ListItem>
                                        {cockpit.format(_("Total boot duration: $0"), formatDuration(boot.data.totalUs))}
                                    </ListItem>
                                )}
                                {boot.data.userspaceUs !== undefined && (
                                    <ListItem>
                                        {cockpit.format(_("Userspace: $0"), formatDuration(boot.data.userspaceUs))}
                                    </ListItem>
                                )}
                                {boot.data.target && boot.data.targetReachedUs !== undefined && (
                                    <ListItem>
                                        {cockpit.format(
                                            _("$0 reached after $1"),
                                            boot.data.target,
                                            formatDuration(boot.data.targetReachedUs)
                                        )}
                                    </ListItem>
                                )}
                                {chainStatus === "ready" && chainHeadline && (
                                    <ListItem>{cockpit.format(_("Critical path: $0"), chainHeadline)}</ListItem>
                                )}
                            </List>
                        )}
                    </AsyncState>
                )}
        </CardBody>
        <CardFooter>
            <Button variant="link" isInline onClick={() => goToPage("boot")}>{_("Open Boot page")}</Button>
        </CardFooter>
    </Card>
);

const FailedUnitsCard = ({
    capabilities,
    failed,
}: {
    capabilities: DiagnosticCapabilities;
    failed: ReturnType<typeof useAsyncProvider<FailedUnit[]>>;
}) => (
    <Card isPlain>
        <CardHeader>
            <CardTitle>{_("Failed units")}</CardTitle>
        </CardHeader>
        <CardBody>
            {!capabilities.systemctl
                ? (
                    <CapabilityNotice>
                        {_("systemctl is not available, so failed units cannot be listed.")}
                    </CapabilityNotice>
                )
                : (
                    <AsyncState
                        status={failed.status}
                        error={failed.error}
                        isEmpty={failed.status === "ready" && (failed.data?.length ?? 0) === 0}
                        emptyTitle={_("No failed units")}
                        emptyBody={_("systemd currently reports no failed units.")}
                        loadingLabel={_("Loading failed units")}
                    >
                        {failed.data && failed.data.length > 0 && (
                            <>
                                <p className="pf-v6-u-mb-md">
                                    {cockpit.format(
                                        cockpit.ngettext("$0 failed unit", "$0 failed units", failed.data.length),
                                        failed.data.length
                                    )}
                                </p>
                                <FailedUnitTable units={failed.data} />
                            </>
                        )}
                    </AsyncState>
                )}
        </CardBody>
        <CardFooter>
            <Button variant="link" isInline onClick={() => jumpToServices()}>{_("Open Cockpit Services")}</Button>
        </CardFooter>
    </Card>
);

export const FailedUnitTable = ({ units }: { units: FailedUnit[] }) => (
    <Table variant="compact" aria-label={_("Failed units")}>
        <Thead>
            <Tr>
                <Th>{_("Unit")}</Th>
                <Th>{_("State")}</Th>
                <Th>{_("Result")}</Th>
                <Th>{_("When")}</Th>
                <Th>{_("Actions")}</Th>
            </Tr>
        </Thead>
        <Tbody>
            {units.map(unit => (
                <Tr key={unit.unit}>
                    <Td dataLabel={_("Unit")}>
                        <div>{unit.unit}</div>
                        {unit.description && <div className="pf-v6-u-color-200">{unit.description}</div>}
                    </Td>
                    <Td dataLabel={_("State")}>
                        {[unit.activeState, unit.subState].filter(Boolean).join(" / ") || "—"}
                    </Td>
                    <Td dataLabel={_("Result")}>
                        {failureReason(unit)}
                    </Td>
                    <Td dataLabel={_("When")}>
                        {unit.inactiveEnterTimestamp ?? "—"}
                    </Td>
                    <Td dataLabel={_("Actions")}>
                        <UnitActions unit={unit.unit} />
                    </Td>
                </Tr>
            ))}
        </Tbody>
    </Table>
);

function failureReason(unit: FailedUnit): string {
    const parts: string[] = [];
    if (unit.result)
        parts.push(unit.result);
    if (unit.execMainStatus !== undefined)
        parts.push(cockpit.format(_("exit status $0"), String(unit.execMainStatus)));
    return parts.join(", ") || "—";
}

function makeFindings(units: FailedUnit[]): DiagnosticFinding[] {
    if (units.length === 0)
        return [];
    const evidence = units.map(unit => unit.unit);
    const finding: DiagnosticFinding = {
        severity: "error",
        category: "unit",
        title: cockpit.format(
            cockpit.ngettext("$0 failed unit", "$0 failed units", units.length),
            units.length
        ),
        summary: _("systemd currently reports these units as failed."),
        source: "systemd",
    };
    if (evidence.length > 0)
        finding.evidence = evidence;
    return [finding];
}

function chainHeadline(nodes: import("../types/boot").CriticalChainNode[] | undefined): string | undefined {
    if (!nodes || nodes.length === 0)
        return undefined;
    const root = nodes[0];
    if (root.activatedAtUs !== undefined)
        return cockpit.format(_("$0 @ $1"), root.unit, formatDuration(root.activatedAtUs));
    return root.unit;
}

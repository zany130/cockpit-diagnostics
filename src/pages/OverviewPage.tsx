import React from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import cockpit from "cockpit";

import type { BootSummary } from "../types/boot";
import type { CoredumpEntry } from "../types/crashes";
import type { DiagnosticCapabilities, FailedUnit } from "../types/diagnostics";
import type { FindingsSnapshot } from "../types/findings";
import { loadBootSummary, loadCriticalChain } from "../providers/systemdAnalyze";
import { loadFailedUnits } from "../providers/systemdUnits";
import { loadCoredumps } from "../providers/coredumps";
import { loadFindings } from "../providers/journal";
import { formatDuration } from "../utils/duration";
import { jumpToServices } from "../utils/cockpitLinks";
import { goToPage } from "../app/routes";
import { useAsyncProvider } from "../app/useAsyncProvider";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
import { DurationText } from "../components/DurationText";
import { PageHeader } from "../components/PageHeader";
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
    const crashes = useAsyncProvider(loadCoredumps, capabilities.coredumpctl);
    const findings = useAsyncProvider(loadFindings, capabilities.journalctl);

    const refreshAll = () => {
        boot.reload();
        chain.reload();
        failed.reload();
        crashes.reload();
        findings.reload();
        onRefresh();
    };

    const failedCount = failed.status === "ready" ? (failed.data?.length ?? 0) : 0;

    return (
        <PageSection isWidthLimited>
            <PageHeader
                title={_("Overview")}
                titleId="diagnostics-overview"
                lastRefreshed={lastRefreshed}
                onRefresh={refreshAll}
            />

            {failed.status === "ready" && failedCount > 0 && (
                <Alert
                    className="pf-v6-u-mb-md"
                    variant="danger"
                    isInline
                    title={cockpit.format(
                        cockpit.ngettext("$0 failed unit", "$0 failed units", failedCount),
                        failedCount
                    )}
                >
                    {_("systemd currently reports these units as failed.")}
                </Alert>
            )}

            <Grid hasGutter className="diagnostics-grid">
                <GridItem md={6} xl={4}>
                    <BootOverviewCard
                        capabilities={capabilities}
                        boot={boot}
                        chainHeadline={chainHeadline(chain.data)}
                        chainStatus={chain.status}
                    />
                </GridItem>
                <GridItem md={6} xl={4}>
                    <FailedUnitsCard capabilities={capabilities} failed={failed} failedCount={failedCount} />
                </GridItem>
                <GridItem md={6} xl={4}>
                    <CrashesOverviewCard capabilities={capabilities} crashes={crashes} />
                </GridItem>
                <GridItem md={6} xl={4}>
                    <FindingsOverviewCard capabilities={capabilities} findings={findings} />
                </GridItem>
                <GridItem md={6} xl={4}>
                    <SecurityOverviewCard capabilities={capabilities} />
                </GridItem>
                <GridItem md={6} xl={4}>
                    <VerificationOverviewCard capabilities={capabilities} />
                </GridItem>
            </Grid>
        </PageSection>
    );
};

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
    <Card isCompact>
        <CardHeader>
            <CardTitle>
                <Title headingLevel="h3" size="md">{_("Boot")}</Title>
            </CardTitle>
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
                            <>
                                {boot.data.totalUs !== undefined && (
                                    <Content component="p" className="diagnostics-overview-lead">
                                        {cockpit.format(_("Boot completed in $0"), formatDuration(boot.data.totalUs))}
                                    </Content>
                                )}
                                <DescriptionList isCompact isHorizontal>
                                    {boot.data.userspaceUs !== undefined && (
                                        <DescriptionListGroup>
                                            <DescriptionListTerm>{_("Userspace")}</DescriptionListTerm>
                                            <DescriptionListDescription>
                                                <DurationText valueUs={boot.data.userspaceUs} />
                                            </DescriptionListDescription>
                                        </DescriptionListGroup>
                                    )}
                                    {boot.data.target && boot.data.targetReachedUs !== undefined && (
                                        <DescriptionListGroup>
                                            <DescriptionListTerm>{_("Default target")}</DescriptionListTerm>
                                            <DescriptionListDescription>
                                                {cockpit.format(
                                                    _("$0 reached after $1"),
                                                    boot.data.target,
                                                    formatDuration(boot.data.targetReachedUs)
                                                )}
                                            </DescriptionListDescription>
                                        </DescriptionListGroup>
                                    )}
                                    {chainStatus === "ready" && chainHeadline && (
                                        <DescriptionListGroup>
                                            <DescriptionListTerm>{_("Critical path")}</DescriptionListTerm>
                                            <DescriptionListDescription>{chainHeadline}</DescriptionListDescription>
                                        </DescriptionListGroup>
                                    )}
                                </DescriptionList>
                            </>
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
    failedCount,
}: {
    capabilities: DiagnosticCapabilities;
    failed: ReturnType<typeof useAsyncProvider<FailedUnit[]>>;
    failedCount: number;
}) => {
    const countLabel = failed.status === "ready" && failedCount > 0
        ? (
            <Label color="red">
                {cockpit.format(
                    cockpit.ngettext("$0 failed unit", "$0 failed units", failedCount),
                    failedCount
                )}
            </Label>
        )
        : null;

    return (
        <Card isCompact>
            <CardHeader {...(countLabel ? { actions: { hasNoOffset: true, actions: countLabel } } : {})}>
                <CardTitle>
                    <Title headingLevel="h3" size="md">{_("Failed units")}</Title>
                </CardTitle>
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
                            isEmpty={failed.status === "ready" && failedCount === 0}
                            emptyTitle={_("No failed units")}
                            emptyBody={_("systemd currently reports no failed units. This is a factual snapshot, not a health score.")}
                            loadingLabel={_("Loading failed units")}
                        >
                            {failed.data && failed.data.length > 0 && (
                                <div className="diagnostics-scroll">
                                    <FailedUnitTable units={failed.data} />
                                </div>
                            )}
                        </AsyncState>
                    )}
            </CardBody>
            <CardFooter>
                <Button variant="link" isInline onClick={() => jumpToServices()}>{_("Open Cockpit Services")}</Button>
            </CardFooter>
        </Card>
    );
};

const CrashesOverviewCard = ({
    capabilities,
    crashes,
}: {
    capabilities: DiagnosticCapabilities;
    crashes: ReturnType<typeof useAsyncProvider<CoredumpEntry[]>>;
}) => {
    const count = crashes.status === "ready" ? (crashes.data?.length ?? 0) : 0;
    const summary = crashes.status === "ready"
        ? (
            count === 0
                ? _("No coredumps this boot")
                : cockpit.format(
                    cockpit.ngettext("$0 coredump this boot", "$0 coredumps this boot", count),
                    count
                )
        )
        : undefined;

    return (
        <Card isCompact>
            <CardHeader>
                <CardTitle>
                    <Title headingLevel="h3" size="md">{_("Crashes")}</Title>
                </CardTitle>
            </CardHeader>
            <CardBody>
                {!capabilities.coredumpctl
                    ? (
                        <CapabilityNotice>
                            {_("coredumpctl is not available, so coredumps cannot be summarized.")}
                        </CapabilityNotice>
                    )
                    : (
                        <AsyncState
                            status={crashes.status}
                            error={crashes.error}
                            loadingLabel={_("Loading coredumps")}
                        >
                            {summary && (
                                <>
                                    <Content component="p" className="diagnostics-overview-lead">
                                        <Button variant="link" isInline onClick={() => goToPage("crashes")}>
                                            {summary}
                                        </Button>
                                    </Content>
                                    <HelperText>
                                        <HelperTextItem>
                                            {_("Coredumps are crash records from this boot. They do not automatically mean the system is unhealthy.")}
                                        </HelperTextItem>
                                    </HelperText>
                                </>
                            )}
                        </AsyncState>
                    )}
            </CardBody>
            <CardFooter>
                <Button variant="link" isInline onClick={() => goToPage("crashes")}>{_("Open Crashes page")}</Button>
            </CardFooter>
        </Card>
    );
};

const FindingsOverviewCard = ({
    capabilities,
    findings,
}: {
    capabilities: DiagnosticCapabilities;
    findings: ReturnType<typeof useAsyncProvider<FindingsSnapshot>>;
}) => {
    const list = findings.status === "ready" ? (findings.data?.findings ?? []) : [];
    const memoryCount = list.filter(item => item.category === "memory").length;
    const kernelCount = list.filter(item => item.category === "kernel").length;
    const summary = findings.status === "ready"
        ? (
            list.length === 0
                ? _("No supported findings this boot")
                : cockpit.format(
                    cockpit.ngettext("$0 finding this boot", "$0 findings this boot", list.length),
                    list.length
                )
        )
        : undefined;

    return (
        <Card isCompact>
            <CardHeader>
                <CardTitle>
                    <Title headingLevel="h3" size="md">{_("Findings")}</Title>
                </CardTitle>
            </CardHeader>
            <CardBody>
                {!capabilities.journalctl
                    ? (
                        <CapabilityNotice>
                            {_("journalctl is not available, so findings cannot be summarized.")}
                        </CapabilityNotice>
                    )
                    : (
                        <AsyncState
                            status={findings.status}
                            error={findings.error}
                            loadingLabel={_("Loading findings")}
                        >
                            {summary && (
                                <>
                                    <Content component="p" className="diagnostics-overview-lead">
                                        <Button variant="link" isInline onClick={() => goToPage("findings")}>
                                            {summary}
                                        </Button>
                                    </Content>
                                    {list.length > 0 && (
                                        <HelperText>
                                            {memoryCount > 0 && (
                                                <HelperTextItem>
                                                    {cockpit.format(_("$0 memory"), memoryCount)}
                                                </HelperTextItem>
                                            )}
                                            {kernelCount > 0 && (
                                                <HelperTextItem>
                                                    {cockpit.format(_("$0 kernel"), kernelCount)}
                                                </HelperTextItem>
                                            )}
                                        </HelperText>
                                    )}
                                    <HelperText>
                                        <HelperTextItem>
                                            {_("Only implemented detectors are counted. This is not a health score.")}
                                        </HelperTextItem>
                                    </HelperText>
                                </>
                            )}
                        </AsyncState>
                    )}
            </CardBody>
            <CardFooter>
                <Button variant="link" isInline onClick={() => goToPage("findings")}>{_("Open Findings page")}</Button>
            </CardFooter>
        </Card>
    );
};

const SecurityOverviewCard = ({
    capabilities,
}: {
    capabilities: DiagnosticCapabilities;
}) => (
    <Card isCompact>
        <CardHeader>
            <CardTitle>
                <Title headingLevel="h3" size="md">{_("Security")}</Title>
            </CardTitle>
        </CardHeader>
        <CardBody>
            {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzeSecurity
                ? (
                    <CapabilityNotice>
                        {_("systemd-analyze security is not available, so hardening analysis cannot be opened.")}
                    </CapabilityNotice>
                )
                : (
                    <>
                        <Content component="p" className="diagnostics-overview-lead">
                            <Button variant="link" isInline onClick={() => goToPage("security")}>
                                {_("systemd hardening analysis available")}
                            </Button>
                        </Content>
                        <HelperText>
                            <HelperTextItem>
                                {_("Reviews systemd sandboxing settings for system services. This is not a CVE scan.")}
                            </HelperTextItem>
                        </HelperText>
                    </>
                )}
        </CardBody>
        <CardFooter>
            <Button variant="link" isInline onClick={() => goToPage("security")}>{_("Review services")}</Button>
        </CardFooter>
    </Card>
);

const VerificationOverviewCard = ({
    capabilities,
}: {
    capabilities: DiagnosticCapabilities;
}) => (
    <Card isCompact>
        <CardHeader>
            <CardTitle>
                <Title headingLevel="h3" size="md">{_("Verification")}</Title>
            </CardTitle>
        </CardHeader>
        <CardBody>
            {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzeVerify
                ? (
                    <CapabilityNotice>
                        {_("systemd-analyze verify is not available, so unit files cannot be checked here.")}
                    </CapabilityNotice>
                )
                : (
                    <>
                        <Content component="p" className="diagnostics-overview-lead">
                            <Button variant="link" isInline onClick={() => goToPage("verification")}>
                                {_("Unit file verification available")}
                            </Button>
                        </Content>
                        <HelperText>
                            <HelperTextItem>
                                {_("Runs systemd-analyze verify on an installed system unit. This is not a unit editor.")}
                            </HelperTextItem>
                        </HelperText>
                    </>
                )}
        </CardBody>
        <CardFooter>
            <Button variant="link" isInline onClick={() => goToPage("verification")}>{_("Verify a unit")}</Button>
        </CardFooter>
    </Card>
);

export const FailedUnitTable = ({ units }: { units: FailedUnit[] }) => (
    <Table variant="compact" gridBreakPoint="grid-md" aria-label={_("Failed units")}>
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
                        {unit.description && (
                            <HelperText>
                                <HelperTextItem>{unit.description}</HelperTextItem>
                            </HelperText>
                        )}
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

function chainHeadline(nodes: import("../types/boot").CriticalChainNode[] | undefined): string | undefined {
    if (!nodes || nodes.length === 0)
        return undefined;
    const root = nodes[0];
    if (root.activatedAtUs !== undefined)
        return cockpit.format(_("$0 @ $1"), root.unit, formatDuration(root.activatedAtUs));
    return root.unit;
}

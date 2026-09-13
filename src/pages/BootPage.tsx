import React, { useMemo, useState } from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Popover } from "@patternfly/react-core/dist/esm/components/Popover/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { TreeView, type TreeViewDataItem } from "@patternfly/react-core/dist/esm/components/TreeView/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { SortByDirection, Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import InfoCircleIcon from "@patternfly/react-icons/dist/esm/icons/info-circle-icon";

import cockpit from "cockpit";

import { flattenCriticalChain, type BootSummary, type CriticalChainNode, type CriticalPathMark, type UnitActivationTiming } from "../types/boot";
import type { DiagnosticCapabilities } from "../types/diagnostics";
import { loadBlame, loadBootSummary, loadCriticalChain } from "../providers/systemdAnalyze";
import { loadBootPlot } from "../providers/plot";
import { formatDuration } from "../utils/duration";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
import { DurationText } from "../components/DurationText";
import { PageHeader } from "../components/PageHeader";
import { BootPlotCard } from "../components/BootPlotCard";
import { UnitLink } from "../components/UnitLink";
import { useAsyncProvider } from "../app/useAsyncProvider";

const _ = cockpit.gettext;

const BLAME_PAGE_SIZE = 50;

export const BootPage = ({ capabilities, onRefresh, lastRefreshed }: {
    capabilities: DiagnosticCapabilities;
    onRefresh: () => void;
    lastRefreshed?: Date | undefined;
}) => {
    const time = useAsyncProvider(loadBootSummary, capabilities.systemdAnalyze && capabilities.systemdAnalyzeTime);
    const blame = useAsyncProvider(loadBlame, capabilities.systemdAnalyze && capabilities.systemdAnalyzeBlame);
    const chain = useAsyncProvider(loadCriticalChain, capabilities.systemdAnalyze && capabilities.systemdAnalyzeCriticalChain);
    const plot = useAsyncProvider(loadBootPlot, capabilities.systemdAnalyze && capabilities.systemdAnalyzePlot);

    const refreshAll = () => {
        time.reload();
        blame.reload();
        chain.reload();
        plot.reload();
        onRefresh();
    };

    return (
        <PageSection isWidthLimited>
            <PageHeader
                title={_("Boot")}
                titleId="diagnostics-boot"
                lastRefreshed={lastRefreshed}
                onRefresh={refreshAll}
            />

            <Flex className="pf-v6-u-mb-md" spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                <FlexItem>
                    <Content component="p" className="pf-v6-u-mb-0">
                        {_("Current boot: total time, parallel unit activation, and systemd's critical-path estimate.")}
                    </Content>
                </FlexItem>
                <FlexItem>
                    <Popover
                        headerContent={_("How to read these views")}
                        bodyContent={_("Total boot timing is how long firmware, the kernel, and userspace took. Unit activation duration is how long each unit spent activating, which happens in parallel. The critical boot path is systemd's estimate of the chain that had to finish before the default target.")}
                    >
                        <Button variant="link" isInline icon={<InfoCircleIcon />}>
                            {_("About these views")}
                        </Button>
                    </Popover>
                </FlexItem>
            </Flex>

            <div className="diagnostics-stack">
                <BootTimingCard capabilities={capabilities} state={time} />
                <BootPlotCard capabilities={capabilities} state={plot} />
                <BlameCard capabilities={capabilities} blame={blame} chain={chain} />
                <CriticalChainCard capabilities={capabilities} state={chain} />
            </div>
        </PageSection>
    );
};

const BootTimingCard = ({
    capabilities,
    state,
}: {
    capabilities: DiagnosticCapabilities;
    state: ReturnType<typeof useAsyncProvider<BootSummary>>;
}) => (
    <Card isCompact>
        <CardHeader>
            <CardTitle>
                <Title headingLevel="h3" size="md">{_("Total boot timing")}</Title>
            </CardTitle>
        </CardHeader>
        <CardBody>
            {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzeTime
                ? (
                    <CapabilityNotice>
                        {_("systemd-analyze is not available, so boot-phase timing cannot be collected.")}
                    </CapabilityNotice>
                )
                : (
                    <AsyncState
                        status={state.status}
                        error={state.error}
                        loadingLabel={_("Loading boot timing")}
                    >
                        {state.data && <BootPhaseList summary={state.data} />}
                    </AsyncState>
                )}
        </CardBody>
    </Card>
);

const BootPhaseList = ({ summary }: { summary: BootSummary }) => {
    const phases: { label: string; value?: number | undefined }[] = [
        { label: _("Firmware"), value: summary.firmwareUs },
        { label: _("Loader"), value: summary.loaderUs },
        { label: _("Kernel"), value: summary.kernelUs },
        { label: _("Initrd"), value: summary.initrdUs },
        { label: _("Userspace"), value: summary.userspaceUs },
    ];
    const visible = phases.filter(phase => phase.value !== undefined);

    return (
        <>
            {summary.totalUs !== undefined && (
                <div className="diagnostics-boot-total">
                    <Content component="small" className="pf-v6-u-color-200">{_("Total boot time")}</Content>
                    <div className="diagnostics-boot-total-value">
                        <DurationText valueUs={summary.totalUs} />
                    </div>
                </div>
            )}
            <HelperText className="pf-v6-u-mb-md">
                <HelperTextItem>
                    {_("From systemd-analyze time for the current boot. Virtual machines and containers often omit firmware or loader.")}
                </HelperTextItem>
            </HelperText>
            {visible.length === 0 && summary.totalUs === undefined
                ? <p>{_("No boot-phase timings were reported.")}</p>
                : (
                    <DescriptionList
                        isCompact
                        isHorizontal
                        columnModifier={{ default: "1Col", sm: "2Col", lg: "3Col" }}
                    >
                        {visible.map(phase => (
                            <DescriptionListGroup key={phase.label}>
                                <DescriptionListTerm>{phase.label}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <DurationText valueUs={phase.value as number} />
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                        ))}
                        {summary.target && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Default target")}</DescriptionListTerm>
                                <DescriptionListDescription>{summary.target}</DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                        {summary.targetReachedUs !== undefined && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>{_("Target reached")}</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {cockpit.format(_("after $0"), formatDuration(summary.targetReachedUs))}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                    </DescriptionList>
                )}
        </>
    );
};

const BlameCard = ({
    capabilities,
    blame,
    chain,
}: {
    capabilities: DiagnosticCapabilities;
    blame: ReturnType<typeof useAsyncProvider<UnitActivationTiming[]>>;
    chain: ReturnType<typeof useAsyncProvider<CriticalChainNode[]>>;
}) => {
    const criticalUnits = useMemo(() => {
        if (chain.status !== "ready" || !chain.data)
            return null;
        return new Set(flattenCriticalChain(chain.data));
    }, [chain.status, chain.data]);

    return (
        <Card isCompact>
            <CardHeader>
                <CardTitle>
                    <Title headingLevel="h3" size="md">{_("Unit activation duration")}</Title>
                </CardTitle>
            </CardHeader>
            <CardBody>
                <Alert
                    className="pf-v6-u-mb-md"
                    variant="info"
                    isInline
                    isPlain
                    title={_("Activation time is not the same as boot delay")}
                >
                    {_("Units start in parallel, so the slowest unit here did not necessarily delay boot. Some unit types never pass through an activating state and are not measured usefully by blame.")}
                </Alert>
                {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzeBlame
                    ? (
                        <CapabilityNotice>
                            {_("systemd-analyze blame is not available on this system.")}
                        </CapabilityNotice>
                    )
                    : (
                        <AsyncState
                            status={blame.status}
                            error={blame.error}
                            isEmpty={blame.status === "ready" && (blame.data?.length ?? 0) === 0}
                            emptyTitle={_("No unit activation timings")}
                            emptyBody={_("systemd-analyze blame returned no running units.")}
                            loadingLabel={_("Loading unit activation timings")}
                        >
                            {blame.data && (
                                <BlameTable
                                    timings={blame.data}
                                    criticalUnits={criticalUnits}
                                />
                            )}
                        </AsyncState>
                    )}
            </CardBody>
        </Card>
    );
};

const BlameTable = ({
    timings,
    criticalUnits,
}: {
    timings: UnitActivationTiming[];
    criticalUnits: Set<string> | null;
}) => {
    const [sortIndex, setSortIndex] = useState(1);
    const [sortDirection, setSortDirection] = useState<SortByDirection>(SortByDirection.desc);
    const [limit, setLimit] = useState(BLAME_PAGE_SIZE);

    const sorted = useMemo(() => {
        const copy = [...timings];
        copy.sort((a, b) => {
            let result = 0;
            if (sortIndex === 0)
                result = a.unit.localeCompare(b.unit);
            else if (sortIndex === 1)
                result = a.durationUs - b.durationUs;
            else
                result = markValue(criticalMark(a.unit, criticalUnits)) - markValue(criticalMark(b.unit, criticalUnits));
            return sortDirection === SortByDirection.asc ? result : -result;
        });
        return copy;
    }, [timings, sortIndex, sortDirection, criticalUnits]);

    const visible = sorted.slice(0, limit);

    return (
        <>
            <div className="diagnostics-scroll">
                <Table variant="compact" gridBreakPoint="grid-md" aria-label={_("Unit activation timings")}>
                    <Thead>
                        <Tr>
                            <Th
                                sort={{
                                    sortBy: { index: sortIndex, direction: sortDirection },
                                    onSort: (_event, index, direction) => {
                                        setSortIndex(index);
                                        setSortDirection(direction);
                                    },
                                    columnIndex: 0,
                                }}
                            >
                                {_("Unit")}
                            </Th>
                            <Th
                                sort={{
                                    sortBy: { index: sortIndex, direction: sortDirection },
                                    onSort: (_event, index, direction) => {
                                        setSortIndex(index);
                                        setSortDirection(direction);
                                    },
                                    columnIndex: 1,
                                }}
                            >
                                {_("Activation time")}
                            </Th>
                            <Th
                                sort={{
                                    sortBy: { index: sortIndex, direction: sortDirection },
                                    onSort: (_event, index, direction) => {
                                        setSortIndex(index);
                                        setSortDirection(direction);
                                    },
                                    columnIndex: 2,
                                }}
                            >
                                {_("On critical path")}
                            </Th>
                        </Tr>
                    </Thead>
                    <Tbody>
                        {visible.map(row => {
                            const mark = criticalMark(row.unit, criticalUnits);
                            return (
                                <Tr key={row.unit}>
                                    <Td dataLabel={_("Unit")}>
                                        <div>{row.unit}</div>
                                        <UnitLink unit={row.unit} />
                                    </Td>
                                    <Td dataLabel={_("Activation time")}>
                                        <DurationText valueUs={row.durationUs} />
                                    </Td>
                                    <Td dataLabel={_("On critical path")}>
                                        <CriticalPathLabel mark={mark} />
                                    </Td>
                                </Tr>
                            );
                        })}
                    </Tbody>
                </Table>
            </div>
            {sorted.length > limit && (
                <Button className="pf-v6-u-mt-md" variant="link" onClick={() => setLimit(sorted.length)}>
                    {cockpit.format(_("Show all $0 units"), String(sorted.length))}
                </Button>
            )}
        </>
    );
};

const CriticalPathLabel = ({ mark }: { mark: CriticalPathMark }) => {
    if (mark === "yes")
        return <Label color="green" isCompact>{_("Yes")}</Label>;
    if (mark === "no")
        return <Label color="grey" isCompact>{_("No")}</Label>;
    return <Label color="blue" isCompact>{_("Unknown")}</Label>;
};

const CriticalChainCard = ({
    capabilities,
    state,
}: {
    capabilities: DiagnosticCapabilities;
    state: ReturnType<typeof useAsyncProvider<CriticalChainNode[]>>;
}) => (
    <Card isCompact>
        <CardHeader>
            <CardTitle>
                <Title headingLevel="h3" size="md">{_("Critical boot path")}</Title>
            </CardTitle>
        </CardHeader>
        <CardBody>
            <Alert
                className="pf-v6-u-mb-md"
                variant="info"
                isInline
                isPlain
                title={_("The critical chain is an estimate, not a complete causal proof")}
            >
                {_("Times after @ are when the unit became active or started; times after + are how long it spent activating. Parallel execution, socket activation, skipped activating states, and jobs or timeouts can make this output misleading.")}
            </Alert>
            {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzeCriticalChain
                ? (
                    <CapabilityNotice>
                        {_("systemd-analyze critical-chain is not available on this system.")}
                    </CapabilityNotice>
                )
                : (
                    <AsyncState
                        status={state.status}
                        error={state.error}
                        isEmpty={state.status === "ready" && (state.data?.length ?? 0) === 0}
                        emptyTitle={_("No critical chain")}
                        emptyBody={_("systemd-analyze critical-chain did not report a unit tree.")}
                        loadingLabel={_("Loading critical chain")}
                    >
                        {state.data && <ChainTree nodes={state.data} />}
                    </AsyncState>
                )}
        </CardBody>
    </Card>
);

const ChainTree = ({ nodes }: { nodes: CriticalChainNode[] }) => (
    <TreeView
        data={toTreeItems(nodes)}
        aria-label={_("Critical boot path")}
        hasGuides
        defaultAllExpanded
        variant="compactNoBackground"
    />
);

function toTreeItems(nodes: CriticalChainNode[], prefix = "n"): TreeViewDataItem[] {
    return nodes.map((node, index) => {
        const id = `${prefix}-${index}`;
        const item: TreeViewDataItem = {
            id,
            name: (
                <span className="diagnostics-chain-node">
                    <span className="diagnostics-chain-unit">{node.unit}</span>
                    {node.activatedAtUs !== undefined && (
                        <Label isCompact>{`@ ${formatDuration(node.activatedAtUs)}`}</Label>
                    )}
                    {node.activationDurationUs !== undefined && (
                        <Label isCompact color="blue">{`+ ${formatDuration(node.activationDurationUs)}`}</Label>
                    )}
                </span>
            ),
        };
        if (node.children.length > 0)
            item.children = toTreeItems(node.children, id);
        return item;
    });
}

function criticalMark(unit: string, criticalUnits: Set<string> | null): CriticalPathMark {
    if (!criticalUnits)
        return "unknown";
    return criticalUnits.has(unit) ? "yes" : "no";
}

function markValue(mark: CriticalPathMark): number {
    if (mark === "yes")
        return 2;
    if (mark === "no")
        return 1;
    return 0;
}

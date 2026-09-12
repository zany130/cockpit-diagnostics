import React, { useMemo, useState } from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { SortByDirection, Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import cockpit from "cockpit";

import { flattenCriticalChain, type BootSummary, type CriticalChainNode, type CriticalPathMark, type UnitActivationTiming } from "../types/boot";
import type { DiagnosticCapabilities } from "../types/diagnostics";
import { loadBlame, loadBootSummary, loadCriticalChain } from "../providers/systemdAnalyze";
import { formatDuration, formatDurationExact } from "../utils/duration";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
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

    const refreshAll = () => {
        time.reload();
        blame.reload();
        chain.reload();
        onRefresh();
    };

    return (
        <PageSection>
            <Flex justifyContent={{ default: "justifyContentSpaceBetween" }} alignItems={{ default: "alignItemsCenter" }}>
                <FlexItem>
                    <Title headingLevel="h2" id="diagnostics-boot">{_("Boot")}</Title>
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

            <p className="pf-v6-u-mt-sm pf-v6-u-mb-lg">
                {_("These three views answer different questions. Total boot timing is how long firmware, the kernel, and userspace took. Unit activation duration is how long each unit spent activating, which happens in parallel. The critical boot path is systemd's estimate of the chain that had to finish before the default target.")}
            </p>

            <BootTimingCard capabilities={capabilities} state={time} />
            <BlameCard capabilities={capabilities} blame={blame} chain={chain} />
            <CriticalChainCard capabilities={capabilities} state={chain} />
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
    <Card className="pf-v6-u-mb-md" isPlain>
        <CardHeader>
            <CardTitle>{_("Total boot timing")}</CardTitle>
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
        { label: _("Total"), value: summary.totalUs },
    ];
    const visible = phases.filter(phase => phase.value !== undefined);

    return (
        <>
            <p className="pf-v6-u-mb-md">
                {_("Values come from systemd-analyze time for the current boot. Virtual machines and containers often omit firmware or loader phases.")}
            </p>
            {visible.length === 0
                ? <p>{_("No boot-phase timings were reported.")}</p>
                : (
                    <DescriptionList isHorizontal>
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
                                <DescriptionListDescription>
                                    {summary.target}
                                    {summary.targetReachedUs !== undefined && (
                                        <>
                                            {" — "}
                                            {cockpit.format(_("reached after $0"), formatDuration(summary.targetReachedUs))}
                                        </>
                                    )}
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
        <Card className="pf-v6-u-mb-md" isPlain>
            <CardHeader>
                <CardTitle>{_("Unit activation duration")}</CardTitle>
            </CardHeader>
            <CardBody>
                <Alert
                    className="pf-v6-u-mb-md"
                    variant="info"
                    isInline
                    title={_("Activation time is not the same as boot delay")}
                >
                    {_("systemd-analyze blame lists how long each unit spent in the activating state. Units start in parallel, so the slowest unit here did not necessarily delay boot. Some unit types never pass through an activating state and are not measured usefully by blame.")}
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
            <Table variant="compact" aria-label={_("Unit activation timings")}>
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
                                <Td dataLabel={_("On critical path")}>{criticalLabel(mark)}</Td>
                            </Tr>
                        );
                    })}
                </Tbody>
            </Table>
            {sorted.length > limit && (
                <Button className="pf-v6-u-mt-md" variant="link" onClick={() => setLimit(sorted.length)}>
                    {cockpit.format(_("Show all $0 units"), String(sorted.length))}
                </Button>
            )}
        </>
    );
};

const CriticalChainCard = ({
    capabilities,
    state,
}: {
    capabilities: DiagnosticCapabilities;
    state: ReturnType<typeof useAsyncProvider<CriticalChainNode[]>>;
}) => (
    <Card isPlain>
        <CardHeader>
            <CardTitle>{_("Critical boot path")}</CardTitle>
        </CardHeader>
        <CardBody>
            <Alert
                className="pf-v6-u-mb-md"
                variant="info"
                isInline
                title={_("The critical chain is an estimate, not a complete causal proof")}
            >
                {_("systemd-analyze critical-chain prints a tree of units on the path to the default target. Times after @ are when the unit became active or started; times after + are how long it spent activating. The output can be misleading because of parallel execution, socket activation, units that skip the activating state, and jobs or timeouts that are not represented here.")}
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
    <ul className="diagnostics-chain">
        {nodes.map((node, index) => (
            <li key={node.unit + String(index)}>
                <span className="diagnostics-chain-unit">{node.unit}</span>
                {node.activatedAtUs !== undefined && (
                    <span title={formatDurationExact(node.activatedAtUs)}>
                        {" @ "}{formatDuration(node.activatedAtUs)}
                    </span>
                )}
                {node.activationDurationUs !== undefined && (
                    <span title={formatDurationExact(node.activationDurationUs)}>
                        {" + "}{formatDuration(node.activationDurationUs)}
                    </span>
                )}
                {node.children.length > 0 && <ChainTree nodes={node.children} />}
            </li>
        ))}
    </ul>
);

const DurationText = ({ valueUs }: { valueUs: number }) => (
    <span title={formatDurationExact(valueUs)}>{formatDuration(valueUs)}</span>
);

function criticalMark(unit: string, criticalUnits: Set<string> | null): CriticalPathMark {
    if (!criticalUnits)
        return "unknown";
    return criticalUnits.has(unit) ? "yes" : "no";
}

function criticalLabel(mark: CriticalPathMark): string {
    if (mark === "yes")
        return _("Yes");
    if (mark === "no")
        return _("No");
    return _("Unknown");
}

function markValue(mark: CriticalPathMark): number {
    if (mark === "yes")
        return 2;
    if (mark === "no")
        return 1;
    return 0;
}

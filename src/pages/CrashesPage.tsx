import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import {
    Drawer,
    DrawerActions,
    DrawerCloseButton,
    DrawerContent,
    DrawerContentBody,
    DrawerHead,
    DrawerPanelBody,
    DrawerPanelContent,
} from "@patternfly/react-core/dist/esm/components/Drawer/index.js";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { SortByDirection, Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";

import cockpit from "cockpit";

import type { DiagnosticCapabilities } from "../types/diagnostics";
import {
    coredumpLogsUnit,
    coredumpProcessLabel,
    type CoreStorageState,
    type CoredumpEntry,
} from "../types/crashes";
import { loadCoredumpDetails, loadCoredumps } from "../providers/coredumps";
import { jumpToUnitLogs } from "../utils/cockpitLinks";
import { ProviderError } from "../types/providers";
import { normalizeSpawnError } from "../utils/errors";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
import { PageHeader } from "../components/PageHeader";
import { useAsyncProvider } from "../app/useAsyncProvider";

const _ = cockpit.gettext;

export const CrashesPage = ({ capabilities, onRefresh, lastRefreshed }: {
    capabilities: DiagnosticCapabilities;
    onRefresh: () => void;
    lastRefreshed?: Date | undefined;
}) => {
    const dumps = useAsyncProvider(loadCoredumps, capabilities.coredumpctl);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selected = dumps.data?.find(entry => entry.id === selectedId);

    const refreshAll = () => {
        setSelectedId(null);
        dumps.reload();
        onRefresh();
    };

    return (
        <PageSection isWidthLimited>
            <PageHeader
                title={_("Crashes")}
                titleId="diagnostics-crashes"
                lastRefreshed={lastRefreshed}
                onRefresh={refreshAll}
            />
            <Content component="p" className="pf-v6-u-mb-md">
                {_("Coredumps recorded for the current boot. These are crash records, not a health score.")}
            </Content>
            <Card isCompact>
                <CardBody>
                    {!capabilities.coredumpctl
                        ? (
                            <CapabilityNotice>
                                {_("coredumpctl is not available, so coredumps cannot be listed.")}
                            </CapabilityNotice>
                        )
                        : (
                            <AsyncState
                                status={dumps.status}
                                error={dumps.error}
                                isEmpty={dumps.status === "ready" && (dumps.data?.length ?? 0) === 0}
                                emptyTitle={_("No coredumps this boot")}
                                emptyBody={_("coredumpctl did not report any coredumps for the current boot.")}
                                loadingLabel={_("Loading coredumps")}
                            >
                                {dumps.data && dumps.data.length > 0 && (
                                    <CrashDrawer
                                        entries={dumps.data}
                                        selected={selected}
                                        onSelect={setSelectedId}
                                        onClose={() => setSelectedId(null)}
                                    />
                                )}
                            </AsyncState>
                        )}
                </CardBody>
            </Card>
        </PageSection>
    );
};

const CrashDrawer = ({
    entries,
    selected,
    onSelect,
    onClose,
}: {
    entries: CoredumpEntry[];
    selected?: CoredumpEntry | undefined;
    onSelect: (id: string) => void;
    onClose: () => void;
}) => (
    <Drawer isExpanded={selected !== undefined} position="end">
        <DrawerContent
            panelContent={
                <DrawerPanelContent
                    id="crash-detail-panel"
                    widths={{ default: "width_100", lg: "width_50" }}
                >
                    {selected && (
                        <>
                            <DrawerHead>
                                <Title headingLevel="h3" size="md" id="crash-detail-title">
                                    {coredumpProcessLabel(selected)}
                                </Title>
                                <DrawerActions>
                                    <DrawerCloseButton onClose={onClose} />
                                </DrawerActions>
                            </DrawerHead>
                            <DrawerPanelBody>
                                <CrashDetail entry={selected} />
                            </DrawerPanelBody>
                        </>
                    )}
                </DrawerPanelContent>
            }
        >
            <DrawerContentBody>
                <CrashTable entries={entries} selectedId={selected?.id} onSelect={onSelect} />
            </DrawerContentBody>
        </DrawerContent>
    </Drawer>
);

const CrashTable = ({
    entries,
    selectedId,
    onSelect,
}: {
    entries: CoredumpEntry[];
    selectedId?: string | undefined;
    onSelect: (id: string) => void;
}) => {
    const [sortIndex, setSortIndex] = useState(0);
    const [sortDirection, setSortDirection] = useState<SortByDirection>(SortByDirection.desc);

    const sorted = useMemo(() => {
        const copy = [...entries];
        copy.sort((a, b) => {
            let result = 0;
            if (sortIndex === 0)
                result = (a.timestampUs ?? 0) - (b.timestampUs ?? 0);
            else if (sortIndex === 1)
                result = coredumpProcessLabel(a).localeCompare(coredumpProcessLabel(b));
            else if (sortIndex === 2)
                result = (a.pid ?? 0) - (b.pid ?? 0);
            else if (sortIndex === 3)
                result = (a.signal ?? 0) - (b.signal ?? 0);
            else
                result = storageRank(a) - storageRank(b);
            return sortDirection === SortByDirection.asc ? result : -result;
        });
        return copy;
    }, [entries, sortIndex, sortDirection]);

    const sort = (columnIndex: number) => ({
        sortBy: { index: sortIndex, direction: sortDirection },
        onSort: (_event: unknown, index: number, direction: SortByDirection) => {
            setSortIndex(index);
            setSortDirection(direction);
        },
        columnIndex,
    });

    return (
        <div className="diagnostics-scroll">
            <Table variant="compact" gridBreakPoint="grid-md" aria-label={_("Coredumps")}>
                <Thead>
                    <Tr>
                        <Th sort={sort(0)}>{_("Time")}</Th>
                        <Th sort={sort(1)}>{_("Process")}</Th>
                        <Th sort={sort(2)}>{_("PID")}</Th>
                        <Th sort={sort(3)}>{_("Signal")}</Th>
                        <Th sort={sort(4)}>{_("Core")}</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {sorted.map(entry => (
                        <Tr
                            key={entry.id}
                            isClickable
                            isRowSelected={entry.id === selectedId}
                            onRowClick={() => onSelect(entry.id)}
                        >
                            <Td dataLabel={_("Time")}>{formatTimestamp(entry.timestampUs)}</Td>
                            <Td dataLabel={_("Process")}>
                                <div>{coredumpProcessLabel(entry)}</div>
                                {entry.executable && entry.executable !== coredumpProcessLabel(entry) && (
                                    <HelperText>
                                        <HelperTextItem>{entry.executable}</HelperTextItem>
                                    </HelperText>
                                )}
                            </Td>
                            <Td dataLabel={_("PID")}>{entry.pid ?? "—"}</Td>
                            <Td dataLabel={_("Signal")}>{signalLabel(entry)}</Td>
                            <Td dataLabel={_("Core")}>
                                <CoreLabel state={entry.storageState} />
                            </Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </div>
    );
};

const CrashDetail = ({ entry }: { entry: CoredumpEntry }) => {
    const [detail, setDetail] = useState<CoredumpEntry>(entry);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [error, setError] = useState<ProviderError | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        setDetail(entry);
        setStatus("loading");
        setError(undefined);
        loadCoredumpDetails(entry).then(value => {
            if (cancelled)
                return;
            setDetail(value);
            setStatus("ready");
        })
                .catch(exc => {
                    if (cancelled)
                        return;
                    setDetail(entry);
                    setError(normalizeSpawnError(exc));
                    setStatus("error");
                });
        return () => {
            cancelled = true;
        };
    }, [entry]);

    const logsUnit = coredumpLogsUnit(detail);
    const extra = extraFields(detail);

    return (
        <>
            {status === "loading" && (
                <HelperText className="pf-v6-u-mb-md">
                    <HelperTextItem>{_("Loading crash metadata")}</HelperTextItem>
                </HelperText>
            )}
            {status === "error" && error && (
                <HelperText className="pf-v6-u-mb-md">
                    <HelperTextItem variant="warning">
                        {cockpit.format(_("Could not load extra metadata: $0"), error.message)}
                    </HelperTextItem>
                </HelperText>
            )}
            <DescriptionList isCompact isHorizontal>
                <DetailItem term={_("Process")} value={coredumpProcessLabel(detail)} />
                <DetailItem term={_("Executable")} value={detail.executable} />
                <DetailItem term={_("Command")} value={detail.command} />
                <DetailItem term={_("PID")} value={detail.pid !== undefined ? String(detail.pid) : undefined} />
                <DetailItem term={_("User")} value={userLabel(detail)} />
                <DetailItem term={_("Group")} value={groupLabel(detail)} />
                <DetailItem term={_("Signal")} value={signalLabel(detail)} />
                <DetailItem term={_("Time")} value={formatTimestamp(detail.timestampUs)} />
                <DetailItem term={_("Unit")} value={detail.unit} />
                <DetailItem term={_("Boot")} value={bootLabel(detail)} />
                <DetailItem term={_("Core")} value={coreDetail(detail)} />
            </DescriptionList>
            {logsUnit && (
                <div className="pf-v6-u-mt-md">
                    <Button variant="link" isInline onClick={() => jumpToUnitLogs(logsUnit)}>
                        {_("View logs")}
                    </Button>
                </div>
            )}
            {extra.length > 0 && (
                <ExpandableSection className="pf-v6-u-mt-md" toggleText={_("Additional metadata")}>
                    <DescriptionList isCompact isHorizontal>
                        {extra.map(item => (
                            <DetailItem key={item.term} term={item.term} value={item.value} />
                        ))}
                    </DescriptionList>
                </ExpandableSection>
            )}
        </>
    );
};

const DetailItem = ({ term, value }: { term: string; value?: string | undefined }) => {
    if (!value)
        return null;
    return (
        <DescriptionListGroup>
            <DescriptionListTerm>{term}</DescriptionListTerm>
            <DescriptionListDescription>{value}</DescriptionListDescription>
        </DescriptionListGroup>
    );
};

const CoreLabel = ({ state }: { state?: CoreStorageState | undefined }) => {
    if (state === "present" || state === "journal")
        return <Label color="green" isCompact>{_("Stored")}</Label>;
    if (state === "truncated")
        return <Label color="orange" isCompact>{_("Truncated")}</Label>;
    if (state === "missing")
        return <Label color="grey" isCompact>{_("Removed")}</Label>;
    if (state === "none")
        return <Label color="grey" isCompact>{_("Not stored")}</Label>;
    if (state === "error" || state === "inaccessible")
        return <Label color="orange" isCompact>{_("Inaccessible")}</Label>;
    return <Label color="grey" isCompact>{_("Unknown")}</Label>;
};

function extraFields(entry: CoredumpEntry): { term: string; value: string }[] {
    const items: { term: string; value: string }[] = [];
    if (entry.userUnit)
        items.push({ term: _("User unit"), value: entry.userUnit });
    if (entry.slice)
        items.push({ term: _("Slice"), value: entry.slice });
    if (entry.cgroup)
        items.push({ term: _("Control group"), value: entry.cgroup });
    if (entry.session)
        items.push({ term: _("Session"), value: entry.session });
    if (entry.hostname)
        items.push({ term: _("Hostname"), value: entry.hostname });
    if (entry.machineId)
        items.push({ term: _("Machine ID"), value: entry.machineId });
    if (entry.storagePath)
        items.push({ term: _("Storage path"), value: entry.storagePath });
    if (entry.packageName)
        items.push({ term: _("Package"), value: entry.packageName });
    if (entry.sizeBytes !== undefined)
        items.push({ term: _("Size"), value: formatBytes(entry.sizeBytes) });
    if (entry.gid !== undefined && !entry.group)
        items.push({ term: _("GID"), value: String(entry.gid) });
    if (entry.ownerUid !== undefined)
        items.push({ term: _("Owner UID"), value: String(entry.ownerUid) });
    return items;
}

function signalLabel(entry: CoredumpEntry): string {
    if (entry.signalName && entry.signal !== undefined)
        return cockpit.format(_("$0 ($1)"), entry.signalName, String(entry.signal));
    if (entry.signalName)
        return entry.signalName;
    if (entry.signal !== undefined)
        return String(entry.signal);
    return "—";
}

function userLabel(entry: CoredumpEntry): string | undefined {
    if (entry.user && entry.uid !== undefined)
        return cockpit.format(_("$0 (UID $1)"), entry.user, String(entry.uid));
    if (entry.user)
        return entry.user;
    if (entry.uid !== undefined)
        return cockpit.format(_("UID $0"), String(entry.uid));
    return undefined;
}

function groupLabel(entry: CoredumpEntry): string | undefined {
    if (entry.group && entry.gid !== undefined)
        return cockpit.format(_("$0 (GID $1)"), entry.group, String(entry.gid));
    if (entry.group)
        return entry.group;
    if (entry.gid !== undefined)
        return cockpit.format(_("GID $0"), String(entry.gid));
    return undefined;
}

function bootLabel(entry: CoredumpEntry): string | undefined {
    if (entry.currentBoot && entry.bootId)
        return cockpit.format(_("Current boot ($0)"), entry.bootId);
    if (entry.currentBoot)
        return _("Current boot");
    if (entry.bootId)
        return entry.bootId;
    return undefined;
}

function coreDetail(entry: CoredumpEntry): string {
    switch (entry.storageState) {
    case "present":
        return _("Core file is stored");
    case "journal":
        return _("Core is stored in the journal");
    case "truncated":
        return _("Core was stored but truncated");
    case "missing":
        return _("Metadata is present; the core file has been removed");
    case "none":
        return _("No core file was stored");
    case "error":
    case "inaccessible":
        return _("The core file cannot be accessed");
    default:
        return _("Core storage status is unknown");
    }
}

function formatTimestamp(timestampUs?: number): string {
    if (timestampUs === undefined)
        return "—";
    return new Date(timestampUs / 1000).toLocaleString();
}

function formatBytes(bytes: number): string {
    if (bytes < 1024)
        return cockpit.format(_("$0 B"), String(bytes));
    const units = ["KiB", "MiB", "GiB", "TiB"];
    let value = bytes;
    let unit = "B";
    for (const next of units) {
        if (value < 1024)
            break;
        value = value / 1024;
        unit = next;
    }
    const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
    return `${rounded} ${unit}`;
}

function storageRank(entry: CoredumpEntry): number {
    if (entry.storageState === "present" || entry.storageState === "journal")
        return 3;
    if (entry.storageState === "truncated")
        return 2;
    if (entry.storageState === "missing" || entry.storageState === "none")
        return 1;
    return 0;
}

import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection/index.js";
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
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core/dist/esm/components/Toolbar/index.js";
import { SortByDirection, Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import CheckIcon from "@patternfly/react-icons/dist/esm/icons/check-icon";
import MinusIcon from "@patternfly/react-icons/dist/esm/icons/minus-icon";
import TimesIcon from "@patternfly/react-icons/dist/esm/icons/times-icon";

import cockpit from "cockpit";

import type { DiagnosticCapabilities } from "../types/diagnostics";
import {
    assessmentRank,
    type SecurityCheckState,
    type ServiceSecurityCheck,
    type ServiceSecurityDetail,
    type ServiceSecuritySummary,
} from "../types/security";
import { loadSecurityDetails, loadSecuritySummaries } from "../providers/security";
import { jumpToService } from "../utils/cockpitLinks";
import { ProviderError } from "../types/providers";
import { normalizeSpawnError } from "../utils/errors";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
import { PageHeader } from "../components/PageHeader";
import { useAsyncProvider } from "../app/useAsyncProvider";

const _ = cockpit.gettext;

const ALL_ASSESSMENTS = "";

export const SecurityPage = ({ capabilities, onRefresh, lastRefreshed }: {
    capabilities: DiagnosticCapabilities;
    onRefresh: () => void;
    lastRefreshed?: Date | undefined;
}) => {
    const summaries = useAsyncProvider(
        loadSecuritySummaries,
        capabilities.systemdAnalyze && capabilities.systemdAnalyzeSecurity
    );
    const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
    const [assessmentFilter, setAssessmentFilter] = useState(ALL_ASSESSMENTS);
    const [detailCache, setDetailCache] = useState<Record<string, ServiceSecurityDetail>>({});
    const storeDetail = useCallback((detail: ServiceSecurityDetail) => {
        setDetailCache(current => ({ ...current, [detail.unit]: detail }));
    }, []);

    const selected = summaries.data?.find(row => row.unit === selectedUnit);

    const refreshAll = () => {
        setSelectedUnit(null);
        setDetailCache({});
        summaries.reload();
        onRefresh();
    };

    const assessments = useMemo(() => {
        const values = new Set<string>();
        for (const row of summaries.data ?? []) {
            if (row.assessment)
                values.add(row.assessment);
        }
        return [...values].sort((a, b) => assessmentRank(b) - assessmentRank(a) || a.localeCompare(b));
    }, [summaries.data]);

    const filtered = useMemo(() => {
        const rows = summaries.data ?? [];
        if (!assessmentFilter)
            return rows;
        return rows.filter(row => row.assessment === assessmentFilter);
    }, [summaries.data, assessmentFilter]);

    return (
        <PageSection isWidthLimited>
            <PageHeader
                title={_("Security")}
                titleId="diagnostics-security"
                lastRefreshed={lastRefreshed}
                onRefresh={refreshAll}
            />
            <Title headingLevel="h3" size="md" className="pf-v6-u-mb-sm">
                {_("systemd service hardening")}
            </Title>
            <Alert
                className="pf-v6-u-mb-md"
                variant="info"
                isInline
                title={_("This is systemd sandboxing analysis, not a vulnerability scan")}
            >
                <p>
                    {_("systemd-analyze security measures how strongly a system service uses systemd sandboxing and security-related settings. A higher exposure number means fewer of those protections are applied.")}
                </p>
                <p>
                    {_("A high exposure value does not prove a service has a vulnerability. A low exposure value does not prove a service is safe or trustworthy.")}
                </p>
            </Alert>
            <Card isCompact>
                <CardBody>
                    {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzeSecurity
                        ? (
                            <CapabilityNotice>
                                {_("systemd-analyze security is not available, so service hardening cannot be listed.")}
                            </CapabilityNotice>
                        )
                        : (
                            <AsyncState
                                status={summaries.status}
                                error={summaries.error}
                                isEmpty={summaries.status === "ready" && (summaries.data?.length ?? 0) === 0}
                                emptyTitle={_("No system services analyzed")}
                                emptyBody={_("systemd-analyze security did not report any loaded long-running system services.")}
                                loadingLabel={_("Loading systemd security analysis")}
                            >
                                {summaries.data && summaries.data.length > 0 && (
                                    <>
                                        <HelperText className="pf-v6-u-mb-md">
                                            <HelperTextItem>
                                                {_("System services. systemd inspects currently loaded long-running .service units on the system manager.")}
                                            </HelperTextItem>
                                        </HelperText>
                                        <SecurityDrawer
                                            rows={filtered}
                                            allCount={summaries.data.length}
                                            assessments={assessments}
                                            assessmentFilter={assessmentFilter}
                                            onFilter={setAssessmentFilter}
                                            selected={selected}
                                            onSelect={setSelectedUnit}
                                            onClose={() => setSelectedUnit(null)}
                                            detailCache={detailCache}
                                            onDetail={storeDetail}
                                        />
                                    </>
                                )}
                            </AsyncState>
                        )}
                </CardBody>
            </Card>
        </PageSection>
    );
};

const SecurityDrawer = ({
    rows,
    allCount,
    assessments,
    assessmentFilter,
    onFilter,
    selected,
    onSelect,
    onClose,
    detailCache,
    onDetail,
}: {
    rows: ServiceSecuritySummary[];
    allCount: number;
    assessments: string[];
    assessmentFilter: string;
    onFilter: (value: string) => void;
    selected?: ServiceSecuritySummary | undefined;
    onSelect: (unit: string) => void;
    onClose: () => void;
    detailCache: Record<string, ServiceSecurityDetail>;
    onDetail: (detail: ServiceSecurityDetail) => void;
}) => (
    <Drawer isExpanded={selected !== undefined} position="end">
        <DrawerContent
            panelContent={
                <DrawerPanelContent
                    id="security-detail-panel"
                    widths={{ default: "width_100", lg: "width_50" }}
                >
                    {selected && (
                        <>
                            <DrawerHead>
                                <Title headingLevel="h3" size="md" id="security-detail-title">
                                    {selected.unit}
                                </Title>
                                <DrawerActions>
                                    <DrawerCloseButton onClose={onClose} />
                                </DrawerActions>
                            </DrawerHead>
                            <DrawerPanelBody>
                                <SecurityDetail
                                    summary={selected}
                                    cached={detailCache[selected.unit]}
                                    onDetail={onDetail}
                                />
                            </DrawerPanelBody>
                        </>
                    )}
                </DrawerPanelContent>
            }
        >
            <DrawerContentBody>
                <Toolbar className="pf-v6-u-mb-sm" id="security-filter-toolbar">
                    <ToolbarContent>
                        <ToolbarItem>
                            <span id="security-assessment-filter-label">{_("Assessment")}</span>
                        </ToolbarItem>
                        <ToolbarItem>
                            <FormSelect
                                id="security-assessment-filter"
                                aria-label={_("Assessment")}
                                aria-labelledby="security-assessment-filter-label"
                                value={assessmentFilter}
                                onChange={(_event, value) => onFilter(value)}
                            >
                                <FormSelectOption value={ALL_ASSESSMENTS} label={cockpit.format(_("All ($0)"), allCount)} />
                                {assessments.map(value => (
                                    <FormSelectOption key={value} value={value} label={value} />
                                ))}
                            </FormSelect>
                        </ToolbarItem>
                    </ToolbarContent>
                </Toolbar>
                {rows.length === 0
                    ? (
                        <HelperText>
                            <HelperTextItem>{_("No services match this assessment.")}</HelperTextItem>
                        </HelperText>
                    )
                    : (
                        <SecurityTable rows={rows} selectedUnit={selected?.unit} onSelect={onSelect} />
                    )}
            </DrawerContentBody>
        </DrawerContent>
    </Drawer>
);

const SecurityTable = ({
    rows,
    selectedUnit,
    onSelect,
}: {
    rows: ServiceSecuritySummary[];
    selectedUnit?: string | undefined;
    onSelect: (unit: string) => void;
}) => {
    const [sortIndex, setSortIndex] = useState(1);
    const [sortDirection, setSortDirection] = useState<SortByDirection>(SortByDirection.desc);

    const sorted = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            let result = 0;
            if (sortIndex === 0)
                result = a.unit.localeCompare(b.unit);
            else if (sortIndex === 1)
                result = (a.exposure ?? -1) - (b.exposure ?? -1);
            else
                result = assessmentRank(a.assessment) - assessmentRank(b.assessment);
            return sortDirection === SortByDirection.asc ? result : -result;
        });
        return copy;
    }, [rows, sortIndex, sortDirection]);

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
            <Table variant="compact" gridBreakPoint="grid-md" aria-label={_("System service hardening")}>
                <Thead>
                    <Tr>
                        <Th sort={sort(0)}>{_("Unit")}</Th>
                        <Th sort={sort(1)}>{_("Exposure")}</Th>
                        <Th sort={sort(2)}>{_("Assessment")}</Th>
                    </Tr>
                </Thead>
                <Tbody>
                    {sorted.map(row => (
                        <Tr
                            key={row.unit}
                            isClickable
                            isRowSelected={row.unit === selectedUnit}
                            onRowClick={() => onSelect(row.unit)}
                        >
                            <Td dataLabel={_("Unit")}>{row.unit}</Td>
                            <Td dataLabel={_("Exposure")}>{formatExposure(row.exposure)}</Td>
                            <Td dataLabel={_("Assessment")}>
                                <AssessmentLabel assessment={row.assessment} />
                            </Td>
                        </Tr>
                    ))}
                </Tbody>
            </Table>
        </div>
    );
};

const SecurityDetail = ({
    summary,
    cached,
    onDetail,
}: {
    summary: ServiceSecuritySummary;
    cached?: ServiceSecurityDetail | undefined;
    onDetail: (detail: ServiceSecurityDetail) => void;
}) => {
    const [status, setStatus] = useState<"loading" | "ready" | "error">(cached ? "ready" : "loading");
    const [error, setError] = useState<ProviderError | undefined>(undefined);
    const [detail, setDetail] = useState<ServiceSecurityDetail | undefined>(cached);

    useEffect(() => {
        if (cached) {
            setDetail(cached);
            setStatus("ready");
            setError(undefined);
            return;
        }

        let cancelled = false;
        setStatus("loading");
        setError(undefined);
        loadSecurityDetails(summary.unit).then(value => {
            if (cancelled)
                return;
            const merged: ServiceSecurityDetail = { ...value };
            if (summary.exposure !== undefined)
                merged.exposure = summary.exposure;
            if (summary.assessment !== undefined)
                merged.assessment = summary.assessment;
            setDetail(merged);
            setStatus("ready");
            onDetail(merged);
        })
                .catch(exc => {
                    if (cancelled)
                        return;
                    setError(normalizeSpawnError(exc));
                    setStatus("error");
                });
        return () => {
            cancelled = true;
        };
    }, [summary.unit, summary.exposure, summary.assessment, cached, onDetail]);

    return (
        <>
            <DescriptionList isCompact isHorizontal className="pf-v6-u-mb-md">
                <DetailItem term={_("Exposure")} value={formatExposure(summary.exposure)} />
                <DetailItem term={_("Assessment")} value={summary.assessment ?? "—"} />
            </DescriptionList>
            <HelperText className="pf-v6-u-mb-md">
                <HelperTextItem>
                    {cockpit.format(
                        _("systemd reports an exposure score of $0. That value reflects systemd sandboxing settings, not whether the software is vulnerable."),
                        formatExposure(summary.exposure)
                    )}
                </HelperTextItem>
            </HelperText>
            <div className="pf-v6-u-mb-md">
                <Button variant="link" isInline onClick={() => jumpToService(summary.unit)}>
                    {_("View service")}
                </Button>
            </div>
            {status === "loading" && (
                <HelperText>
                    <HelperTextItem>{_("Loading hardening checks")}</HelperTextItem>
                </HelperText>
            )}
            {status === "error" && error && (
                <Alert isInline variant="warning" title={_("Could not load setting details")}>
                    {error.message}
                </Alert>
            )}
            {status === "ready" && detail && <ChecksList checks={detail.checks} />}
        </>
    );
};

const ChecksList = ({ checks }: { checks: ServiceSecurityCheck[] }) => {
    const notApplied = checks.filter(check => check.state === "not-applied");
    const applied = checks.filter(check => check.state === "applied");
    const notApplicable = checks.filter(check => check.state === "not-applicable");

    return (
        <div className="diagnostics-stack">
            <Title headingLevel="h4" size="md">{_("Hardening checks")}</Title>
            <CheckGroup title={_("Not fully applied")} checks={notApplied} defaultExpanded />
            <CheckGroup title={_("Applied")} checks={applied} />
            <CheckGroup title={_("Not applicable")} checks={notApplicable} />
        </div>
    );
};

const CheckGroup = ({
    title,
    checks,
    defaultExpanded = false,
}: {
    title: string;
    checks: ServiceSecurityCheck[];
    defaultExpanded?: boolean;
}) => {
    const [expanded, setExpanded] = useState(defaultExpanded);
    if (checks.length === 0)
        return null;
    return (
        <ExpandableSection
            toggleText={cockpit.format(_("$0 ($1)"), title, checks.length)}
            isExpanded={expanded}
            onToggle={(_event, next) => setExpanded(next)}
        >
            <ul className="diagnostics-security-checks">
                {checks.map(check => (
                    <li key={check.id} className="diagnostics-security-check">
                        <CheckState state={check.state} />
                        <div>
                            <div className="diagnostics-security-check-name">{check.name}</div>
                            {check.description && (
                                <HelperText>
                                    <HelperTextItem>{check.description}</HelperTextItem>
                                </HelperText>
                            )}
                            {check.exposure !== undefined && (
                                <HelperText>
                                    <HelperTextItem>
                                        {cockpit.format(_("Exposure contribution $0"), formatExposure(check.exposure))}
                                    </HelperTextItem>
                                </HelperText>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </ExpandableSection>
    );
};

const CheckState = ({ state }: { state: SecurityCheckState }) => {
    if (state === "applied") {
        return (
            <span className="diagnostics-security-state">
                <CheckIcon />
                <span>{_("Applied")}</span>
            </span>
        );
    }
    if (state === "not-applied") {
        return (
            <span className="diagnostics-security-state">
                <TimesIcon />
                <span>{_("Not applied")}</span>
            </span>
        );
    }
    return (
        <span className="diagnostics-security-state">
            <MinusIcon />
            <span>{_("Not applicable")}</span>
        </span>
    );
};

const AssessmentLabel = ({ assessment }: { assessment?: string | undefined }) => {
    if (!assessment)
        return <>—</>;
    const color = assessmentColor(assessment);
    return <Label color={color} isCompact>{assessment}</Label>;
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

function formatExposure(value?: number): string {
    if (value === undefined)
        return "—";
    return value.toFixed(1);
}

function assessmentColor(assessment: string): "green" | "orange" | "red" | "grey" | "blue" {
    if (assessment === "PERFECT" || assessment === "SAFE" || assessment === "OK")
        return "green";
    if (assessment === "MEDIUM")
        return "blue";
    if (assessment === "EXPOSED")
        return "orange";
    if (assessment === "UNSAFE" || assessment === "DANGEROUS")
        return "red";
    return "grey";
}

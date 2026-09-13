import React from "react";

import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { ExpandableSection } from "@patternfly/react-core/dist/esm/components/ExpandableSection/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Grid, GridItem } from "@patternfly/react-core/dist/esm/layouts/Grid/index.js";

import cockpit from "cockpit";

import type { DiagnosticCapabilities } from "../types/diagnostics";
import type { DiagnosticFinding, FindingCategory, FindingsSnapshot } from "../types/findings";
import { journalPriorityName } from "../types/journal";
import { loadFindings } from "../providers/journal";
import { jumpToLogs } from "../utils/cockpitLinks";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
import { DiagnosticStatus } from "../components/DiagnosticStatus";
import { PageHeader } from "../components/PageHeader";
import { useAsyncProvider } from "../app/useAsyncProvider";

const _ = cockpit.gettext;

export const FindingsPage = ({ capabilities, onRefresh, lastRefreshed }: {
    capabilities: DiagnosticCapabilities;
    onRefresh: () => void;
    lastRefreshed?: Date | undefined;
}) => {
    const findings = useAsyncProvider(loadFindings, capabilities.journalctl);

    const refreshAll = () => {
        findings.reload();
        onRefresh();
    };

    const snapshot = findings.data;
    const list = snapshot?.findings ?? [];
    const memory = list.filter(item => item.category === "memory");
    const kernel = list.filter(item => item.category === "kernel");

    return (
        <PageSection isWidthLimited>
            <PageHeader
                title={_("Findings")}
                titleId="diagnostics-findings"
                lastRefreshed={lastRefreshed}
                onRefresh={refreshAll}
            />
            <Content component="p" className="pf-v6-u-mb-md">
                {_("Noteworthy diagnostic conditions from the current boot. This is not a journal browser; inspect raw evidence in Cockpit Logs.")}
            </Content>
            <Card isCompact>
                <CardBody>
                    {!capabilities.journalctl
                        ? (
                            <CapabilityNotice>
                                {_("journalctl is not available, so diagnostic findings cannot be collected.")}
                            </CapabilityNotice>
                        )
                        : (
                            <AsyncState
                                status={findings.status}
                                error={findings.error}
                                isEmpty={findings.status === "ready" && list.length === 0}
                                emptyTitle={_("No supported diagnostic findings detected for this boot.")}
                                emptyBody={_("Only out-of-memory kill activity and high-priority kernel events are detected. Absence of findings is not a health score.")}
                                loadingLabel={_("Loading findings")}
                            >
                                {snapshot && list.length > 0 && (
                                    <FindingsBody memory={memory} kernel={kernel} />
                                )}
                            </AsyncState>
                        )}
                    {capabilities.journalctl && findings.status === "ready" && (
                        <FindingsNotes snapshot={snapshot} empty={list.length === 0} />
                    )}
                </CardBody>
            </Card>
        </PageSection>
    );
};

const FindingsNotes = ({
    snapshot,
    empty,
}: {
    snapshot?: FindingsSnapshot | undefined;
    empty: boolean;
}) => (
    <HelperText className={empty ? "pf-v6-u-mt-md" : "pf-v6-u-mt-lg"}>
        <HelperTextItem>
            {_("Results use journal data visible to the current user and may be incomplete without administrative journal access.")}
        </HelperTextItem>
        {snapshot?.incomplete && (
            <HelperTextItem variant="warning">
                {_("Some journal queries could not be completed, so this list may be incomplete.")}
            </HelperTextItem>
        )}
        {snapshot?.truncated && (
            <HelperTextItem variant="warning">
                {_("A journal query reached its display bound. Additional matching events may exist in Cockpit Logs.")}
            </HelperTextItem>
        )}
    </HelperText>
);

const FindingsBody = ({
    memory,
    kernel,
}: {
    memory: DiagnosticFinding[];
    kernel: DiagnosticFinding[];
}) => (
    <div className="diagnostics-stack">
        <Title headingLevel="h3" size="md">{_("Current boot")}</Title>
        <Grid hasGutter className="diagnostics-grid">
            {memory.length > 0 && (
                <GridItem md={12} xl={6}>
                    <FindingCategoryCard category="memory" findings={memory} />
                </GridItem>
            )}
            {kernel.length > 0 && (
                <GridItem md={12} xl={6}>
                    <FindingCategoryCard category="kernel" findings={kernel} />
                </GridItem>
            )}
        </Grid>
    </div>
);

const FindingCategoryCard = ({
    category,
    findings,
}: {
    category: FindingCategory;
    findings: DiagnosticFinding[];
}) => (
    <Card isCompact>
        <CardHeader>
            <CardTitle>
                <Title headingLevel="h3" size="md">
                    {category === "memory" ? _("Memory") : _("Kernel")}
                </Title>
            </CardTitle>
        </CardHeader>
        <CardBody>
            {findings.map(finding => (
                <FindingItem key={finding.id} finding={finding} />
            ))}
        </CardBody>
    </Card>
);

const FindingItem = ({ finding }: { finding: DiagnosticFinding }) => (
    <div className="diagnostics-finding">
        <div className="diagnostics-finding-title">
            <DiagnosticStatus severity={finding.severity} />
            <span>{finding.title}</span>
        </div>
        <DescriptionList isCompact isHorizontal>
            {finding.process && (
                <DetailItem term={_("Process")} value={finding.process} />
            )}
            {finding.pid !== undefined && (
                <DetailItem term={_("PID")} value={String(finding.pid)} />
            )}
            {finding.cgroup && (
                <DetailItem term={_("Control group")} value={finding.cgroup} />
            )}
            {finding.unit && finding.unit !== finding.cgroup && (
                <DetailItem term={_("Unit")} value={finding.unit} />
            )}
            <DetailItem term={_("Source")} value={sourceLabel(finding)} />
            {finding.count > 1
                ? (
                    <>
                        <DetailItem
                            term={_("Occurrences")}
                            value={cockpit.format(
                                cockpit.ngettext("$0 occurrence", "$0 occurrences", finding.count),
                                finding.count
                            )}
                        />
                        <DetailItem term={_("First")} value={formatTimestamp(finding.firstTimestampUs)} />
                        <DetailItem term={_("Last")} value={formatTimestamp(finding.lastTimestampUs)} />
                    </>
                )
                : (
                    <DetailItem term={_("Time")} value={formatTimestamp(finding.firstTimestampUs ?? finding.lastTimestampUs)} />
                )}
        </DescriptionList>
        {finding.logsTarget && (
            <div className="pf-v6-u-mt-sm">
                <Button variant="link" isInline onClick={() => { if (finding.logsTarget) jumpToLogs(finding.logsTarget); }}>
                    {_("View in Logs")}
                </Button>
            </div>
        )}
        {finding.evidence && (
            <ExpandableSection className="pf-v6-u-mt-sm" toggleText={_("Evidence")}>
                <DescriptionList isCompact isHorizontal>
                    {finding.evidence.message && (
                        <DescriptionListGroup>
                            <DescriptionListTerm>{_("Message")}</DescriptionListTerm>
                            <DescriptionListDescription>
                                <span className="diagnostics-finding-message">{finding.evidence.message}</span>
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                    )}
                    {finding.evidence.priority !== undefined && (
                        <DetailItem
                            term={_("Priority")}
                            value={priorityLabel(finding.evidence.priority)}
                        />
                    )}
                    {finding.evidence.identifier && (
                        <DetailItem term={_("Identifier")} value={finding.evidence.identifier} />
                    )}
                    {finding.evidence.unit && (
                        <DetailItem term={_("Unit")} value={finding.evidence.unit} />
                    )}
                </DescriptionList>
            </ExpandableSection>
        )}
    </div>
);

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

function sourceLabel(finding: DiagnosticFinding): string {
    if (finding.source === "systemd-oomd")
        return "systemd-oomd";
    if (finding.category === "memory")
        return _("kernel OOM killer");
    return _("kernel");
}

function priorityLabel(priority: number): string {
    const name = journalPriorityName(priority);
    return name ? cockpit.format(_("$0 ($1)"), name, String(priority)) : String(priority);
}

function formatTimestamp(timestampUs?: number): string {
    if (timestampUs === undefined)
        return "—";
    return new Date(timestampUs / 1000).toLocaleString();
}

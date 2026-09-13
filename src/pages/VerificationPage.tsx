import React, { useEffect, useMemo, useState } from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { PageSection } from "@patternfly/react-core/dist/esm/components/Page/index.js";
import { SearchInput } from "@patternfly/react-core/dist/esm/components/SearchInput/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core/dist/esm/components/Toolbar/index.js";
import { Table, Tbody, Td, Th, Thead, Tr } from "@patternfly/react-table";
import CheckIcon from "@patternfly/react-icons/dist/esm/icons/check-icon";
import ExclamationCircleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-circle-icon";
import ExclamationTriangleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-triangle-icon";

import cockpit from "cockpit";

import type { DiagnosticCapabilities } from "../types/diagnostics";
import type { InstalledUnitFile, VerificationFinding, VerificationResult } from "../types/verify";
import { loadInstalledUnitFiles, verifyUnit } from "../providers/verify";
import { jumpToService } from "../utils/cockpitLinks";
import { ProviderError } from "../types/providers";
import { normalizeSpawnError } from "../utils/errors";
import { AsyncState } from "../components/AsyncState";
import { CapabilityNotice } from "../components/CapabilityNotice";
import { PageHeader } from "../components/PageHeader";
import { useAsyncProvider } from "../app/useAsyncProvider";

const _ = cockpit.gettext;

export const VerificationPage = ({ capabilities, onRefresh, lastRefreshed }: {
    capabilities: DiagnosticCapabilities;
    onRefresh: () => void;
    lastRefreshed?: Date | undefined;
}) => {
    const units = useAsyncProvider(
        loadInstalledUnitFiles,
        capabilities.systemctl
    );
    const [filter, setFilter] = useState("");
    const [selected, setSelected] = useState<string | null>(null);
    const [result, setResult] = useState<VerificationResult | undefined>(undefined);
    const [resultStatus, setResultStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [resultError, setResultError] = useState<ProviderError | undefined>(undefined);

    const refreshAll = () => {
        setSelected(null);
        setResult(undefined);
        setResultStatus("idle");
        setResultError(undefined);
        units.reload();
        onRefresh();
    };

    const filtered = useMemo(() => {
        const rows = units.data ?? [];
        const query = filter.trim().toLowerCase();
        if (!query)
            return rows;
        return rows.filter(row => row.unit.toLowerCase().includes(query) || (row.state ?? "").toLowerCase().includes(query));
    }, [units.data, filter]);

    useEffect(() => {
        if (!selected || !capabilities.systemdAnalyze || !capabilities.systemdAnalyzeVerify) {
            setResult(undefined);
            setResultStatus("idle");
            setResultError(undefined);
            return;
        }

        let cancelled = false;
        setResultStatus("loading");
        setResultError(undefined);
        verifyUnit(selected).then(value => {
            if (cancelled)
                return;
            setResult(value);
            setResultStatus("ready");
        })
                .catch(exc => {
                    if (cancelled)
                        return;
                    setResult(undefined);
                    setResultError(normalizeSpawnError(exc));
                    setResultStatus("error");
                });
        return () => {
            cancelled = true;
        };
    }, [selected, capabilities.systemdAnalyze, capabilities.systemdAnalyzeVerify]);

    return (
        <PageSection isWidthLimited>
            <PageHeader
                title={_("Verification")}
                titleId="diagnostics-verification"
                lastRefreshed={lastRefreshed}
                onRefresh={refreshAll}
            />
            <Title headingLevel="h3" size="md" className="pf-v6-u-mb-sm">
                {_("Unit file verification")}
            </Title>
            <Alert
                className="pf-v6-u-mb-md"
                variant="info"
                isInline
                title={_("This checks unit configuration. It does not edit units or start services.")}
            >
                <p>
                    {_("systemd-analyze verify loads the selected installed unit and reports syntax problems, missing dependencies, and similar issues. Findings can mention related units, not only the unit you selected.")}
                </p>
            </Alert>
            <div className="diagnostics-stack">
                <Card isCompact>
                    <CardBody>
                        {!capabilities.systemctl
                            ? (
                                <CapabilityNotice>
                                    {_("systemctl is not available, so installed unit files cannot be listed.")}
                                </CapabilityNotice>
                            )
                            : (
                                <AsyncState
                                    status={units.status}
                                    error={units.error}
                                    isEmpty={units.status === "ready" && (units.data?.length ?? 0) === 0}
                                    emptyTitle={_("No installed unit files")}
                                    emptyBody={_("systemctl did not report any system unit files.")}
                                    loadingLabel={_("Loading installed unit files")}
                                >
                                    {units.data && units.data.length > 0 && (
                                        <>
                                            <HelperText className="pf-v6-u-mb-md">
                                                <HelperTextItem>
                                                    {_("System units. Select an installed unit file to verify it. Template names such as getty@.service are unit files, not running instances.")}
                                                </HelperTextItem>
                                            </HelperText>
                                            <Toolbar className="pf-v6-u-mb-sm" id="verification-filter-toolbar">
                                                <ToolbarContent>
                                                    <ToolbarItem>
                                                        <SearchInput
                                                            aria-label={_("Filter unit files")}
                                                            placeholder={_("Filter unit files")}
                                                            value={filter}
                                                            onChange={(_event, value) => setFilter(value)}
                                                            onClear={() => setFilter("")}
                                                        />
                                                    </ToolbarItem>
                                                </ToolbarContent>
                                            </Toolbar>
                                            {filtered.length === 0
                                                ? (
                                                    <HelperText>
                                                        <HelperTextItem>{_("No unit files match this filter.")}</HelperTextItem>
                                                    </HelperText>
                                                )
                                                : (
                                                    <UnitFileTable
                                                        rows={filtered}
                                                        selected={selected}
                                                        onSelect={setSelected}
                                                    />
                                                )}
                                        </>
                                    )}
                                </AsyncState>
                            )}
                    </CardBody>
                </Card>
                <Card isCompact>
                    <CardBody>
                        {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzeVerify
                            ? (
                                <CapabilityNotice>
                                    {_("systemd-analyze verify is not available, so unit files cannot be checked.")}
                                </CapabilityNotice>
                            )
                            : !selected
                                ? (
                                    <HelperText>
                                        <HelperTextItem>{_("Select a system unit file to run systemd-analyze verify.")}</HelperTextItem>
                                    </HelperText>
                                )
                                : (
                                    <VerificationResultPanel
                                        unit={selected}
                                        status={resultStatus}
                                        result={result}
                                        error={resultError}
                                    />
                                )}
                    </CardBody>
                </Card>
            </div>
        </PageSection>
    );
};

const UnitFileTable = ({
    rows,
    selected,
    onSelect,
}: {
    rows: InstalledUnitFile[];
    selected: string | null;
    onSelect: (unit: string) => void;
}) => (
    <div className="diagnostics-scroll">
        <Table variant="compact" gridBreakPoint="grid-md" aria-label={_("Installed system unit files")}>
            <Thead>
                <Tr>
                    <Th>{_("Unit file")}</Th>
                    <Th>{_("State")}</Th>
                </Tr>
            </Thead>
            <Tbody>
                {rows.slice(0, 200).map(row => (
                    <Tr
                        key={row.unit}
                        isClickable
                        isRowSelected={row.unit === selected}
                        onRowClick={() => onSelect(row.unit)}
                    >
                        <Td dataLabel={_("Unit file")}>{row.unit}</Td>
                        <Td dataLabel={_("State")}>{row.state ?? "—"}</Td>
                    </Tr>
                ))}
            </Tbody>
        </Table>
        {rows.length > 200 && (
            <HelperText className="pf-v6-u-mt-sm">
                <HelperTextItem>
                    {cockpit.format(_("Showing the first 200 of $0 matching unit files. Narrow the filter to see others."), rows.length)}
                </HelperTextItem>
            </HelperText>
        )}
    </div>
);

const VerificationResultPanel = ({
    unit,
    status,
    result,
    error,
}: {
    unit: string;
    status: "idle" | "loading" | "ready" | "error";
    result?: VerificationResult | undefined;
    error?: ProviderError | undefined;
}) => {
    const errors = result?.findings.filter(item => item.severity === "error") ?? [];
    const warnings = result?.findings.filter(item => item.severity === "warning") ?? [];
    const relatedCount = result?.findings.filter(item => item.related).length ?? 0;

    return (
        <>
            <Title headingLevel="h3" size="md">{unit}</Title>
            <div className="pf-v6-u-mb-md">
                <Button variant="link" isInline onClick={() => jumpToService(unit)}>
                    {_("View service")}
                </Button>
            </div>
            {status === "loading" && (
                <HelperText>
                    <HelperTextItem>{_("Running systemd-analyze verify")}</HelperTextItem>
                </HelperText>
            )}
            {status === "error" && error && (
                <Alert isInline variant="warning" title={error.kind === "not-found" ? _("Unit was not found") : _("Could not verify this unit")}>
                    {error.message}
                </Alert>
            )}
            {status === "ready" && result && (
                <>
                    {result.findings.length === 0
                        ? (
                            <Alert isInline variant="success" title={_("systemd reported no verification findings")}>
                                {_("This is not a guarantee that the unit will start or that its software is correct.")}
                            </Alert>
                        )
                        : (
                            <HelperText className="pf-v6-u-mb-md">
                                <HelperTextItem>
                                    {relatedCount > 0
                                        ? cockpit.format(_("systemd reported $0 finding(s), including $1 from related units."), result.findings.length, relatedCount)
                                        : cockpit.format(_("systemd reported $0 finding(s) while verifying $1."), result.findings.length, unit)}
                                </HelperTextItem>
                            </HelperText>
                        )}
                    {errors.length > 0 && <FindingGroup title={_("Errors")} findings={errors} />}
                    {warnings.length > 0 && <FindingGroup title={_("Warnings")} findings={warnings} />}
                </>
            )}
        </>
    );
};

const FindingGroup = ({ title, findings }: { title: string; findings: VerificationFinding[] }) => (
    <div className="pf-v6-u-mb-md">
        <Title headingLevel="h4" size="md" className="pf-v6-u-mb-sm">{title}</Title>
        <ul className="diagnostics-verify-findings">
            {findings.map((finding, index) => (
                <li key={`${finding.message}-${index}`} className="diagnostics-verify-finding">
                    <FindingIcon severity={finding.severity} />
                    <div>
                        <div>{finding.message}</div>
                        <HelperText>
                            {finding.unit && (
                                <HelperTextItem>
                                    {finding.related
                                        ? cockpit.format(_("Related unit $0"), finding.unit)
                                        : cockpit.format(_("Unit $0"), finding.unit)}
                                </HelperTextItem>
                            )}
                            {finding.path && (
                                <HelperTextItem>
                                    {finding.line !== undefined
                                        ? cockpit.format(_("$0:$1"), finding.path, finding.line)
                                        : finding.path}
                                </HelperTextItem>
                            )}
                            {finding.related && finding.unit && (
                                <HelperTextItem>
                                    <Button variant="link" isInline onClick={() => jumpToService(finding.unit as string)}>
                                        {_("View service")}
                                    </Button>
                                </HelperTextItem>
                            )}
                        </HelperText>
                    </div>
                </li>
            ))}
        </ul>
    </div>
);

const FindingIcon = ({ severity }: { severity: VerificationFinding["severity"] }) => {
    if (severity === "error") {
        return (
            <span className="diagnostics-verify-state">
                <ExclamationCircleIcon />
                <span>{_("Error")}</span>
            </span>
        );
    }
    if (severity === "warning") {
        return (
            <span className="diagnostics-verify-state">
                <ExclamationTriangleIcon />
                <span>{_("Warning")}</span>
            </span>
        );
    }
    return (
        <span className="diagnostics-verify-state">
            <CheckIcon />
            <span>{_("Info")}</span>
        </span>
    );
};

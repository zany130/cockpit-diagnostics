import React, { useEffect, useMemo, useRef, useState } from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Card, CardBody, CardHeader, CardTitle } from "@patternfly/react-core/dist/esm/components/Card/index.js";
import { HelperText, HelperTextItem } from "@patternfly/react-core/dist/esm/components/HelperText/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

import cockpit from "cockpit";

import type { DiagnosticCapabilities } from "../types/diagnostics";
import type { BootPlot } from "../types/plot";
import { AsyncState } from "./AsyncState";
import { CapabilityNotice } from "./CapabilityNotice";
import { useAsyncProvider } from "../app/useAsyncProvider";

const _ = cockpit.gettext;

export const BootPlotCard = ({
    capabilities,
    state,
}: {
    capabilities: DiagnosticCapabilities;
    state: ReturnType<typeof useAsyncProvider<BootPlot>>;
}) => (
    <Card isCompact>
        <CardHeader>
            <CardTitle>
                <Title headingLevel="h3" size="md">{_("Boot timeline")}</Title>
            </CardTitle>
        </CardHeader>
        <CardBody>
            <HelperText className="pf-v6-u-mb-md">
                <HelperTextItem>
                    {_("systemd-analyze plot for the current boot. Firmware and loader bars appear when systemd reported those phases. This chart is systemd's SVG, not a second timing calculation.")}
                </HelperTextItem>
            </HelperText>
            {!capabilities.systemdAnalyze || !capabilities.systemdAnalyzePlot
                ? (
                    <CapabilityNotice>
                        {_("systemd-analyze plot is not available, so the boot timeline cannot be drawn.")}
                    </CapabilityNotice>
                )
                : (
                    <AsyncState
                        status={state.status}
                        error={state.error}
                        loadingLabel={_("Loading boot timeline")}
                    >
                        {state.data && <BootPlotView plot={state.data} />}
                    </AsyncState>
                )}
        </CardBody>
    </Card>
);

const BootPlotView = ({ plot }: { plot: BootPlot }) => {
    const frameRef = useRef<HTMLDivElement>(null);
    const [mode, setMode] = useState<"fit" | "reset">("fit");
    const [frameWidth, setFrameWidth] = useState(0);

    // Isolation: sanitized SVG is shown as image/svg+xml through a blob URL.
    // SVG loaded as <img> cannot run script or navigate the Cockpit origin.
    const objectUrl = useMemo(() => {
        return URL.createObjectURL(new Blob([plot.svg], { type: "image/svg+xml" }));
    }, [plot.svg]);

    useEffect(() => {
        return () => URL.revokeObjectURL(objectUrl);
    }, [objectUrl]);

    useEffect(() => {
        const node = frameRef.current;
        if (!node || typeof ResizeObserver === "undefined")
            return;
        const observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width ?? 0;
            setFrameWidth(width);
        });
        observer.observe(node);
        setFrameWidth(node.clientWidth);
        return () => observer.disconnect();
    }, []);

    const scale = useMemo(() => {
        if (mode !== "fit" || !plot.width || frameWidth <= 0)
            return 1;
        return Math.min(1, frameWidth / plot.width);
    }, [mode, plot.width, frameWidth]);

    return (
        <>
            <Flex className="pf-v6-u-mb-sm" spaceItems={{ default: "spaceItemsSm" }}>
                <FlexItem>
                    <Button variant="secondary" onClick={() => setMode("fit")}>{_("Fit to width")}</Button>
                </FlexItem>
                <FlexItem>
                    <Button variant="secondary" onClick={() => setMode("reset")}>{_("Reset zoom")}</Button>
                </FlexItem>
            </Flex>
            <div ref={frameRef} className="diagnostics-boot-plot-frame">
                <div
                    className="diagnostics-boot-plot-scaler"
                    style={{
                        width: plot.width ? plot.width * scale : undefined,
                        height: plot.height ? plot.height * scale : undefined,
                    }}
                >
                    <img
                        className="diagnostics-boot-plot"
                        alt={_("systemd boot timeline")}
                        src={objectUrl}
                        width={plot.width}
                        height={plot.height}
                        style={{
                            transform: `scale(${scale})`,
                            transformOrigin: "top left",
                        }}
                    />
                </div>
            </div>
            {mode === "reset" && plot.width !== undefined && plot.width > frameWidth && (
                <Alert className="pf-v6-u-mt-sm" isInline isPlain variant="info" title={_("Scroll sideways to see the full timeline.")} />
            )}
        </>
    );
};

import React from "react";

import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Content } from "@patternfly/react-core/dist/esm/components/Content/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { Title } from "@patternfly/react-core/dist/esm/components/Title/index.js";
import SyncAltIcon from "@patternfly/react-icons/dist/esm/icons/sync-alt-icon";

import cockpit from "cockpit";

const _ = cockpit.gettext;

export const PageHeader = ({
    title,
    titleId,
    lastRefreshed,
    onRefresh,
}: {
    title: string;
    titleId: string;
    lastRefreshed?: Date | undefined;
    onRefresh: () => void;
}) => (
    <Flex
        className="diagnostics-page-header"
        justifyContent={{ default: "justifyContentSpaceBetween" }}
        alignItems={{ default: "alignItemsFlexStart" }}
        flexWrap={{ default: "wrap" }}
        gap={{ default: "gapSm" }}
    >
        <FlexItem>
            <Title headingLevel="h2" id={titleId}>{title}</Title>
            {lastRefreshed && (
                <Content component="small" className="pf-v6-u-color-200">
                    {cockpit.format(_("Last refreshed $0"), lastRefreshed.toLocaleString())}
                </Content>
            )}
        </FlexItem>
        <FlexItem>
            <Button variant="secondary" icon={<SyncAltIcon />} onClick={onRefresh}>
                {_("Refresh")}
            </Button>
        </FlexItem>
    </Flex>
);

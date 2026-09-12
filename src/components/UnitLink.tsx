import React from "react";

import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";

import cockpit from "cockpit";

import { jumpToService, jumpToUnitLogs } from "../utils/cockpitLinks";

const _ = cockpit.gettext;

export const UnitLink = ({ unit }: { unit: string }) => (
    <Flex spaceItems={{ default: "spaceItemsSm" }} flexWrap={{ default: "wrap" }}>
        <FlexItem>
            <Button variant="link" isInline onClick={() => jumpToService(unit)}>
                {cockpit.format(_("View $0 in Services"), unit)}
            </Button>
        </FlexItem>
        <FlexItem>
            <Button variant="link" isInline onClick={() => jumpToUnitLogs(unit)}>
                {_("View logs")}
            </Button>
        </FlexItem>
    </Flex>
);

export const UnitActions = ({ unit }: { unit: string }) => (
    <Flex
        direction={{ default: "column" }}
        spaceItems={{ default: "spaceItemsXs" }}
    >
        <FlexItem>
            <Button variant="link" isInline onClick={() => jumpToService(unit)}>
                {_("View service")}
            </Button>
        </FlexItem>
        <FlexItem>
            <Button variant="link" isInline onClick={() => jumpToUnitLogs(unit)}>
                {_("View logs")}
            </Button>
        </FlexItem>
    </Flex>
);

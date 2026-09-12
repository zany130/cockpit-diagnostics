import React from "react";

import { Alert } from "@patternfly/react-core/dist/esm/components/Alert/index.js";

import cockpit from "cockpit";

const _ = cockpit.gettext;

export const CapabilityNotice = ({
    title,
    children,
}: {
    title?: string;
    children: React.ReactNode;
}) => (
    <Alert variant="info" isInline title={title ?? _("This diagnostic is unavailable")}>
        {children}
    </Alert>
);

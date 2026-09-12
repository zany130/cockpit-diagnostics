import React from "react";

import { Label } from "@patternfly/react-core/dist/esm/components/Label/index.js";

import cockpit from "cockpit";

import type { DiagnosticSeverity } from "../types/diagnostics";

const _ = cockpit.gettext;

export const DiagnosticStatus = ({ severity }: { severity: DiagnosticSeverity }) => {
    const color = severity === "error" ? "red" : severity === "warning" ? "orange" : "blue";
    const text = severity === "error" ? _("Error") : severity === "warning" ? _("Warning") : _("Info");
    return (
        <Label color={color}>
            {text}
        </Label>
    );
};

import React from "react";

import { formatDuration, formatDurationExact } from "../utils/duration";

export const DurationText = ({ valueUs }: { valueUs: number }) => (
    <span title={formatDurationExact(valueUs)}>{formatDuration(valueUs)}</span>
);

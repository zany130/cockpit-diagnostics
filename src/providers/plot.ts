import type { BootPlot } from "../types/plot";
import { parseBootPlotSvg } from "../parsers/plot";
import { runCommand } from "./command";

const PLOT_TIMEOUT_MS = 60_000;

/**
 * systemd-analyze plot SVG for the system manager's current timing data.
 *
 * One process, current session only. Do not poll. Do not persist.
 */
export async function loadBootPlot(): Promise<BootPlot> {
    const output = await runCommand(
        ["systemd-analyze", "--system", "--no-pager", "plot"],
        { timeoutMs: PLOT_TIMEOUT_MS }
    );
    return parseBootPlotSvg(output);
}

import type { BootPlot } from "../types/plot";
import { parseBootPlotSvg } from "../parsers/plot";
import { runCommand } from "./command";

const PLOT_TIMEOUT_MS = 60_000;

/**
 * systemd-analyze plot SVG for the system manager's current timing data.
 *
 * argv only. err: "message" keeps stderr off stdout so warnings cannot
 * contaminate the SVG. One process, current session only. Do not poll.
 */
export async function loadBootPlot(): Promise<BootPlot> {
    const output = await runCommand(
        ["systemd-analyze", "--system", "--no-pager", "plot"],
        { timeoutMs: PLOT_TIMEOUT_MS, err: "message" }
    );
    return parseBootPlotSvg(output);
}

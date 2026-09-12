import type { FailedUnit } from "../types/diagnostics";

export function parseUnitShow(output: string): Map<string, Partial<FailedUnit>> {
    const extras = new Map<string, Partial<FailedUnit>>();
    const blocks = output.split(/\n\s*\n/);

    for (const block of blocks) {
        const fields: Record<string, string> = {};
        for (const line of block.split(/\r?\n/)) {
            const eq = line.indexOf("=");
            if (eq <= 0)
                continue;
            fields[line.slice(0, eq)] = line.slice(eq + 1);
        }

        const id = fields.Id;
        if (!id)
            continue;

        const extra: Partial<FailedUnit> = {};
        if (fields.Result && fields.Result !== "n/a")
            extra.result = fields.Result;
        if (fields.InactiveEnterTimestamp && fields.InactiveEnterTimestamp !== "n/a")
            extra.inactiveEnterTimestamp = fields.InactiveEnterTimestamp;
        if (fields.ExecMainStatus && fields.ExecMainStatus !== "n/a") {
            const status = Number(fields.ExecMainStatus);
            if (Number.isFinite(status))
                extra.execMainStatus = status;
        }
        extras.set(id, extra);
    }

    return extras;
}

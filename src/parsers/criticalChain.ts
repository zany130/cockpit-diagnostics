import type { CriticalChainNode } from "../types/boot";
import { parseFailed } from "../utils/errors";
import { parseTimespan } from "../utils/duration";
import { stripAnsi } from "../utils/ansi";

const HEADER_RE = /printed after the ["'@+] character/i;
const TREE_PREFIX_RE = /^[ │├└─]+/;

interface ParsedLine {
    indent: number;
    unit: string;
    activatedAtUs?: number;
    activationDurationUs?: number;
}

export function parseCriticalChain(output: string): CriticalChainNode[] {
    const lines = output.split(/\r?\n/);
    const parsed: ParsedLine[] = [];

    for (const raw of lines) {
        const line = stripAnsi(raw).replace(/\t/g, "    ");
        if (line.trim() === "" || HEADER_RE.test(line))
            continue;
        const item = parseChainLine(line);
        if (item === null)
            continue;
        parsed.push(item);
    }

    if (output.trim() !== "" && parsed.length === 0)
        throw parseFailed("systemd-analyze critical-chain output could not be parsed.", "critical-chain");

    return buildTree(parsed);
}

export function flattenCriticalChain(nodes: CriticalChainNode[]): string[] {
    const units: string[] = [];
    const walk = (node: CriticalChainNode) => {
        units.push(node.unit);
        node.children.forEach(walk);
    };
    nodes.forEach(walk);
    return units;
}

function parseChainLine(line: string): ParsedLine | null {
    const prefix = line.match(TREE_PREFIX_RE)?.[0] ?? "";
    const rest = line.slice(prefix.length).trim();
    if (rest === "")
        return null;

    let unitAndAt = rest;
    let activationDurationUs: number | undefined;
    const plus = splitTimespanSuffix(rest, " +");
    if (plus) {
        unitAndAt = plus.head;
        const duration = parseTimespan(plus.tail);
        if (duration !== null)
            activationDurationUs = duration;
    }

    let unit = unitAndAt;
    let activatedAtUs: number | undefined;
    const at = splitTimespanSuffix(unitAndAt, " @");
    if (at) {
        unit = at.head;
        const activated = parseTimespan(at.tail);
        if (activated !== null)
            activatedAtUs = activated;
    }

    if (unit === "" || /\s/.test(unit))
        return null;

    const indent = prefix.replace(/[├└│─]/g, " ").length;
    const node: ParsedLine = { indent, unit };
    if (activatedAtUs !== undefined)
        node.activatedAtUs = activatedAtUs;
    if (activationDurationUs !== undefined)
        node.activationDurationUs = activationDurationUs;
    return node;
}

function splitTimespanSuffix(text: string, marker: string): { head: string; tail: string } | null {
    const index = text.lastIndexOf(marker);
    if (index <= 0)
        return null;
    const tail = text.slice(index + marker.length).trim();
    if (parseTimespan(tail) === null)
        return null;
    return { head: text.slice(0, index).trim(), tail };
}

function buildTree(lines: ParsedLine[]): CriticalChainNode[] {
    const roots: CriticalChainNode[] = [];
    const stack: { indent: number; node: CriticalChainNode }[] = [];

    for (const line of lines) {
        const node: CriticalChainNode = {
            unit: line.unit,
            children: [],
        };
        if (line.activatedAtUs !== undefined)
            node.activatedAtUs = line.activatedAtUs;
        if (line.activationDurationUs !== undefined)
            node.activationDurationUs = line.activationDurationUs;

        while (stack.length > 0 && stack[stack.length - 1].indent >= line.indent)
            stack.pop();

        if (stack.length === 0)
            roots.push(node);
        else
            stack[stack.length - 1].node.children.push(node);

        stack.push({ indent: line.indent, node });
    }

    return roots;
}

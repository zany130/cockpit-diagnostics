import { parseFailed } from "../utils/errors";
import type { BootPlot } from "../types/plot";

const MAX_PLOT_BYTES = 8 * 1024 * 1024;

const ALLOWED_ELEMENTS = new Set([
    "svg",
    "g",
    "defs",
    "clippath",
    "rect",
    "line",
    "polyline",
    "polygon",
    "circle",
    "ellipse",
    "path",
    "text",
    "tspan",
    "title",
    "desc",
    "style",
]);

const ALLOWED_ATTRIBUTES = new Set([
    "class",
    "clip-path",
    "d",
    "dominant-baseline",
    "dx",
    "dy",
    "fill",
    "fill-opacity",
    "font-family",
    "font-size",
    "font-weight",
    "height",
    "id",
    "opacity",
    "overflow",
    "points",
    "preserveaspectratio",
    "r",
    "rx",
    "ry",
    "stroke",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-opacity",
    "stroke-width",
    "text-anchor",
    "transform",
    "version",
    "viewbox",
    "width",
    "x",
    "x1",
    "x2",
    "xml:space",
    "xmlns",
    "y",
    "y1",
    "y2",
]);

/**
 * Validate and sanitize systemd-analyze plot SVG.
 *
 * systemd 255 writes SVG to stdout by default. --json/--table emit raw
 * timings instead of a chart; this parser is for the SVG form only.
 */
export function parseBootPlotSvg(output: string): BootPlot {
    const text = output.replace(/^\uFEFF/, "").trim();
    if (text === "")
        throw parseFailed("systemd-analyze plot produced no SVG.", "systemd-analyze");
    if (text.length > MAX_PLOT_BYTES)
        throw parseFailed("systemd-analyze plot SVG was too large to display.", "systemd-analyze");
    if (!/<svg[\s>]/i.test(text))
        throw parseFailed("systemd-analyze plot did not return SVG.", "systemd-analyze");

    const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
    if (parsed.querySelector("parsererror"))
        throw parseFailed("systemd-analyze plot SVG could not be parsed.", "systemd-analyze");

    const root = parsed.documentElement;
    if (!root || root.localName.toLowerCase() !== "svg")
        throw parseFailed("systemd-analyze plot SVG was missing a root svg element.", "systemd-analyze");

    sanitizeNode(root);
    const svg = new XMLSerializer().serializeToString(root);
    if (!/<svg[\s>]/i.test(svg))
        throw parseFailed("systemd-analyze plot SVG was rejected as unsafe.", "systemd-analyze");

    const plot: BootPlot = { svg };
    const width = dimension(root.getAttribute("width"));
    const height = dimension(root.getAttribute("height"));
    if (width !== undefined)
        plot.width = width;
    if (height !== undefined)
        plot.height = height;
    return plot;
}

function sanitizeNode(node: Element): void {
    const children = Array.from(node.childNodes);
    for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE)
            sanitizeNode(child as Element);
        else if (child.nodeType === Node.COMMENT_NODE)
            node.removeChild(child);
    }

    const name = node.localName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(name)) {
        node.remove();
        return;
    }

    for (const attr of Array.from(node.attributes)) {
        const attrName = attr.name.toLowerCase();
        if (attrName.startsWith("on") || attrName === "href" || attrName.endsWith(":href")) {
            node.removeAttribute(attr.name);
            continue;
        }
        if (!ALLOWED_ATTRIBUTES.has(attrName) && attrName !== "xmlns" && !attrName.startsWith("xmlns:"))
            node.removeAttribute(attr.name);
    }

    if (name === "style")
        node.textContent = sanitizeStyle(node.textContent ?? "");
}

function sanitizeStyle(css: string): string {
    return css
            .replace(/@import[^;]*/gi, "")
            .replace(/url\s*\([^)]*\)/gi, "")
            .replace(/expression\s*\([^)]*\)/gi, "")
            .replace(/javascript\s*:/gi, "")
            .replace(/-moz-binding/gi, "");
}

function dimension(value: string | null): number | undefined {
    if (!value)
        return undefined;
    const match = value.trim().match(/^([\d.]+)(?:px)?$/);
    if (!match)
        return undefined;
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

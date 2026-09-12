export interface BootSummary {
    firmwareUs?: number;
    loaderUs?: number;
    kernelUs?: number;
    initrdUs?: number;
    userspaceUs?: number;
    totalUs?: number;
    target?: string;
    targetReachedUs?: number;
}

export interface UnitActivationTiming {
    unit: string;
    durationUs: number;
}

export interface CriticalChainNode {
    unit: string;
    activatedAtUs?: number;
    activationDurationUs?: number;
    children: CriticalChainNode[];
}

export type CriticalPathMark = "yes" | "no" | "unknown";

export function flattenCriticalChain(nodes: CriticalChainNode[]): string[] {
    const units: string[] = [];
    const walk = (node: CriticalChainNode) => {
        units.push(node.unit);
        node.children.forEach(walk);
    };
    nodes.forEach(walk);
    return units;
}

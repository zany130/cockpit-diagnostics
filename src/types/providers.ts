export type ProviderErrorKind =
    | "not-found"
    | "not-supported"
    | "permission-denied"
    | "timeout"
    | "command-failed"
    | "parse-failed"
    | "unknown";

export class ProviderError extends Error {
    readonly kind: ProviderErrorKind;
    readonly source?: string;
    readonly causeError?: unknown;

    constructor(kind: ProviderErrorKind, message: string, options?: {
        source?: string;
        cause?: unknown;
    }) {
        super(message);
        this.name = "ProviderError";
        this.kind = kind;
        if (options?.source !== undefined)
            this.source = options.source;
        if (options?.cause !== undefined)
            this.causeError = options.cause;
    }
}

export interface ProviderResult<T> {
    ok: true;
    value: T;
}

export interface ProviderFailure {
    ok: false;
    error: ProviderError;
}

export type IndependentResult<T> = ProviderResult<T> | ProviderFailure;

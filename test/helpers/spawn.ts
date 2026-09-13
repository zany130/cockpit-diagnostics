export function spawnOk(data: string) {
    return Object.assign(Promise.resolve(data), {
        close() {},
    });
}

/**
 * Mimic Cockpit spawn: `.stream(cb)` receives stdout and the promise
 * resolves to an empty string. Used to regression-test v0.5's helper.
 */
export function spawnOkStreamConsumed(data: string) {
    let streamer: ((chunk: string) => void) | undefined;
    const promise = new Promise<string>(resolve => {
        queueMicrotask(() => {
            if (streamer)
                streamer(data);
            resolve(streamer ? "" : data);
        });
    });
    return Object.assign(promise, {
        close() {},
        stream(callback: (chunk: string) => void) {
            streamer = callback;
            return this;
        },
    });
}

export function spawnFail(problem: string, message: string, extra?: { exit_status?: number | null }) {
    const error = Object.assign(new Error(message), {
        problem,
        message,
        exit_status: extra?.exit_status ?? (problem === "not-found" ? null : 1),
        exit_signal: null,
    });
    return Object.assign(Promise.reject(error), {
        close() {},
    });
}

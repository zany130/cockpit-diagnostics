export function spawnOk(data: string) {
    return Object.assign(Promise.resolve(data), {
        close() {},
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

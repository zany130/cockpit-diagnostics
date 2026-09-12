import { useCallback, useEffect, useRef, useState } from "react";

import cockpit from "cockpit";

import { ProviderError } from "../types/providers";
import { normalizeSpawnError } from "../utils/errors";
import type { AsyncStatus } from "../components/AsyncState";

export interface AsyncProviderState<T> {
    status: AsyncStatus;
    data?: T | undefined;
    error?: ProviderError | undefined;
    reload: () => void;
}

export function useAsyncProvider<T>(loader: () => Promise<T>, enabled = true): AsyncProviderState<T> {
    const [status, setStatus] = useState<AsyncStatus>(enabled ? "loading" : "error");
    const [data, setData] = useState<T | undefined>(undefined);
    const [error, setError] = useState<ProviderError | undefined>(undefined);
    const [generation, setGeneration] = useState(0);
    const [hidden, setHidden] = useState(cockpit.hidden);
    const loaderRef = useRef(loader);
    loaderRef.current = loader;

    useEffect(() => {
        const onVisibility = () => setHidden(cockpit.hidden);
        cockpit.addEventListener("visibilitychange", onVisibility);
        return () => cockpit.removeEventListener("visibilitychange", onVisibility);
    }, []);

    useEffect(() => {
        if (!enabled) {
            setStatus("error");
            setData(undefined);
            setError(new ProviderError("not-supported", cockpit.gettext("This diagnostic is not available.")));
            return;
        }
        if (hidden)
            return;

        let cancelled = false;
        setStatus("loading");
        setError(undefined);
        loaderRef.current().then(value => {
            if (cancelled)
                return;
            setData(value);
            setStatus("ready");
        })
                .catch(exc => {
                    if (cancelled)
                        return;
                    setData(undefined);
                    setError(normalizeSpawnError(exc));
                    setStatus("error");
                });

        return () => {
            cancelled = true;
        };
    }, [enabled, generation, hidden]);

    const reload = useCallback(() => {
        if (cockpit.hidden)
            return;
        setGeneration(value => value + 1);
    }, []);

    const state: AsyncProviderState<T> = { status, reload };
    if (data !== undefined)
        state.data = data;
    if (error !== undefined)
        state.error = error;
    return state;
}

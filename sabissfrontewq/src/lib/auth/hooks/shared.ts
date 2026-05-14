import { createSignal } from "solid-js";

import type { AuthAsyncStatus } from "../types.ts";

export function createAsyncEndpointHandler<TResult, TArgs extends unknown[]>(
  executor: (...args: TArgs) => Promise<TResult>,
) {
  const [data, setData] = createSignal<TResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<AuthAsyncStatus>("idle");

  const run = async (...args: TArgs): Promise<TResult> => {
    setStatus("pending");
    setError(null);

    try {
      const result = await executor(...args);
      setData(result);
      setStatus("success");
      return result;
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "Unknown request error";

      setError(message);
      setStatus("error");
      throw caughtError;
    }
  };

  const reset = () => {
    setData(null);
    setError(null);
    setStatus("idle");
  };

  return {
    data,
    error,
    status,
    run,
    reset,
  };
}

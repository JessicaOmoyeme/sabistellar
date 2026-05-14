import { createSignal } from "solid-js";

export function useAsyncTask<TArgs extends unknown[], TResult>(
  task: (...args: TArgs) => Promise<TResult>,
) {
  const [data, setData] = createSignal<TResult | null>(null);
  const [error, setError] = createSignal<unknown>(null);
  const [pending, setPending] = createSignal(false);

  async function run(...args: TArgs) {
    setPending(true);
    setError(null);

    try {
      const result = await task(...args);
      setData(() => result);

      return result;
    } catch (taskError) {
      setError(() => taskError);
      throw taskError;
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setData(null);
    setError(null);
    setPending(false);
  }

  return {
    data,
    error,
    pending,
    reset,
    run,
  };
}

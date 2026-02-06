import { AnyResult, InferErr, InferOk, Result } from "./result";

type ModeSetting = "default" | "settled";

type AllEagerDefaultReturn<T extends readonly Promise<AnyResult>[]> = Promise<
  Result<
    {
      [K in keyof T]: InferOk<Awaited<T[K]>>;
    },
    InferErr<Awaited<T[number]>>
  >
>;

type AllEagerSettledReturn<T extends readonly Promise<AnyResult>[]> = Promise<{
  [K in keyof T]: Awaited<T[K]>;
}>;

type AllEagerReturn<
  T extends readonly Promise<AnyResult>[],
  Mode extends ModeSetting
> = Mode extends "default"
  ? AllEagerDefaultReturn<T>
  : AllEagerSettledReturn<T>;

const allEager = async <
  T extends readonly Promise<AnyResult>[],
  Mode extends ModeSetting
>(
  promises: T,
  mode: Mode
): Promise<AllEagerReturn<T, Mode>> => {
  if (promises.length === 0) {
    return (mode === "settled" ? [] : Result.ok([])) as any;
  }

  if (mode === "settled") {
    return (await Promise.all(promises)) as any;
  }

  return (await new Promise((resolve) => {
    const data: unknown[] = new Array(promises.length);
    let remaining = promises.length;

    promises.forEach((promise, index) => {
      promise.then((result) => {
        if (result.status === "error") {
          resolve(result as any); // first error wins, subsequent calls are no-ops
          return;
        }
        data[index] = result.value;
        remaining--;
        if (remaining === 0) {
          resolve(Result.ok(data) as any);
        }
      });
    });
  })) as any;
};

type ConcurrencySetting = "unbounded" | number;

type AllLazyDefaultReturn<T extends readonly (() => Promise<AnyResult>)[]> =
  Promise<
    Result<
      {
        [K in keyof T]: InferOk<Awaited<ReturnType<T[K]>>>;
      },
      InferErr<Awaited<ReturnType<T[number]>>>
    >
  >;

type AllLazySettledReturn<T extends readonly (() => Promise<AnyResult>)[]> =
  Promise<{
    [K in keyof T]: Awaited<ReturnType<T[K]>>;
  }>;

type AllLazyReturn<
  T extends readonly (() => Promise<AnyResult>)[],
  Mode extends ModeSetting
> = Mode extends "default" ? AllLazyDefaultReturn<T> : AllLazySettledReturn<T>;

const allLazy = async <
  T extends readonly (() => Promise<AnyResult>)[],
  Mode extends ModeSetting
>(
  lazyPromises: T,
  mode: Mode,
  concurrency: ConcurrencySetting
): Promise<AllLazyReturn<T, Mode>> => {
  if (concurrency === "unbounded") {
    return (await allEager(
      lazyPromises.map((lp) => lp()),
      mode
    )) as any;
  }

  if (lazyPromises.length === 0) {
    return (mode === "settled" ? [] : Result.ok([])) as any;
  }

  return (await new Promise((resolve) => {
    const results: any[] = new Array(lazyPromises.length);
    let nextIndex = 0;
    let remaining = lazyPromises.length;
    let done = false;

    const resolveOuter = (result: any) => {
      done = true;
      resolve(result);
    };

    const runNext = () => {
      if (done || nextIndex >= lazyPromises.length) return;
      const i = nextIndex++;

      lazyPromises[i]!().then((result) => {
        if (mode === "settled") {
          results[i] = result;
        } else if (result.isErr()) {
          resolveOuter(result as any);
          return;
        } else {
          results[i] = result.value;
        }

        remaining--;
        if (remaining === 0) {
          resolveOuter(mode === "settled" ? results : Result.ok(results));
          return;
        }

        runNext();
      });
    };

    const poolSize = Math.min(concurrency, lazyPromises.length);
    for (let i = 0; i < poolSize; i++) runNext();
  })) as any;
};

export async function all<
  const T extends readonly Promise<AnyResult>[],
  Mode extends ModeSetting = "default"
>(
  promises: T,
  options?: {
    mode?: Mode;
    concurrency?: "unbounded";
  }
): Promise<AllEagerReturn<T, Mode>>;
export async function all<
  const T extends readonly (() => Promise<AnyResult>)[],
  Mode extends ModeSetting = "default"
>(
  promises: T,
  options?: {
    mode?: Mode;
    concurrency?: ConcurrencySetting;
  }
): Promise<AllLazyReturn<T, Mode>>;
export async function all<
  const T extends readonly Promise<AnyResult>[],
  Mode extends ModeSetting = "default"
>(
  promises: T,
  options?: {
    mode?: Mode;
    concurrency?: ConcurrencySetting;
  }
): Promise<AllEagerReturn<T, Mode>> {
  if (typeof promises[0] === "function") {
    return (await allLazy(
      promises as any,
      options?.mode ?? "default",
      options?.concurrency ?? "unbounded"
    )) as any;
  }

  return (await allEager(promises, options?.mode ?? "default")) as any;
}

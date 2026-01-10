# better-result

Lightweight Result type for TypeScript with generator-based composition.

## Install

```sh
npm install better-result
```

## Quick Start

```ts
import { Result } from "better-result";

// Wrap throwing functions
const parsed = Result.try(() => JSON.parse(input));

// Check and use
if (Result.isOk(parsed)) {
  console.log(parsed.value);
} else {
  console.error(parsed.error);
}

// Or use pattern matching
const message = parsed.match({
  ok: (data) => `Got: ${data.name}`,
  err: (e) => `Failed: ${e.message}`,
});
```

## Contents

- [Creating Results](#creating-results)
- [Transforming Results](#transforming-results)
- [Handling Errors](#handling-errors)
- [Extracting Values](#extracting-values)
- [Generator Composition](#generator-composition)
- [Retry Support](#retry-support)
- [Tagged Errors](#tagged-errors)
- [Serialization](#serialization)
- [API Reference](#api-reference)

## Creating Results

```ts
// Success
const ok = Result.ok(42);

// Error
const err = Result.err(new Error("failed"));

// From throwing function
const result = Result.try(() => riskyOperation());

// From promise
const result = await Result.tryPromise(() => fetch(url));

// With custom error handling
const result = Result.try({
  try: () => JSON.parse(input),
  catch: (e) => new ParseError(e),
});
```

## Transforming Results

```ts
const result = Result.ok(2)
  .map((x) => x * 2) // Ok(4)
  .andThen(
    (
      x, // Chain Result-returning functions
    ) => (x > 0 ? Result.ok(x) : Result.err("negative")),
  );

// Standalone functions (data-first or data-last)
Result.map(result, (x) => x + 1);
Result.map((x) => x + 1)(result); // Pipeable
```

## Handling Errors

```ts
// Transform error type
const result = fetchUser(id).mapError(
  (e) => new AppError(`Failed to fetch user: ${e.message}`),
);

// Recover from specific errors
const result = fetchUser(id).match({
  ok: (user) => Result.ok(user),
  err: (e) =>
    e._tag === "NotFoundError" ? Result.ok(defaultUser) : Result.err(e),
});
```

## Extracting Values

```ts
// Unwrap (throws on Err)
const value = result.unwrap();
const value = result.unwrap("custom error message");

// With fallback
const value = result.unwrapOr(defaultValue);

// Pattern match
const value = result.match({
  ok: (v) => v,
  err: (e) => fallback,
});
```

## Generator Composition

Chain multiple Results without nested callbacks or early returns:

```ts
const result = Result.gen(function* () {
  const a = yield* parseNumber(inputA); // Unwraps or short-circuits
  const b = yield* parseNumber(inputB);
  const c = yield* divide(a, b);
  return Result.ok(c);
});
// Result<number, ParseError | DivisionError>
```

Async version with `Result.await`:

```ts
const result = await Result.gen(async function* () {
  const user = yield* Result.await(fetchUser(id));
  const posts = yield* Result.await(fetchPosts(user.id));
  return Result.ok({ user, posts });
});
```

Errors from all yielded Results are automatically collected into the final error union type.

## Retry Support

```ts
const result = await Result.tryPromise(() => fetch(url), {
  retry: {
    times: 3,
    delayMs: 100,
    backoff: "exponential", // or "linear" | "constant"
  },
});
```

## Tagged Errors

Build exhaustive error handling with discriminated unions:

```ts
import { TaggedError } from "better-result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(readonly id: string) {
    super(`Not found: ${id}`);
  }
}

class ValidationError extends TaggedError {
  readonly _tag = "ValidationError" as const;
  constructor(readonly field: string) {
    super(`Invalid: ${field}`);
  }
}

type AppError = NotFoundError | ValidationError;

// Exhaustive matching
TaggedError.match(error, {
  NotFoundError: (e) => `Missing: ${e.id}`,
  ValidationError: (e) => `Bad field: ${e.field}`,
});

// Partial matching with fallback
TaggedError.matchPartial(
  error,
  { NotFoundError: (e) => `Missing: ${e.id}` },
  (e) => `Unknown error: ${e.message}`,
);
```

You can also use the factory helpers to avoid declaring `_tag` manually:

```ts
import { TaggedError } from "better-result";

class NotFoundError extends TaggedError.define("NotFoundError") {
  constructor(readonly id: string) {
    super(`Not found: ${id}`);
  }
}

class ValidationError extends TaggedError.define("ValidationError") {
  constructor(readonly field: string) {
    super(`Invalid: ${field}`);
  }
}

type AppError = NotFoundError | ValidationError;

const error = NotFoundError.from("123");

// Exhaustive matching
TaggedError.match(error, {
  NotFoundError: (e) => `Missing: ${e.id}`,
  ValidationError: (e) => `Bad field: ${e.field}`,
});

// Partial matching with fallback
TaggedError.matchPartial(
  error,
  { NotFoundError: (e) => `Missing: ${e.id}` },
  (e) => `Unknown error: ${e.message}`,
);
```

## Serialization

Rehydrate Results from JSON for storage or network transfer:

```ts
// Serialize a Result to JSON (e.g., for storage or network transfer)
const original = Result.ok(42);
const serialized = JSON.stringify(original);
// '{"_tag":"Ok","value":42}'

// Rehydrate the serialized Result back to a Result instance
const hydrated = Result.hydrate(JSON.parse(serialized));
// Result<number, never>

// Now you can use Result methods again
const doubled = hydrated.map((x) => x * 2); // Ok(84)

// Works with Err too
const errResult = Result.err(new Error("failed"));
const rehydrated = Result.hydrate(JSON.parse(JSON.stringify(errResult)));
// Result<never, Error>
```

## API Reference

### Result

| Method                           | Description                             |
| -------------------------------- | --------------------------------------- |
| `Result.ok(value)`               | Create success                          |
| `Result.err(error)`              | Create error                            |
| `Result.try(fn)`                 | Wrap throwing function                  |
| `Result.tryPromise(fn, config?)` | Wrap async function with optional retry |
| `Result.isOk(result)`            | Type guard for Ok                       |
| `Result.isError(result)`         | Type guard for Err                      |
| `Result.gen(fn)`                 | Generator composition                   |
| `Result.await(promise)`          | Wrap Promise<Result> for generators     |
| `Result.hydrate(value)`          | Rehydrate serialized Result             |

### Instance Methods

| Method                | Description                           |
| --------------------- | ------------------------------------- |
| `.map(fn)`            | Transform success value               |
| `.mapError(fn)`       | Transform error value                 |
| `.andThen(fn)`        | Chain Result-returning function       |
| `.andThenAsync(fn)`   | Chain async Result-returning function |
| `.match({ ok, err })` | Pattern match                         |
| `.unwrap(message?)`   | Extract value or throw                |
| `.unwrapOr(fallback)` | Extract value or return fallback      |
| `.tap(fn)`            | Side effect on success                |
| `.tapAsync(fn)`       | Async side effect on success          |

### TaggedError

| Method                                     | Description                          |
| ------------------------------------------ | ------------------------------------ |
| `TaggedError.define(tag)`                  | Create a tagged error subclass       |
| `TaggedError.from(...args)`                | Instantiate a tagged error subclass  |
| `TaggedError.isError(value)`               | Type guard for Error                 |
| `TaggedError.isTaggedError(value)`         | Type guard for TaggedError           |
| `TaggedError.match(error, handlers)`       | Exhaustive pattern match by `_tag`   |
| `TaggedError.matchPartial(error, h, else)` | Partial match with fallback          |

## License

MIT

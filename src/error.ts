/**
 * Base class for tagged errors.
 * Uses _tag discriminator for exhaustive pattern matching.
 *
 * @example
 * class NotFoundError extends TaggedError {
 *   readonly _tag = "NotFoundError" as const;
 *   constructor(readonly id: string) {
 *     super(`Not found: ${id}`);
 *   }
 * }
 */
type TaggedErrorStatic<Self extends typeof TaggedError> = Omit<Self, "prototype">;

type TaggedErrorDefined<Tag extends string, Self extends typeof TaggedError> =
  TaggedErrorStatic<Self> &
    (new (message: string, options?: ErrorOptions) => InstanceType<Self> & { readonly _tag: Tag }) &
    { readonly _tag: Tag };

export abstract class TaggedError extends Error {
  abstract readonly _tag: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);

    Object.setPrototypeOf(this, new.target.prototype);

    this.name = this.constructor.name;

    if (options?.cause !== undefined && options.cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }

  /**
   * Create a TaggedError subclass bound to a literal tag.
   */
  static define<Tag extends string, Self extends typeof TaggedError>(
    this: Self,
    tag: Tag,
  ): TaggedErrorDefined<Tag, Self> {
    const Base: typeof TaggedError = this;

    class BoundTaggedError extends Base {
      static readonly _tag = tag;
      readonly _tag = tag;

      constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = tag;
      }
    }

    // SAFETY: BoundTaggedError matches TaggedErrorDefined and inherits TaggedError statics.
    return BoundTaggedError as unknown as TaggedErrorDefined<Tag, Self>;
  }

  /**
   * Instantiate the current TaggedError subclass.
   */
  static from<Args extends unknown[], T extends TaggedError>(
    this: new (...args: Args) => T,
    ...args: Args
  ): T {
    // SAFETY: `this` is a concrete constructor for TaggedError.
    return new this(...args);
  }

  /**
   * Type guard for any Error instance.
   *
   * @example
   * if (TaggedError.isError(value)) { value.message }
   */
  static override isError(value: unknown): value is Error {
    return value instanceof Error;
  }

  /**
   * Type guard for TaggedError instances.
   *
   * @example
   * if (TaggedError.isTaggedError(value)) { value._tag }
   */
  static isTaggedError(value: unknown): value is TaggedError {
    return value instanceof Error && "_tag" in value && typeof value._tag === "string";
  }

  /**
   * Exhaustive pattern match on tagged error union.
   * Requires handlers for all _tag variants.
   *
   * @template E Tagged error union type.
   * @template T Return type.
   * @param error Error to match.
   * @param handlers Object mapping _tag to handler function.
   * @returns Result of matched handler.
   *
   * @example
   * TaggedError.match(error, {
   *   NotFoundError: (e) => `Missing: ${e.id}`,
   *   ValidationError: (e) => `Invalid: ${e.field}`,
   * });
   */
  static match<E extends TaggedError, T>(
    error: E,
    handlers: { [K in E["_tag"]]: (e: Extract<E, { _tag: K }>) => T },
  ): T {
    const tag = error._tag as E["_tag"];
    const handler = handlers[tag];
    if (!handler) {
      throw new Error(`No handler for error tag: ${error._tag}`);
    }
    return handler(error as Extract<E, { _tag: typeof tag }>);
  }

  /**
   * Partial pattern match with fallback for unhandled tags.
   *
   * @template E Tagged error union type.
   * @template T Return type.
   * @param error Error to match.
   * @param handlers Partial object mapping _tag to handler function.
   * @param otherwise Fallback handler for unmatched tags.
   * @returns Result of matched handler or otherwise.
   *
   * @example
   * TaggedError.matchPartial(error, {
   *   NotFoundError: (e) => `Missing: ${e.id}`,
   * }, (e) => `Unknown error: ${e.message}`);
   */
  static matchPartial<E extends TaggedError, T>(
    error: E,
    handlers: { [K in E["_tag"]]?: (e: Extract<E, { _tag: K }>) => T },
    otherwise: (e: E) => T,
  ): T {
    const tag = error._tag as E["_tag"];
    const handler = handlers[tag];
    if (handler) {
      return handler(error as Extract<E, { _tag: typeof tag }>);
    }
    return otherwise(error);
  }
}

/**
 * Wraps uncaught exceptions from Result.try/tryPromise.
 */
export class UnhandledException extends TaggedError {
  readonly _tag = "UnhandledException" as const;

  constructor(options: { cause: unknown }) {
    const message = options.cause instanceof Error ? options.cause.message : String(options.cause);
    super(`Unhandled exception: ${message}`, { cause: options.cause });
  }
}

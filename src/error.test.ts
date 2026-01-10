import { describe, expect, it } from "bun:test";
import { TaggedError, UnhandledException } from "./error";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;
  constructor(readonly id: string) {
    super(`Not found: ${id}`);
  }
}

class ValidationError extends TaggedError {
  readonly _tag = "ValidationError" as const;
  constructor(readonly field: string) {
    super(`Invalid field: ${field}`);
  }
}

class NetworkError extends TaggedError {
  readonly _tag = "NetworkError" as const;
  constructor(readonly url: string) {
    super(`Network error: ${url}`);
  }
}

type AppError = NotFoundError | ValidationError | NetworkError;

describe("TaggedError", () => {
  describe("construction", () => {
    it("sets name to constructor name", () => {
      const error = new NotFoundError("123");
      expect(error.name).toBe("NotFoundError");
    });

    it("sets message", () => {
      const error = new NotFoundError("123");
      expect(error.message).toBe("Not found: 123");
    });

    it("has _tag discriminator", () => {
      const error = new NotFoundError("123");
      expect(error._tag).toBe("NotFoundError");
    });

    it("preserves custom properties", () => {
      const error = new NotFoundError("abc");
      expect(error.id).toBe("abc");
    });

    it("chains cause in stack trace", () => {
      const cause = new Error("root cause");
      class ErrorWithCause extends TaggedError {
        readonly _tag = "ErrorWithCause" as const;
        constructor() {
          super("wrapper", { cause });
        }
      }
      const error = new ErrorWithCause();
      expect(error.stack).toContain("Caused by:");
      expect(error.stack).toContain("root cause");
    });
  });

  describe("isError", () => {
    it("returns true for Error", () => {
      expect(TaggedError.isError(new Error())).toBe(true);
    });

    it("returns true for TaggedError", () => {
      expect(TaggedError.isError(new NotFoundError("x"))).toBe(true);
    });

    it("returns false for non-errors", () => {
      expect(TaggedError.isError("string")).toBe(false);
      expect(TaggedError.isError(null)).toBe(false);
      expect(TaggedError.isError({ message: "fake" })).toBe(false);
    });
  });

  describe("isTaggedError", () => {
    it("returns true for TaggedError", () => {
      expect(TaggedError.isTaggedError(new NotFoundError("x"))).toBe(true);
    });

    it("returns false for plain Error", () => {
      expect(TaggedError.isTaggedError(new Error())).toBe(false);
    });

    it("returns false for non-errors", () => {
      expect(TaggedError.isTaggedError({ _tag: "fake" })).toBe(false);
    });
  });

  describe("match", () => {
    const matchAppError = (error: AppError) =>
      TaggedError.match(error, {
        NotFoundError: (e) => `missing: ${e.id}`,
        ValidationError: (e) => `invalid: ${e.field}`,
        NetworkError: (e) => `network: ${e.url}`,
      });

    it("matches NotFoundError", () => {
      const error: AppError = new NotFoundError("123");
      expect(matchAppError(error)).toBe("missing: 123");
    });

    it("matches ValidationError", () => {
      const error: AppError = new ValidationError("email");
      expect(matchAppError(error)).toBe("invalid: email");
    });

    it("matches NetworkError", () => {
      const error: AppError = new NetworkError("https://api.example.com");
      expect(matchAppError(error)).toBe("network: https://api.example.com");
    });
  });

  describe("matchPartial", () => {
    const matchPartialAppError = (error: AppError) =>
      TaggedError.matchPartial(
        error,
        {
          NotFoundError: (e) => `missing: ${e.id}`,
        },
        (e) => `fallback: ${e._tag}`,
      );

    it("matches known tag", () => {
      const error: AppError = new NotFoundError("123");
      expect(matchPartialAppError(error)).toBe("missing: 123");
    });

    it("falls back for unhandled tag", () => {
      const error: AppError = new NetworkError("https://api.example.com");
      expect(matchPartialAppError(error)).toBe("fallback: NetworkError");
    });
  });

  describe("define", () => {
    it("creates a tagged class with _tag", () => {
      const XError = TaggedError.define("XError");
      const error = new XError("boom");
      expect(error._tag).toBe("XError");
      expect(XError._tag).toBe("XError");
    });

    it("creates instances that are TaggedError", () => {
      const XError = TaggedError.define("XError");
      const error = new XError("boom");
      expect(error).toBeInstanceOf(TaggedError);
    });

    it("binds to subclasses of TaggedError", () => {
      abstract class AppTaggedError extends TaggedError {}
      class AppError extends AppTaggedError.define("AppError") {
        constructor(readonly code: number) {
          super(`app error: ${code}`);
        }
      }

      const error = new AppError(500);
      expect(error).toBeInstanceOf(AppTaggedError);
      expect(error._tag).toBe("AppError");
    });

    it("preserves static metadata on base class", () => {
      abstract class AppTaggedError extends TaggedError {
        static readonly code = 42;
      }
      class AppError extends AppTaggedError.define("AppError") {
        constructor(readonly code: number) {
          super(`app error: ${code}`);
        }
      }

      expect(AppError.code).toBe(42);
    });

    it("preserves static and instance metadata like the old extends style", () => {
      abstract class AppTaggedError extends TaggedError {
        static readonly category = "app" as const;
      }

      class MetaError extends AppTaggedError.define("MetaError") {
        readonly severity = "high" as const;
        constructor(readonly code: number) {
          super(`meta error: ${code}`);
        }
      }

      const error = new MetaError(7);
      expect(MetaError._tag).toBe("MetaError");
      expect(MetaError.category).toBe("app");
      expect(error._tag).toBe("MetaError");
      expect(error.severity).toBe("high");
      expect(error.code).toBe(7);
    });
  });

  describe("from", () => {
    it("constructs instance of TaggedError subclasses", () => {
      class FromError extends TaggedError.define("FromError") {
        constructor(readonly code: number) {
          super(`boom: ${code}`);
        }
      }

      const error = FromError.from(500);
      expect(error).toBeInstanceOf(FromError);
      expect(error._tag).toBe("FromError");
      expect(error.code).toBe(500);
    });
  });
});

describe("UnhandledException", () => {
  it("wraps Error cause", () => {
    const cause = new Error("original");
    const error = new UnhandledException({ cause });
    expect(error._tag).toBe("UnhandledException");
    expect(error.message).toBe("Unhandled exception: original");
    expect(error.cause).toBe(cause);
  });

  it("wraps non-Error cause", () => {
    const error = new UnhandledException({ cause: "string error" });
    expect(error.message).toBe("Unhandled exception: string error");
  });

  it("handles null cause", () => {
    const error = new UnhandledException({ cause: null });
    expect(error.message).toBe("Unhandled exception: null");
  });
});

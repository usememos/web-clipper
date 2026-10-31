import type { ConnectionSource } from "./connection-config";
import { getUiLocale, t } from "./i18n";
import { MIN_SUPPORTED_VERSION_LABEL } from "./versions";

/** Failure modes of an actual HTTP request to the user's Memos instance. */
export type InstanceErrorKind =
  | "mixed-content"
  | "cors"
  | "unreachable"
  | "unauthorized"
  | "timeout"
  | "bad-response"
  | "space-unavailable"
  | "unsupported-version"
  | "quota-exceeded"
  | "rate-limited";

/** Client-side preconditions that fail before any request is made. */
export type ClientErrorKind = "not-configured" | "auth-changed" | "auth-unavailable" | "extension-error" | "invalid-url" | "storage-error";

/** Everything a save attempt can report back to the UI. */
export type SaveErrorKind = InstanceErrorKind | ClientErrorKind;

export type SaveErrorDetail = {
  kind: SaveErrorKind;
  title: string;
  why: string;
  howToFix: string[];
  /**
   * Where the fix lives, so the UI can offer a button instead of prose:
   * "settings" → the connection/config is broken (reconnect in options); "retry" → transient, try again.
   */
  primaryAction: "settings" | "retry";
  /** Optional external guide (e.g. the upgrade docs) surfaced as a link by the UI. */
  learnMore?: { label: string; url: string };
};

/** The Memos self-host upgrade guide, linked when the instance is too old. */
export const MEMOS_UPGRADE_DOCS_URL = "https://www.usememos.com/docs/operations/upgrade";

export class InstanceError extends Error {
  readonly kind: InstanceErrorKind;
  /** The HTTP status that produced this error, when a response was received. */
  readonly status?: number;
  constructor(kind: InstanceErrorKind, status?: number) {
    super(kind);
    this.name = "InstanceError";
    this.kind = kind;
    if (status !== undefined) this.status = status;
  }
}

export class UnsupportedVersionError extends InstanceError {
  constructor(readonly version: string) {
    super("unsupported-version");
  }
}

/** The usage-limit metrics Memos enforces (26.10 and later), as named in its `QUOTA_EXCEEDED` error metadata. */
export type QuotaMetric = "MEMO_COUNT" | "MEMO_CONTENT_BYTES" | "STORAGE_BYTES" | "UPLOAD_BYTES";

/** What the server said about the limit it enforced. Fields are absent when the response did not carry them. */
export type QuotaRefusal = { metric?: QuotaMetric; limit?: number; usage?: number };

/** A 429 whose `google.rpc.ErrorInfo` reason is `QUOTA_EXCEEDED`: waiting does not help. */
export class QuotaExceededError extends InstanceError {
  constructor(readonly quota: QuotaRefusal) {
    super("quota-exceeded", 429);
  }
}

/** A 429 that recovers on its own, with the server's advertised delay when it gave one. */
export class RateLimitedError extends InstanceError {
  constructor(readonly retryAfterSeconds?: number) {
    super("rate-limited", 429);
  }
}

/** A failed save as reported to the UI: the kind, plus what the server said about a refused limit. */
export type SaveFailure = { ok: false; errorKind: SaveErrorKind; quota?: QuotaRefusal; retryAfterSeconds?: number };

/** Builds the UI-facing failure for a thrown error, carrying the limit details a quota or rate-limit refusal came with. */
export function toSaveFailure(error: unknown): SaveFailure {
  if (error instanceof QuotaExceededError) return { ok: false, errorKind: error.kind, quota: error.quota };
  if (error instanceof RateLimitedError) {
    return {
      ok: false,
      errorKind: error.kind,
      ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    };
  }
  return { ok: false, errorKind: toSaveErrorKind(error) };
}

/** Formats a byte count the way the active locale writes units, with one decimal for anything past kilobytes. */
export function formatBytes(bytes: number): string {
  const locale = getUiLocale();
  const format = (value: number, unit: "byte" | "kilobyte" | "megabyte"): string =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit,
      unitDisplay: unit === "byte" ? "narrow" : "short",
      maximumFractionDigits: unit === "byte" ? 0 : 1,
    }).format(value);
  if (bytes < 1000) return format(bytes, "byte");
  if (bytes < 1_000_000) return format(bytes / 1000, "kilobyte");
  return format(bytes / 1_000_000, "megabyte");
}

export class ClientError extends Error {
  readonly kind: ClientErrorKind;
  constructor(kind: ClientErrorKind) {
    super(kind);
    this.name = "ClientError";
    this.kind = kind;
  }
}

/** Maps a thrown error to the SaveErrorKind the UI can describe. */
export function toSaveErrorKind(error: unknown): SaveErrorKind {
  return error instanceof InstanceError || error instanceof ClientError ? error.kind : "bad-response";
}

/** The limit details a failure carried, used to name the exact limit in the copy when the server reported it. */
export type SaveErrorContext = Pick<SaveFailure, "quota" | "retryAfterSeconds">;

function describeQuota(quota: QuotaRefusal | undefined): SaveErrorDetail {
  const kind = "quota-exceeded";
  if (quota?.metric === "MEMO_CONTENT_BYTES" && quota.limit !== undefined && quota.usage !== undefined) {
    return {
      kind,
      primaryAction: "retry",
      title: t("errorQuotaContentTitle"),
      why: t("errorQuotaContentWhy", [formatBytes(quota.usage), formatBytes(quota.limit)]),
      howToFix: [t("errorQuotaContentFix")],
    };
  }
  if (quota?.metric === "MEMO_COUNT" && quota.limit !== undefined) {
    return {
      kind,
      primaryAction: "retry",
      title: t("errorQuotaCountTitle"),
      why: t("errorQuotaCountWhy", String(quota.limit)),
      howToFix: [t("errorQuotaCountFix")],
    };
  }
  return {
    kind,
    primaryAction: "retry",
    title: t("errorQuotaTitle"),
    why: t("errorQuotaWhy"),
    howToFix: [t("errorQuotaFix")],
  };
}

export function describeSaveError(kind: SaveErrorKind, source?: ConnectionSource | null, context?: SaveErrorContext): SaveErrorDetail {
  switch (kind) {
    case "quota-exceeded":
      return describeQuota(context?.quota);
    case "rate-limited":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorRateLimitedTitle"),
        why: t("errorRateLimitedWhy"),
        howToFix: [
          context?.retryAfterSeconds !== undefined
            ? t("errorRateLimitedFixWait", String(context.retryAfterSeconds))
            : t("errorRateLimitedFixRetry"),
        ],
      };
    case "space-unavailable":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorSpaceUnavailableTitle"),
        why: t("errorSpaceUnavailableWhy"),
        howToFix: [t("errorSpaceUnavailableFix")],
      };
    case "invalid-url":
      return {
        kind,
        primaryAction: "settings",
        title: t("errorInvalidUrlTitle"),
        why: t("errorInvalidUrlWhy"),
        howToFix: [t("errorInvalidUrlFix")],
      };
    case "extension-error":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorExtensionTitle"),
        why: t("errorExtensionWhy"),
        howToFix: [t("errorExtensionFix")],
      };
    case "storage-error":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorStorageTitle"),
        why: t("errorStorageWhy"),
        howToFix: [t("errorStorageFix")],
      };
    case "auth-changed":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorAuthChangedTitle"),
        why: t("errorAuthChangedWhy"),
        howToFix: [t("errorAuthChangedFix")],
      };
    case "auth-unavailable":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorAuthUnavailableTitle"),
        why: t("errorAuthUnavailableWhy"),
        howToFix: [t("errorAuthUnavailableFix")],
      };
    case "not-configured":
      return {
        kind,
        primaryAction: "settings",
        title: t("errorNotConfiguredTitle"),
        why: t("errorNotConfiguredWhy"),
        howToFix: [t("errorNotConfiguredFix")],
      };
    case "mixed-content":
      return {
        kind,
        primaryAction: "settings",
        title: t("errorMixedContentTitle"),
        why: t("errorMixedContentWhy"),
        howToFix: [t("errorMixedContentFixHttps"), t("errorMixedContentFixLocal")],
      };
    case "cors":
      return {
        kind,
        primaryAction: "settings",
        title: t("errorCorsTitle"),
        why: t("errorCorsWhy"),
        howToFix: [t("errorCorsFixOnline"), t("errorCorsFixUrl")],
      };
    case "unreachable":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorUnreachableTitle"),
        why: t("errorUnreachableWhy"),
        howToFix: [t("errorUnreachableFixOnline"), t("errorUnreachableFixOpen")],
      };
    case "unauthorized":
      return {
        kind,
        primaryAction: "settings",
        title: t("errorUnauthorizedTitle"),
        why: t("errorUnauthorizedWhy"),
        howToFix:
          source === "direct"
            ? [t("errorUnauthorizedDirectFixReplace"), t("errorUnauthorizedDirectFixCreate")]
            : [t("errorUnauthorizedAccountFixReconnect"), t("errorUnauthorizedAccountFixRegenerate")],
      };
    case "timeout":
      return {
        kind,
        primaryAction: "retry",
        title: t("errorTimeoutTitle"),
        why: t("errorTimeoutWhy"),
        howToFix: [t("errorTimeoutFixOnline"), t("errorTimeoutFixRetry")],
      };
    case "unsupported-version":
      return {
        kind,
        primaryAction: "settings",
        title: t("errorUnsupportedTitle"),
        why: t("errorUnsupportedWhy", MIN_SUPPORTED_VERSION_LABEL),
        howToFix: [t("errorUnsupportedFix", MIN_SUPPORTED_VERSION_LABEL)],
        learnMore: { label: t("errorUpgradeGuide"), url: MEMOS_UPGRADE_DOCS_URL },
      };
    case "bad-response":
      return {
        kind: "bad-response",
        primaryAction: "settings",
        title: t("errorBadResponseTitle"),
        why: t("errorBadResponseWhy"),
        howToFix: [t("errorBadResponseFixApi"), t("errorBadResponseFixRedirect")],
      };
    default: {
      // Exhaustiveness guard: if a new InstanceErrorKind is added without a case, this fails to compile.
      const _exhaustive: never = kind;
      void _exhaustive;
      return describeSaveError("bad-response");
    }
  }
}

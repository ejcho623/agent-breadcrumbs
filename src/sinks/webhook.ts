import type { WebhookSinkConfig } from "../types.js";
import type { LogSink, PersistedRecord } from "./index.js";

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

class WebhookHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`Webhook endpoint responded with status ${statusCode}.`);
    this.name = "WebhookHttpError";
    this.statusCode = statusCode;
  }
}

class WebhookTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Webhook request timed out after ${timeoutMs}ms.`);
    this.name = "WebhookTimeoutError";
  }
}

class WebhookTransportError extends Error {
  constructor(message: string) {
    super(`Webhook transport error: ${message}`);
    this.name = "WebhookTransportError";
  }
}

export function createWebhookSink(config: WebhookSinkConfig["config"]): LogSink {
  const { url, headers, timeout_ms: timeoutMs, retry } = config;

  return {
    write: async (record: PersistedRecord): Promise<void> => {
      const totalAttempts = retry.max_attempts + 1;

      for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
        try {
          await postToWebhook(url, headers, timeoutMs, record);
          return;
        } catch (error: unknown) {
          const normalizedError = normalizeWebhookError(error, timeoutMs);
          const shouldRetry = attempt < totalAttempts && isRetryable(normalizedError);
          if (!shouldRetry) {
            throw normalizedError;
          }
          await sleep(retry.backoff_ms * attempt);
        }
      }
    },
  };
}

async function postToWebhook(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  record: PersistedRecord,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(record),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new WebhookHttpError(response.status);
    }
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new WebhookTimeoutError(timeoutMs);
    }

    if (error instanceof WebhookHttpError) {
      throw error;
    }

    const rawMessage = error instanceof Error ? error.message : String(error);
    throw new WebhookTransportError(rawMessage);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWebhookError(error: unknown, timeoutMs: number): Error {
  if (error instanceof WebhookHttpError) {
    return error;
  }
  if (error instanceof WebhookTimeoutError) {
    return error;
  }
  if (error instanceof WebhookTransportError) {
    return error;
  }

  if (isAbortError(error)) {
    return new WebhookTimeoutError(timeoutMs);
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  return new WebhookTransportError(rawMessage);
}

function isRetryable(error: Error): boolean {
  if (error instanceof WebhookTimeoutError || error instanceof WebhookTransportError) {
    return true;
  }
  if (error instanceof WebhookHttpError) {
    return RETRYABLE_STATUS_CODES.has(error.statusCode);
  }
  return false;
}

function isAbortError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      typeof (error as { name: unknown }).name === "string" &&
      (error as { name: string }).name === "AbortError",
  );
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

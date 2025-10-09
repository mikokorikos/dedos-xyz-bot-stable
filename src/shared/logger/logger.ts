import { performance } from 'node:perf_hooks';

import type { Logger } from 'pino';

import { createChildLogger } from './pino';

interface FunctionRunLogger {
  step(status: string, meta?: Record<string, unknown>): void;
  success(meta?: Record<string, unknown>): void;
  error(error: unknown, meta?: Record<string, unknown>): void;
}

export interface StructuredLogger {
  readonly base: Logger;
  start(functionName: string, meta?: Record<string, unknown>): FunctionRunLogger;
  info(functionName: string, status: string, meta?: Record<string, unknown>): void;
  warn(functionName: string, status: string, meta?: Record<string, unknown>): void;
  error(functionName: string, status: string, error: unknown, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): StructuredLogger;
}

const toIsoTimestamp = (): string => new Date().toISOString();

const buildPayload = (
  functionName: string,
  status: string,
  meta?: Record<string, unknown>,
  durationMs?: number,
): Record<string, unknown> => ({
  function: functionName,
  status,
  timestamp: toIsoTimestamp(),
  ...(durationMs !== undefined ? { durationMs } : {}),
  ...(meta ?? {}),
});

const normalizeError = (error: unknown): { err?: unknown; stack?: string; message?: string } => {
  if (error instanceof Error) {
    return { err: error, stack: error.stack, message: error.message };
  }

  if (typeof error === 'object' && error !== null) {
    return { err: error };
  }

  return { err: { value: error } };
};

export const createModuleLogger = (moduleName: string): StructuredLogger => {
  const moduleLogger = createChildLogger({ module: moduleName });

  const start = (
    functionName: string,
    meta?: Record<string, unknown>,
  ): FunctionRunLogger => {
    const baseMeta = meta ? { ...meta } : undefined;
    const startTime = performance.now();
    moduleLogger.info(buildPayload(functionName, 'start', baseMeta));

    return {
      step(status, stepMeta) {
        moduleLogger.info(buildPayload(functionName, status, { ...baseMeta, ...(stepMeta ?? {}) }));
      },
      success(successMeta) {
        const durationMs = Number((performance.now() - startTime).toFixed(2));
        moduleLogger.info(
          buildPayload(functionName, 'success', { ...baseMeta, ...(successMeta ?? {}) }, durationMs),
        );
      },
      error(error, errorMeta) {
        const durationMs = Number((performance.now() - startTime).toFixed(2));
        const normalized = normalizeError(error);
        moduleLogger.error(
          {
            ...buildPayload(functionName, 'error', { ...baseMeta, ...(errorMeta ?? {}) }, durationMs),
            ...normalized,
          },
        );
      },
    };
  };

  const info = (
    functionName: string,
    status: string,
    meta?: Record<string, unknown>,
  ): void => {
    moduleLogger.info(buildPayload(functionName, status, meta));
  };

  const warn = (
    functionName: string,
    status: string,
    meta?: Record<string, unknown>,
  ): void => {
    moduleLogger.warn(buildPayload(functionName, status, meta));
  };

  const error = (
    functionName: string,
    status: string,
    err: unknown,
    meta?: Record<string, unknown>,
  ): void => {
    const normalized = normalizeError(err);
    moduleLogger.error({ ...buildPayload(functionName, status, meta), ...normalized });
  };

  const child = (bindings: Record<string, unknown>): StructuredLogger => {
    const childLogger = moduleLogger.child(bindings);

    return {
      base: childLogger,
      start(functionName, meta) {
        const baseMeta = meta ? { ...meta } : undefined;
        const startTime = performance.now();
        childLogger.info(buildPayload(functionName, 'start', baseMeta));
        return {
          step(status, stepMeta) {
            childLogger.info(buildPayload(functionName, status, { ...baseMeta, ...(stepMeta ?? {}) }));
          },
          success(successMeta) {
            const durationMs = Number((performance.now() - startTime).toFixed(2));
            childLogger.info(
              buildPayload(functionName, 'success', { ...baseMeta, ...(successMeta ?? {}) }, durationMs),
            );
          },
          error(errorValue, errorMeta) {
            const durationMs = Number((performance.now() - startTime).toFixed(2));
            const normalizedError = normalizeError(errorValue);
            childLogger.error(
              {
                ...buildPayload(functionName, 'error', { ...baseMeta, ...(errorMeta ?? {}) }, durationMs),
                ...normalizedError,
              },
            );
          },
        };
      },
      info(functionName, status, meta) {
        childLogger.info(buildPayload(functionName, status, meta));
      },
      warn(functionName, status, meta) {
        childLogger.warn(buildPayload(functionName, status, meta));
      },
      error(functionName, status, errValue, meta) {
        const normalizedError = normalizeError(errValue);
        childLogger.error({ ...buildPayload(functionName, status, meta), ...normalizedError });
      },
      child(grandChildBindings) {
        return createModuleLogger(moduleName).child({ ...bindings, ...grandChildBindings });
      },
    };
  };

  return {
    base: moduleLogger,
    start,
    info,
    warn,
    error,
    child,
  };
};

import {
  CompactPhase,
  CompactReason,
  CompactTrigger,
  traceContextToLogContext,
  type SessionEvent,
  type TraceContext,
} from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { createRuntimeModel } from "./runtime-model.js";

const SESSION_END_COMPACT_TIMEOUT_MS = 60_000;

export function compactSessionEnd(
  this: AgentRuntimeInternal,
  traceContext: TraceContext = this.rootTraceContext,
): Promise<void> {
  if (this.sessionEndCompactPromise) return this.sessionEndCompactPromise;
  const promise = runSessionEndCompact.call(this, traceContext);
  this.sessionEndCompactPromise = promise;
  return promise;
}

async function runSessionEndCompact(
  this: AgentRuntimeInternal,
  traceContext: TraceContext,
): Promise<void> {
  if (
    this.shuttingDown ||
    !this.sessionStore ||
    this.config.compact?.enabled === false ||
    this.hasActiveOrQueuedTurnWork() ||
    this.hasRunningBackgroundTasks() ||
    !this.getSessionModelSelection()
  ) {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_END_COMPACT_TIMEOUT_MS);
  timeout.unref?.();
  const events: SessionEvent[] = [];
  try {
    const model = createRuntimeModel(this, { selection: this.getSessionModelSelection() });
    await this.compactActiveConversation(undefined, traceContext, events, {
      abortSignal: controller.signal,
      compactReason: CompactReason.SessionEnd,
      phase: CompactPhase.StandaloneTurn,
      trigger: CompactTrigger.SessionEnd,
      model,
    });
  } catch (error) {
    this.logger?.warn("Session-end compact failed; continuing shutdown", {
      ...traceContextToLogContext(traceContext),
      errorMessage: error instanceof Error ? error.message : String(error),
      event: "compact.session_end.failed",
      module: "core.runtime",
      status: "failed",
    });
  } finally {
    clearTimeout(timeout);
  }
}

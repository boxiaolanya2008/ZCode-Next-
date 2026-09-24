import assert from "node:assert/strict";
import test from "node:test";

import {
  CompactPhase,
  CompactReason,
  CompactTrigger,
  parseCompactBoundaryPayload,
} from "@zcode/contracts";
import {
  defaultCompactPhaseForTrigger,
  defaultCompactReasonForTrigger,
} from "../src/runtime/helpers/compact.js";

test("session-end compact has a standalone phase and durable boundary", () => {
  assert.equal(
    defaultCompactPhaseForTrigger(CompactTrigger.SessionEnd),
    CompactPhase.StandaloneTurn,
  );
  assert.equal(defaultCompactReasonForTrigger(CompactTrigger.SessionEnd), CompactReason.SessionEnd);

  const boundary = parseCompactBoundaryPayload({
    boundaryId: "compact-session-end",
    preCompactTokenCount: 1200,
    summarizedMessageCount: 4,
    summaryMessageIds: ["summary-1"],
    traceId: "trace-1",
    trigger: CompactTrigger.SessionEnd,
    compactReason: CompactReason.SessionEnd,
    phase: CompactPhase.StandaloneTurn,
  });

  assert.equal(boundary.trigger, CompactTrigger.SessionEnd);
  assert.equal(boundary.compactReason, CompactReason.SessionEnd);
  assert.equal(boundary.phase, CompactPhase.StandaloneTurn);
});

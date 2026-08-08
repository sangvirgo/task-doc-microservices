import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../workflows/ci.yml", import.meta.url), "utf8");
const changesJobStart = workflow.indexOf("\n  changes:");
const changesJobEnd = workflow.indexOf("\n  build-backend-images:", changesJobStart);
const changesJob = workflow.slice(changesJobStart, changesJobEnd);

test("changes job fetches the event.before commit before diffing", () => {
  assert.match(
    changesJob,
    /uses: actions\/checkout@v4[\s\S]*?fetch-depth: 0/u,
  );
});

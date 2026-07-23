import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests exercise runTask end-to-end (fake backend), which appends real run
// records and reads real config. Without isolation, running `bun test` in
// this repo pollutes the developer's actual ~/.local/share/relay/runs.jsonl
// (inflating `relay savings`) — seen live when a relay worker ran the suite
// as part of a task. Point XDG at throwaway dirs before any module loads.
process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), "relay-test-data-"));
process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), "relay-test-config-"));

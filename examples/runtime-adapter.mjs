import { defineRuntimeAdapter, snapshotRuntime } from "../packages/runtime-adapter/index.mjs";

const adapter = defineRuntimeAdapter({
  id: "synthetic",
  label: "Synthetic read-only adapter",
  capabilities: {
    execution_receipts: true,
  },
  async health() {
    return { ok: true, state: "CONNECTED" };
  },
  async listTasks() {
    return [
      {
        id: "t_demo_1",
        assignee: "siti",
        state: "BLOCKED",
        title: "Review synthetic evidence",
        updated_at: new Date(0).toISOString(),
        evidence_ref: "demo://runtime/t_demo_1",
      },
    ];
  },
});

console.log(JSON.stringify(await snapshotRuntime(adapter), null, 2));

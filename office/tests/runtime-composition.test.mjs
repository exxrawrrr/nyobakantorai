import test from "node:test";
import assert from "node:assert/strict";
import { createConfiguredRuntimeProvider } from "../runtime-composition.mjs";

test("composition root exposes a generic provider surface while Hermes details stay behind it", async () => {
  const provider=createConfiguredRuntimeProvider({
    env:{ NYOBAKANTORAI_DISABLE_HERMES:"1" },
    employeeIds:["siti"],
    existsImpl:() => false,
  });
  assert.equal(provider.provider_id,"hermes");
  assert.equal(provider.configured,false);
  assert.deepEqual(Object.keys(provider).sort(),[
    "adapter","configured","describe","employeeSnapshot","provider_id","runtimeSnapshot"
  ]);
  const descriptor=await provider.describe();
  assert.equal(descriptor.provider_id,"hermes");
  assert.equal(descriptor.configured,false);
  assert.equal("board" in descriptor,false);
  assert.equal(descriptor.resource,"nyobakantorai");
});

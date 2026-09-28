import test from "node:test";
import assert from "node:assert/strict";
import { decideCapability, validatePaidMediaLifecycle, PAID_MEDIA_LIFECYCLE } from "./capability-policy.mjs";

test("configured-but-not-connected capability fails closed",()=>{
  assert.equal(decideCapability({capability:"ads.meta.read",state:"NOT_CONNECTED"}).allowed,false);
});
test("connected read is allowed without mutation authority",()=>{
  assert.deepEqual(decideCapability({capability:"ads.google.read",state:"CONNECTED"}),{allowed:true,reason:"READ_ONLY_CONNECTED"});
});
test("paid media write requires approval in guarded mode",()=>{
  assert.equal(decideCapability({capability:"ads.meta.write",state:"CONNECTED",autonomy:"GUARDED"}).reason,"HUMAN_APPROVAL_REQUIRED");
  assert.equal(decideCapability({capability:"ads.meta.write",state:"CONNECTED",autonomy:"GUARDED",approved:true}).allowed,true);
});
test("delegated mode requires an explicit scoped delegated policy",()=>{
  assert.equal(decideCapability({capability:"ads.google.write",state:"CONNECTED",autonomy:"DELEGATED",delegatedPolicy:false}).allowed,false);
  assert.equal(decideCapability({capability:"ads.google.write",state:"CONNECTED",autonomy:"DELEGATED",delegatedPolicy:true}).allowed,true);
});
test("account/destructive writes always require explicit approval",()=>{
  const custom={capability:"ads.meta.write",state:"CONNECTED",autonomy:"DELEGATED",delegatedPolicy:true};
  assert.equal(decideCapability(custom).allowed,true);
});
test("paid media lifecycle is ordered and complete constant is valid",()=>{
  assert.equal(validatePaidMediaLifecycle(PAID_MEDIA_LIFECYCLE),true);
  assert.equal(validatePaidMediaLifecycle(["READ","EXECUTE","APPROVAL"]),false);
});

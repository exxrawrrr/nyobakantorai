import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAPABILITY_ACCESS_MODES,
  createCapabilityRouter,
  validateCapabilityRouteDecision,
} from "./index.mjs";

const config=JSON.parse(readFileSync(new URL("../../config/capabilities.json", import.meta.url),"utf8"));
const employees=JSON.parse(readFileSync(new URL("../../config/employees.json", import.meta.url),"utf8"));
const employee=(id)=>employees.employees.find((item)=>item.id===id);

const snapshot=(capabilityId,{provider="fixture-provider",state="CONNECTED"}={})=>({
  provider_id:provider,
  checked_at:"2026-10-01T09:00:00.000Z",
  capabilities:{
    [capabilityId]:{
      state,
      evidence_ref:state==="CONNECTED" ? `connection:${provider}:${capabilityId}` : null,
    },
  },
});

const target=(id="account-fixture")=>({
  resource_type:"ad_account",
  resource_id:id,
});

const grant=(overrides={})=>({
  schema:1,
  grant_id:"grant-fixture-001",
  employee_id:"maya",
  capability_id:"ads.meta.read",
  access_modes:["READ"],
  actions:["inspect"],
  targets:[target()],
  issued_at:"2026-10-01T08:00:00.000Z",
  expires_at:null,
  evidence_ref:"grant-evidence:fixture-001",
  ...overrides,
});

const makeRouter=(grants=[])=>createCapabilityRouter({
  catalog:config.capabilities,
  states:config.states,
  autonomyModes:config.autonomy_modes,
  defaultAutonomy:config.default_mode,
  grants,
});

test("action access mode catalog is exact",()=>{
  assert.deepEqual(CAPABILITY_ACCESS_MODES,["READ","WRITE"]);
});

test("connected read action requires exact employee grant and exact target",()=>{
  const router=makeRouter([grant()]);
  const allowed=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
    autonomy:"GUARDED",
  });

  assert.equal(allowed.allowed,true);
  assert.equal(allowed.decision,"AUTHORIZED_READ");
  assert.equal(allowed.employee_id,"maya");
  assert.equal(allowed.connection.provider_id,"fixture-provider");
  assert.equal(allowed.grant.grant_id,"grant-fixture-001");
  assert.match(allowed.capability_route_ref,/^capability-route:sha256:[a-f0-9]{64}$/);
  assert.equal(validateCapabilityRouteDecision(allowed),true);

  const wrongTarget=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target("other-account"),
    snapshots:[snapshot("ads.meta.read")],
    autonomy:"GUARDED",
  });
  assert.equal(wrongTarget.allowed,false);
  assert.equal(wrongTarget.reason,"TARGET_RESOURCE_OUT_OF_SCOPE");
});

test("worker capability scope still blocks before resource grant or provider resolution",()=>{
  const router=makeRouter([grant({
    employee_id:"fikri",
    capability_id:"ads.meta.read",
  })]);
  const result=router.authorizeActionForEmployee({
    employee:employee("fikri"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"WORKER_CAPABILITY_OUT_OF_SCOPE");
  assert.equal(result.connection,null);
});

test("missing or malformed grant fails closed",()=>{
  const noGrant=makeRouter([]).authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.equal(noGrant.allowed,false);
  assert.equal(noGrant.reason,"RESOURCE_GRANT_MISSING");

  assert.throws(()=>makeRouter([{
    ...grant(),
    evidence_ref:null,
  }]),/grant.*evidence_ref/i);
});

test("expired grant cannot authorize an action",()=>{
  const router=makeRouter([grant({expires_at:"2026-10-01T08:30:00.000Z"})]);
  const result=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
    now:"2026-10-01T09:00:00.000Z",
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"RESOURCE_GRANT_EXPIRED");
});

test("WRITE cannot be requested through a read-only capability contract",()=>{
  const router=makeRouter([grant({access_modes:["WRITE"]})]);
  const result=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
    autonomy:"GUARDED",
    approvalStatus:"APPROVED",
    approvalRef:"approval:fixture",
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"ACCESS_MODE_INCOMPATIBLE_WITH_CAPABILITY");
});

test("GUARDED write requires APPROVED status and approval evidence ref",()=>{
  const writeGrant=grant({
    grant_id:"grant-write-001",
    capability_id:"ads.meta.write",
    access_modes:["WRITE"],
    actions:["update-budget"],
  });
  const router=makeRouter([writeGrant]);

  const pending=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"GUARDED",
    approvalStatus:"PENDING",
  });
  assert.equal(pending.allowed,false);
  assert.equal(pending.decision,"WAITING_FOR_APPROVAL");

  const noRef=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"GUARDED",
    approvalStatus:"APPROVED",
  });
  assert.equal(noRef.allowed,false);
  assert.equal(noRef.reason,"APPROVAL_EVIDENCE_REQUIRED");

  const approved=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"GUARDED",
    approvalStatus:"APPROVED",
    approvalRef:"approval:owner:fixture",
  });
  assert.equal(approved.allowed,true);
  assert.equal(approved.decision,"AUTHORIZED_GUARDED_WRITE");
  assert.equal(approved.approval_ref,"approval:owner:fixture");
});

test("OBSERVE blocks WRITE even with grant, connection and approval",()=>{
  const router=makeRouter([grant({
    grant_id:"grant-write-observe",
    capability_id:"ads.meta.write",
    access_modes:["WRITE"],
    actions:["update-budget"],
  })]);
  const result=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"OBSERVE",
    approvalStatus:"APPROVED",
    approvalRef:"approval:owner:fixture",
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"OBSERVE_MODE_NO_WRITES");
});

test("DELEGATED write requires both capability delegation and resource grant",()=>{
  const router=makeRouter([grant({
    grant_id:"grant-write-delegated",
    capability_id:"ads.meta.write",
    access_modes:["WRITE"],
    actions:["update-budget"],
  })]);

  const blocked=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"DELEGATED",
    delegatedCapabilities:[],
  });
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,"OUTSIDE_DELEGATED_SCOPE");

  const allowed=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"DELEGATED",
    delegatedCapabilities:["ads.meta.write"],
  });
  assert.equal(allowed.allowed,true);
  assert.equal(allowed.decision,"AUTHORIZED_DELEGATED_WRITE");
});

test("disconnected capability cannot appear authorized despite valid grant",()=>{
  const router=makeRouter([grant()]);
  const result=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read",{state:"NOT_CONNECTED"})],
  });
  assert.equal(result.allowed,false);
  assert.equal(result.reason,"CAPABILITY_NOT_CONNECTED");
});

test("action route emits evidence requirements appropriate to READ vs WRITE",()=>{
  const readRouter=makeRouter([grant()]);
  const read=readRouter.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.deepEqual(read.required_evidence,[
    "CONNECTION_EVIDENCE",
    "RESOURCE_GRANT_EVIDENCE",
    "RESULT_EVIDENCE",
  ]);

  const writeRouter=makeRouter([grant({
    grant_id:"grant-write-evidence",
    capability_id:"ads.meta.write",
    access_modes:["WRITE"],
    actions:["update-budget"],
  })]);
  const write=writeRouter.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.write",
    action:"update-budget",
    accessMode:"WRITE",
    target:target(),
    snapshots:[snapshot("ads.meta.write")],
    autonomy:"GUARDED",
    approvalStatus:"APPROVED",
    approvalRef:"approval:owner:fixture",
  });
  assert.deepEqual(write.required_evidence,[
    "CONNECTION_EVIDENCE",
    "RESOURCE_GRANT_EVIDENCE",
    "APPROVAL_EVIDENCE",
    "PRE_ACTION_STATE",
    "EXECUTION_RECEIPT",
    "POST_ACTION_STATE",
  ]);
});

test("same normalized authorization facts produce same route ref regardless grant/action set order",()=>{
  const g1=grant({
    access_modes:["READ","WRITE"],
    actions:["inspect","export"],
    targets:[target("account-fixture"),target("secondary")],
  });
  const g2=grant({
    access_modes:["WRITE","READ"],
    actions:["export","inspect"],
    targets:[target("secondary"),target("account-fixture")],
  });
  const r1=makeRouter([g1]).authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
  });
  const r2=makeRouter([g2]).authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.equal(r1.capability_route_ref,r2.capability_route_ref);
});

test("route decision digest detects tampering",()=>{
  const router=makeRouter([grant()]);
  const route=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
  });
  assert.equal(validateCapabilityRouteDecision(route),true);

  const tampered={
    ...route,
    target:{...route.target,resource_id:"other-account"},
  };
  assert.throws(()=>validateCapabilityRouteDecision(tampered),/route ref.*content|digest|payload/i);
});


test("grant cannot authorize before issued_at or at/after expires_at",()=>{
  const future=makeRouter([grant({issued_at:"2026-10-01T10:00:00.000Z"})]).authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
    now:"2026-10-01T09:00:00.000Z",
  });
  assert.equal(future.allowed,false);
  assert.equal(future.reason,"RESOURCE_GRANT_NOT_YET_VALID");

  const expired=makeRouter([grant({expires_at:"2026-10-01T09:00:00.000Z"})]).authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
    now:"2026-10-01T09:00:00.000Z",
  });
  assert.equal(expired.allowed,false);
  assert.equal(expired.reason,"RESOURCE_GRANT_EXPIRED");
});

test("route digest binds full grant policy and connection/capability authorization metadata",()=>{
  const router=makeRouter([grant()]);
  const route=router.authorizeActionForEmployee({
    employee:employee("maya"),
    capabilityId:"ads.meta.read",
    action:"inspect",
    accessMode:"READ",
    target:target(),
    snapshots:[snapshot("ads.meta.read")],
  });

  assert.throws(()=>validateCapabilityRouteDecision({
    ...route,
    grant:{...route.grant,actions:["different-action"]},
  }),/route ref.*content|digest|payload/i);

  assert.throws(()=>validateCapabilityRouteDecision({
    ...route,
    connection:{...route.connection,state:"NOT_CONNECTED"},
  }),/route ref.*content|digest|payload/i);

  assert.throws(()=>validateCapabilityRouteDecision({
    ...route,
    capability:{...route.capability,requires_human_approval:true},
  }),/route ref.*content|digest|payload/i);
});

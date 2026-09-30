import { readFile } from "node:fs/promises";
import { buildProfileMemoryView, promoteToShared } from "../../packages/memory-learning/index.mjs";

const employees=JSON.parse(await readFile(new URL("../../config/employees.json", import.meta.url),"utf8"));
const employeeIds=employees.employees.map((item)=>item.id);

const baseEvent=(overrides={})=>({
  schema:1,
  event_id:"evt.maya.private-roas",
  employee_id:"maya",
  layer:"M2",
  created_at:"2026-09-29T05:00:00.000Z",
  summary:"This account uses ROAS as its primary optimization metric.",
  evidence_refs:["receipt://memory/1"],
  source_refs:["source://memory/1"],
  sensitivity:"INTERNAL",
  confidence:0.95,
  shared_scope:null,
  human_review:false,
  supersedes:[],
  ...overrides,
});

const cases=[];
function record(case_id, passed, observation) {
  cases.push({ case_id, passed:Boolean(passed), false_success:!passed, observation });
}

const mayaPrivate=baseEvent();
const gugunPrivate=baseEvent({
  event_id:"evt.gugun.private-search",
  employee_id:"gugun",
  summary:"Gugun private search-account lesson.",
});
const promoted=promoteToShared(baseEvent({
  event_id:"evt.maya.shared-source",
  summary:"Verified shared naming convention for project alpha.",
}),{
  sharedScope:"project-alpha",
  approved:true,
  reviewer:"owner",
});

const gugunPrivateView=buildProfileMemoryView({events:[mayaPrivate,gugunPrivate],employeeId:"gugun",employeeIds});
record(
  "maya-private-not-visible-to-gugun",
  gugunPrivateView.events.length===1
    && gugunPrivateView.events[0].event_id==="evt.gugun.private-search"
    && !gugunPrivateView.events.some((item)=>item.event_id==="evt.maya.private-roas"),
  gugunPrivateView
);

const mayaPrivateView=buildProfileMemoryView({events:[mayaPrivate,gugunPrivate],employeeId:"maya",employeeIds});
record(
  "gugun-private-not-visible-to-maya",
  mayaPrivateView.events.length===1
    && mayaPrivateView.events[0].event_id==="evt.maya.private-roas"
    && !mayaPrivateView.events.some((item)=>item.event_id==="evt.gugun.private-search"),
  mayaPrivateView
);

const noScope=buildProfileMemoryView({events:[promoted],employeeId:"gugun",employeeIds});
record(
  "shared-memory-requires-explicit-scope",
  noScope.events.length===0 && noScope.denied.some((item)=>item.reason==="SHARED_SCOPE_NOT_AUTHORIZED"),
  noScope
);

const authorized=buildProfileMemoryView({
  events:[promoted,mayaPrivate],
  employeeId:"gugun",
  authorizedSharedScopes:["project-alpha"],
  employeeIds,
});
record(
  "authorized-m3-visible-private-source-still-hidden",
  authorized.events.some((item)=>item.event_id==="evt.maya.shared-source")
    && !authorized.events.some((item)=>item.event_id==="evt.maya.private-roas"),
  authorized
);

const forged=buildProfileMemoryView({
  events:[baseEvent({
    event_id:"evt.maya.forged-m3",
    layer:"M3",
    shared_scope:"project-alpha",
    human_review:true,
  })],
  employeeId:"gugun",
  authorizedSharedScopes:["project-alpha"],
  employeeIds,
});
record(
  "forged-m3-fails-closed",
  forged.events.length===0 && forged.denied.some((item)=>item.reason==="INVALID_EVENT"),
  forged
);

const falseSuccesses=cases.filter((item)=>item.false_success);
const summary={
  schema:1,
  benchmark:"deterministic-local-memory-isolation",
  deterministic:true,
  live_provider_claim:false,
  cases:cases.length,
  passed:cases.filter((item)=>item.passed).length,
  failed:cases.filter((item)=>!item.passed).length,
  false_successes:falseSuccesses.length,
  false_success_rate:cases.length?falseSuccesses.length/cases.length:0,
  results:cases,
};

console.log(JSON.stringify(summary,null,2));
if (process.argv.includes("--check") && summary.failed>0) process.exitCode=1;

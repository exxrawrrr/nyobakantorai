import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  containsSecretLikeContent,
  validateLearningEvent,
  promoteToShared,
  validateSkillCandidate,
  markSkillCandidateForReview,
  markSkillCandidateMerged,
  exportProfileLearningState,
  deleteProfileLearningState,
  buildProfileMemoryView,
} from "./index.mjs";

const employees=JSON.parse(readFileSync(new URL("../../config/employees.json", import.meta.url),"utf8"));
const ids=employees.employees.map((e)=>e.id);

const event=()=>({
  schema:1,
  event_id:"evt.fikri.0001",
  employee_id:"fikri",
  layer:"M1",
  created_at:"2026-09-29T02:00:00.000Z",
  summary:"Repeated source compaction preserved exact constraints and reduced retries.",
  evidence_refs:["receipt://task/1"],
  source_refs:["source://task/1"],
  sensitivity:"INTERNAL",
  confidence:0.9,
  shared_scope:null,
  human_review:false,
  supersedes:[],
});

test("valid profile learning event passes",()=>{
  assert.deepEqual(validateLearningEvent(event(),{employeeIds:ids}),[]);
});

test("secret-like learning content fails closed",()=>{
  const bad={...event(),summary:"api_key=supersecretvalue123456789"};
  assert.ok(validateLearningEvent(bad,{employeeIds:ids}).some((e)=>/secret/i.test(e)));
  assert.equal(containsSecretLikeContent(bad.summary),true);
});

test("shared promotion requires explicit review and scope",()=>{
  assert.throws(()=>promoteToShared(event(),{sharedScope:"project"}),/human review/);
  const promoted=promoteToShared(event(),{sharedScope:"project-alpha",approved:true,reviewer:"owner"});
  assert.equal(promoted.layer,"M3");
  assert.equal(promoted.shared_scope,"project-alpha");
  assert.equal(promoted.human_review,true);
  assert.equal(promoted.reviewed_by,"owner");
  assert.deepEqual(validateLearningEvent(promoted,{employeeIds:ids}),[]);
});

test("M3 cannot appear without shared scope and review",()=>{
  const bad={...event(),layer:"M3",shared_scope:null,human_review:false};
  const errors=validateLearningEvent(bad,{employeeIds:ids});
  assert.ok(errors.some((e)=>/shared_scope/.test(e)));
  assert.ok(errors.some((e)=>/human_review/.test(e)));
});

const candidate=()=>({
  schema:1,
  candidate_id:"skillcand.fikri.0001",
  employee_id:"fikri",
  skill_name:"nyoba-context-prompt-compiler",
  created_at:"2026-09-29T02:00:00.000Z",
  proposal:"Add an exact path/URL atom guard before compaction.",
  evidence_refs:["receipt://task/1","receipt://task/2","receipt://task/3"],
  observation_ids:["obs-1","obs-2","obs-3"],
  promotion_basis:"THREE_PLUS_INDEPENDENT_OBSERVATIONS",
  status:"CANDIDATE",
  human_rule_ref:null,
  repository_pr:null,
});

test("skill candidate requires three independent observations or explicit human rule",()=>{
  assert.deepEqual(validateSkillCandidate(candidate(),{employeeIds:ids}),[]);
  const weak={...candidate(),observation_ids:["obs-1","obs-1"]};
  assert.ok(validateSkillCandidate(weak,{employeeIds:ids}).some((e)=>/three independent/.test(e)));
  const human={...candidate(),promotion_basis:"EXPLICIT_HUMAN_RULE",observation_ids:[],human_rule_ref:"owner-rule://1"};
  assert.deepEqual(validateSkillCandidate(human,{employeeIds:ids}),[]);
});

test("candidate cannot become canonical without review and repository PR",()=>{
  assert.throws(()=>markSkillCandidateMerged(candidate(),{repositoryPr:"https://github.com/example/pr/1",approved:true}),/REVIEW_REQUIRED/);
  const reviewing=markSkillCandidateForReview(candidate(),{reviewer:"owner"});
  const merged=markSkillCandidateMerged(reviewing,{repositoryPr:"https://github.com/exxrawrrr/nyobakantorai/pull/99",approved:true});
  assert.equal(merged.status,"MERGED_VIA_REPOSITORY_PR");
  assert.match(merged.repository_pr,/pull\/99/);
});


test("profile learning export stays scoped and excludes shared memory by default",()=>{
  const fikri=event();
  const maya={...event(),event_id:"evt.maya.0001",employee_id:"maya"};
  const shared={...event(),event_id:"evt.fikri.shared1",layer:"M3",shared_scope:"project-alpha",human_review:true,reviewed_by:"owner"};
  const bundle=exportProfileLearningState({
    events:[fikri,maya,shared],
    candidates:[candidate()],
    employeeId:"fikri",
  });
  assert.deepEqual(bundle.events.map((item)=>item.event_id),["evt.fikri.0001"]);
  assert.equal(bundle.skill_candidates.length,1);
  const withShared=exportProfileLearningState({events:[fikri,maya,shared],candidates:[],employeeId:"fikri",includeShared:true});
  assert.deepEqual(withShared.events.map((item)=>item.event_id).sort(),["evt.fikri.0001","evt.fikri.shared1"]);
});

test("profile deletion removes private learning but preserves promoted shared knowledge and merged canonical history",()=>{
  const privateEvent=event();
  const shared={...event(),event_id:"evt.fikri.shared2",layer:"M3",shared_scope:"project-alpha",human_review:true,reviewed_by:"owner"};
  const other={...event(),event_id:"evt.maya.0002",employee_id:"maya"};
  const reviewing={...candidate(),status:"REVIEW_REQUIRED",reviewed_by:"owner"};
  const merged={...candidate(),candidate_id:"skillcand.fikri.0002",status:"MERGED_VIA_REPOSITORY_PR",repository_pr:"https://github.com/exxrawrrr/nyobakantorai/pull/99"};
  const result=deleteProfileLearningState({
    events:[privateEvent,shared,other],
    candidates:[reviewing,merged],
    employeeId:"fikri",
  });
  assert.deepEqual(result.deleted.events.map((item)=>item.event_id),["evt.fikri.0001"]);
  assert.deepEqual(result.preserved.shared_events.map((item)=>item.event_id),["evt.fikri.shared2"]);
  assert.deepEqual(result.deleted.skill_candidates.map((item)=>item.candidate_id),["skillcand.fikri.0001"]);
  assert.deepEqual(result.preserved.merged_skill_candidates.map((item)=>item.candidate_id),["skillcand.fikri.0002"]);
  assert.ok(result.remaining.events.some((item)=>item.employee_id==="maya"));
});

test("shared profile memory deletion requires explicit deleteShared opt-in",()=>{
  const shared={...event(),event_id:"evt.fikri.shared3",layer:"M3",shared_scope:"project-alpha",human_review:true,reviewed_by:"owner"};
  const result=deleteProfileLearningState({events:[shared],candidates:[],employeeId:"fikri",deleteShared:true});
  assert.equal(result.remaining.events.length,0);
  assert.deepEqual(result.deleted.events.map((item)=>item.event_id),["evt.fikri.shared3"]);
});


test("profile memory view blocks cross-profile private contamination",()=>{
  const mayaPrivate={
    ...event(),
    event_id:"evt.maya.private1",
    employee_id:"maya",
    layer:"M2",
    summary:"This account uses ROAS as its primary optimization metric.",
  };
  const gugunPrivate={
    ...event(),
    event_id:"evt.gugun.private1",
    employee_id:"gugun",
    layer:"M2",
    summary:"Search account notes belong to Gugun only.",
  };

  const gugunView=buildProfileMemoryView({
    events:[mayaPrivate,gugunPrivate],
    employeeId:"gugun",
    employeeIds:ids,
  });

  assert.deepEqual(gugunView.events.map((item)=>item.event_id),["evt.gugun.private1"]);
  assert.ok(gugunView.denied.some((item)=>
    item.event_id==="evt.maya.private1" && item.reason==="CROSS_PROFILE_PRIVATE"
  ));
  assert.equal(gugunView.events.some((item)=>item.summary.includes("ROAS")),false);
});

test("M3 promotion is still invisible until its shared scope is explicitly authorized",()=>{
  const mayaPrivate={
    ...event(),
    event_id:"evt.maya.share-source",
    employee_id:"maya",
    layer:"M2",
    summary:"Verified paid-media naming convention for project alpha.",
  };
  const shared=promoteToShared(mayaPrivate,{
    sharedScope:"project-alpha",
    approved:true,
    reviewer:"owner",
  });

  const withoutScope=buildProfileMemoryView({
    events:[shared],
    employeeId:"gugun",
    employeeIds:ids,
  });
  assert.equal(withoutScope.events.length,0);
  assert.equal(withoutScope.denied[0].reason,"SHARED_SCOPE_NOT_AUTHORIZED");

  const withScope=buildProfileMemoryView({
    events:[shared],
    employeeId:"gugun",
    authorizedSharedScopes:["project-alpha"],
    employeeIds:ids,
  });
  assert.deepEqual(withScope.events.map((item)=>item.event_id),["evt.maya.share-source"]);
});

test("forged or invalid M3 event fails closed instead of leaking into another profile",()=>{
  const forged={
    ...event(),
    event_id:"evt.maya.forged-shared",
    employee_id:"maya",
    layer:"M3",
    shared_scope:"project-alpha",
    human_review:true,
  };
  const view=buildProfileMemoryView({
    events:[forged],
    employeeId:"gugun",
    authorizedSharedScopes:["project-alpha"],
    employeeIds:ids,
  });
  assert.equal(view.events.length,0);
  assert.equal(view.denied[0].reason,"INVALID_EVENT");
  assert.ok(view.denied[0].details.some((item)=>/reviewed_by/.test(item)));
});

test("M4 repository candidates are not injected into runtime memory context",()=>{
  const m4={
    ...event(),
    event_id:"evt.fikri.m4candidate",
    layer:"M4",
    human_review:true,
  };
  const view=buildProfileMemoryView({
    events:[m4],
    employeeId:"fikri",
    employeeIds:ids,
  });
  assert.equal(view.events.length,0);
  assert.equal(view.denied[0].reason,"REPOSITORY_CANDIDATE_NOT_RUNTIME_MEMORY");
});

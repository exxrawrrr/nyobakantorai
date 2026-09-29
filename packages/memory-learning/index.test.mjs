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

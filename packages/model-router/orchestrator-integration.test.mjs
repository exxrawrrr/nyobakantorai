import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defineRuntimeExecutionAdapter } from "../runtime-execution-adapter/index.mjs";
import { planMission } from "../mission-engine/planner.mjs";
import { executeMissionPlan } from "../mission-engine/orchestrator.mjs";
import { routeModel } from "./index.mjs";
import { bindModelRouteToRuntime } from "./runtime-resolution.mjs";

const root = new URL("../../", import.meta.url);
const policy = JSON.parse(await readFile(new URL("config/runtime-execution-policy.json", root), "utf8"));
const clock = () => "2026-10-01T08:30:00.000Z";
const ids = (kind, index, label) => `${kind === "task" ? "tnode" : kind}-modelroute-${index + 1}-${String(label).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

function modelRequest() {
  return {
    schema:1,
    task_class:"REASONING",
    modalities:["text"],
    reasoning_depth:"HIGH",
    min_context_tokens:32000,
    latency_target_ms:null,
    estimated_input_tokens:2000,
    estimated_output_tokens:500,
    budget_usd:0.02,
    privacy:"STANDARD",
    allow_fallback:true,
    user_policy:{ allowed_providers:[], denied_providers:[], allow_cloud:true },
    provider_health:{ "provider-fixture":"HEALTHY" },
  };
}

function candidate() {
  return {
    schema:1,
    model_id:"reasoning-fixture",
    provider_id:"provider-fixture",
    runtime_id:"runtime-fixture",
    task_classes:["REASONING"],
    modalities:["text"],
    max_reasoning_depth:"HIGH",
    locality:"LOCAL",
    context_tokens:64000,
    p95_latency_ms:1000,
    pricing_usd_per_million:{ input:1, output:2 },
    enabled:true,
  };
}

function adapter() {
  return defineRuntimeExecutionAdapter({
    id:"model-route-fixture-adapter",
    version:"1.0.0",
    runtime:{ provider:"provider-fixture", runtime_ref:"runtime-fixture", provider_version:"1.0" },
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare() {
      return { workspace:{ kind:"TEMPORARY", ref:"tmp://model-route", isolated:true, production_repo:false }, session_ref:"session:model-route" };
    },
    async executeBoundedTask() {
      return { text:"bounded synthetic route result" };
    },
    async normalizeResult() {
      return {
        schema:1,
        state:"SUCCEEDED",
        summary:"Synthetic model route completed.",
        output:{ ok:true },
        artifact_refs:["artifact:model-route:normalized"],
        evidence_refs:["evidence:model-route:normalized"],
      };
    },
    async collectEvidence() {
      return {
        schema:1,
        raw_result_ref:"artifact:model-route:raw",
        normalized_result_ref:"artifact:model-route:normalized",
        capabilities_used:["model_inference","temporary_workspace","evidence_collection"],
        workspace_mutation_check:{ temporary_workspace_only:true, production_repo_changed:false },
        prohibited_action_check:{ passed:true, observed:[] },
        runtime_actions:{ install:false, login:false, account_mutation:false, external_write:false },
        evidence_refs:["evidence:model-route:runtime"],
        artifact_refs:["artifact:model-route:raw","artifact:model-route:normalized"],
      };
    },
    async cleanup() {
      return { ok:true };
    },
  });
}

test("bound model route reaches the Execution Attempt unchanged", async () => {
  const route=routeModel(modelRequest(), [candidate()]);
  const resolution=bindModelRouteToRuntime(route, {
    adapter:adapter(),
    policy,
    required_capabilities:["model_inference","temporary_workspace","evidence_collection"],
    capability_route_refs:["capability-route:model-fixture"],
  });

  const plan=planMission({
    objective:"Run one reasoning fixture through the selected model route.",
    risk_class:"READ_ONLY",
    work_items:[{
      key:"reason",
      title:"Reason over fixture",
      objective:"Produce one bounded synthetic reasoning result.",
      assigned_id:"subagjo",
      depends_on:[],
    }],
  }, { clock, idFactory:ids });

  const result=await executeMissionPlan(plan, {
    resolveRuntime:async () => resolution,
    clock,
  });

  assert.equal(result.mission.state, "SUCCEEDED");
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].model_route_ref, route.model_route_ref);
  assert.equal(result.attempts[0].runtime.provider, route.selected.provider_id);
  assert.equal(result.attempts[0].runtime.runtime_ref, route.selected.runtime_id);
});

test("binding rejects adapter/provider or runtime identity drift before orchestration", () => {
  const route=routeModel(modelRequest(), [candidate()]);
  const wrongAdapter=defineRuntimeExecutionAdapter({
    id:"wrong-route-adapter",
    version:"1.0.0",
    runtime:{ provider:"other-provider", runtime_ref:"other-runtime", provider_version:"1.0" },
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare(){ return { workspace:{kind:"TEMPORARY",ref:"tmp://wrong",isolated:true,production_repo:false},session_ref:"wrong" }; },
    async executeBoundedTask(){ return {}; },
    async normalizeResult(){ return {schema:1,state:"SUCCEEDED",summary:"wrong",output:{},artifact_refs:[],evidence_refs:[]}; },
    async collectEvidence(){ return {schema:1,raw_result_ref:"a",normalized_result_ref:"b",capabilities_used:[],workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},prohibited_action_check:{passed:true,observed:[]},runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},evidence_refs:[],artifact_refs:[]}; },
    async cleanup(){ return {ok:true}; },
  });

  assert.throws(
    () => bindModelRouteToRuntime(route, {
      adapter:wrongAdapter,
      policy,
      required_capabilities:["model_inference"],
    }),
    /provider.*does not match|runtime.*does not match/i,
  );
});


test("binding rejects a tampered route decision whose content no longer matches its route ref", () => {
  const route=routeModel(modelRequest(), [candidate()]);
  const tampered={
    ...route,
    selected:{
      ...route.selected,
      provider_id:"other-provider",
      runtime_id:"other-runtime",
    },
  };
  const matchingTamperedAdapter=defineRuntimeExecutionAdapter({
    id:"tampered-route-adapter",
    version:"1.0.0",
    runtime:{ provider:"other-provider", runtime_ref:"other-runtime", provider_version:"1.0" },
    capabilities:["model_inference","temporary_workspace","evidence_collection"],
    side_effects:{},
    process_contract:null,
    async prepare(){ return { workspace:{kind:"TEMPORARY",ref:"tmp://tampered",isolated:true,production_repo:false},session_ref:"tampered" }; },
    async executeBoundedTask(){ return {}; },
    async normalizeResult(){ return {schema:1,state:"SUCCEEDED",summary:"tampered",output:{},artifact_refs:[],evidence_refs:[]}; },
    async collectEvidence(){ return {schema:1,raw_result_ref:"a",normalized_result_ref:"b",capabilities_used:[],workspace_mutation_check:{temporary_workspace_only:true,production_repo_changed:false},prohibited_action_check:{passed:true,observed:[]},runtime_actions:{install:false,login:false,account_mutation:false,external_write:false},evidence_refs:[],artifact_refs:[]}; },
    async cleanup(){ return {ok:true}; },
  });

  assert.throws(
    () => bindModelRouteToRuntime(tampered, {
      adapter:matchingTamperedAdapter,
      policy,
      required_capabilities:["model_inference"],
    }),
    /route ref.*payload|digest|content/i,
  );
});

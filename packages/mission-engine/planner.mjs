import { routeWork } from "../../lib/routing.mjs";
import { PORTABLE_EMPLOYEE_BY_ID } from "../../lib/workforce.mjs";
import { normalizeMission } from "./contracts.mjs";
import { normalizeTaskNode } from "../task-registry/task-node.mjs";

export const MISSION_PLAN_SCHEMA = 1;
export const PLANNER_STRATEGIES = Object.freeze([
  "RULE_BASED_V1",
  "EXPLICIT_WORK_ITEMS",
  "COORDINATOR_FALLBACK",
]);

const STRATEGY_SET = new Set(PLANNER_STRATEGIES);
const HIGH_IMPACT = new Set(["EXTERNAL_WRITE","PAID_ACTION","ACCOUNT_CHANGE","DESTRUCTIVE"]);

const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const unique = (values, max = 1000) => Object.freeze([...new Set((Array.isArray(values) ? values : [])
  .map((value) => clean(value, max))
  .filter(Boolean))]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function slug(value) {
  const normalized = clean(value, 120).toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function validTimestamp(value) {
  return typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value));
}

function approvalForRisk(riskClass) {
  const required = HIGH_IMPACT.has(riskClass);
  return Object.freeze({
    required,
    status:required ? "PENDING" : "NOT_REQUIRED",
    approval_ref:null,
  });
}

function deterministicBlueprints(objective) {
  const q = clean(objective).toLowerCase();
  const complexSignal = /(research|competitor|compare|audit|analysis|analy[sz]e|report|brief|seo|cro|data|kpi|github|code|ci|campaign|ads|strategy|investigate|evaluate|review)/i.test(q);

  if (!complexSignal) {
    return Object.freeze({
      strategy:"COORDINATOR_FALLBACK",
      assumptions:Object.freeze([
        "The objective does not contain enough deterministic planning signals for safe multi-step decomposition.",
      ]),
      unknowns:Object.freeze([
        "Whether the objective should be decomposed into specialist subtasks.",
      ]),
      work_items:Object.freeze([{
        key:"coordinate",
        title:"Coordinate bounded objective",
        objective,
        route_text:objective,
        required_skills:Object.freeze([]),
        required_evidence:Object.freeze([]),
        depends_on:Object.freeze([]),
      }]),
    });
  }

  return Object.freeze({
    strategy:"RULE_BASED_V1",
    assumptions:Object.freeze([
      "Independent source collection and domain analysis can begin without depending on each other.",
      "Synthesis should wait for both evidence collection and domain analysis.",
      "Independent verification should wait for synthesis.",
    ]),
    unknowns:Object.freeze([
      "The final runtime/model/tool choices are intentionally unresolved until later routing chats.",
      "The completeness of external evidence is unknown until execution occurs.",
    ]),
    work_items:Object.freeze([
      {
        key:"evidence",
        title:"Collect source evidence",
        objective:`Collect bounded source evidence relevant to: ${objective}`,
        route_text:`research compare sources evidence ${objective}`,
        required_skills:Object.freeze(["nyoba-research-synthesis"]),
        required_evidence:Object.freeze(["source provenance", "retrieval evidence"]),
        depends_on:Object.freeze([]),
      },
      {
        key:"domain",
        title:"Analyze domain requirements",
        objective:`Analyze the domain-specific requirements and risks for: ${objective}`,
        route_text:objective,
        required_skills:Object.freeze([]),
        required_evidence:Object.freeze(["analysis basis"]),
        depends_on:Object.freeze([]),
      },
      {
        key:"synthesis",
        title:"Synthesize mission result",
        objective:`Synthesize a bounded result for: ${objective}`,
        route_text:"coordinate decision synthesis handoff",
        required_skills:Object.freeze(["nyoba-cross-team-briefing"]),
        required_evidence:Object.freeze(["input task references", "decision rationale"]),
        depends_on:Object.freeze(["evidence","domain"]),
      },
      {
        key:"verify",
        title:"Verify mission evidence",
        objective:`Independently verify the synthesized result for: ${objective}`,
        route_text:"verify review qa evidence audit result",
        required_skills:Object.freeze(["nyoba-independent-qa"]),
        required_evidence:Object.freeze(["independent verification findings"]),
        depends_on:Object.freeze(["synthesis"]),
      },
    ]),
  });
}

function normalizeWorkItem(item = {}, index = 0) {
  assert(item && typeof item === "object" && !Array.isArray(item), "Planner work item must be an object.");
  const key = slug(item.key || item.title || `task-${index + 1}`);
  const title = clean(item.title, 160);
  const objective = clean(item.objective, 4000);
  assert(title, "Planner work item title is required.");
  assert(objective, "Planner work item objective is required.");
  return Object.freeze({
    key,
    title,
    objective,
    route_text:clean(item.route_text || objective, 4000),
    assigned_id:clean(item.assigned_id, 40).toLowerCase() || null,
    required_skills:unique(item.required_skills, 160),
    required_evidence:unique(item.required_evidence),
    constraints:unique(item.constraints),
    depends_on:unique(item.depends_on, 120).map(slug),
    risk_class:item.risk_class == null ? null : clean(item.risk_class, 40).toUpperCase(),
  });
}

function explicitBlueprints(workItems = []) {
  assert(Array.isArray(workItems) && workItems.length > 0, "Explicit planner work_items must be a non-empty array.");
  const normalized = workItems.map(normalizeWorkItem);
  const keys = new Set();
  for (const item of normalized) {
    assert(!keys.has(item.key), `Duplicate planner work item key: ${item.key}`);
    keys.add(item.key);
  }
  for (const item of normalized) {
    for (const dep of item.depends_on) {
      assert(keys.has(dep), `Unknown planner work item dependency: ${dep}`);
      assert(dep !== item.key, `Planner work item cannot depend on itself: ${item.key}`);
    }
  }
  return Object.freeze({
    strategy:"EXPLICIT_WORK_ITEMS",
    assumptions:Object.freeze([]),
    unknowns:Object.freeze([]),
    work_items:Object.freeze(normalized),
  });
}

export function validateTaskGraph(taskIdsInput = [], edgesInput = []) {
  const taskIds = unique(taskIdsInput, 160);
  assert(taskIds.length === (Array.isArray(taskIdsInput) ? taskIdsInput.length : 0), "Task graph task IDs must be unique.");
  const taskSet = new Set(taskIds);
  const edges = Array.isArray(edgesInput) ? edgesInput : [];
  const seen = new Set();
  const outgoing = new Map(taskIds.map((id) => [id, []]));
  const indegree = new Map(taskIds.map((id) => [id, 0]));

  for (const raw of edges) {
    assert(raw && typeof raw === "object" && !Array.isArray(raw), "Task graph edge must be an object.");
    const from = clean(raw.from, 160);
    const to = clean(raw.to, 160);
    assert(taskSet.has(from), `Task graph edge references unknown dependency node: ${from}`);
    assert(taskSet.has(to), `Task graph edge references unknown dependent node: ${to}`);
    assert(from !== to, `Task graph self dependency is forbidden: ${from}`);
    const key = `${from}->${to}`;
    assert(!seen.has(key), `Duplicate task graph edge: ${key}`);
    seen.add(key);
    outgoing.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }

  const queue = taskIds.filter((id) => indegree.get(id) === 0).sort();
  const layers = [];
  let visited = 0;
  let frontier = queue;

  while (frontier.length) {
    const layer = [...frontier].sort();
    layers.push(Object.freeze(layer));
    visited += layer.length;
    const next = [];
    for (const id of layer) {
      for (const dependent of [...outgoing.get(id)].sort()) {
        indegree.set(dependent, indegree.get(dependent) - 1);
        if (indegree.get(dependent) === 0) next.push(dependent);
      }
    }
    frontier = [...new Set(next)].sort();
  }

  assert(visited === taskIds.length, "Task graph contains a cycle.");

  return Object.freeze({
    ok:true,
    task_ids:Object.freeze(taskIds),
    edges:Object.freeze(edges.map((edge) => Object.freeze({
      from:clean(edge.from, 160),
      to:clean(edge.to, 160),
    }))),
    topological_layers:Object.freeze(layers),
    parallel_groups:Object.freeze(layers.filter((layer) => layer.length > 1)),
    roots:Object.freeze(layers[0] ? [...layers[0]] : []),
    leaves:Object.freeze(taskIds.filter((id) => outgoing.get(id).length === 0).sort()),
  });
}

export function readyTaskIds(planInput, completedTaskIds = []) {
  const plan = normalizeMissionPlan(planInput);
  const completed = new Set(unique(completedTaskIds, 160));
  const taskSet = new Set(plan.graph.task_ids);
  for (const id of completed) assert(taskSet.has(id), `Completed task ID is not in plan: ${id}`);

  const dependencies = new Map(plan.graph.task_ids.map((id) => [id, []]));
  for (const edge of plan.graph.edges) dependencies.get(edge.to).push(edge.from);

  return Object.freeze(plan.graph.task_ids
    .filter((id) => !completed.has(id))
    .filter((id) => dependencies.get(id).every((dep) => completed.has(dep)))
    .sort());
}

function canonicalizeJsonNumber(value) {
  return typeof value === "number" && Object.is(value, -0) ? 0 : value;
}

function normalizeRouteDecision(route = {}) {
  const employee = clean(route.employee, 40).toLowerCase();
  assert(PORTABLE_EMPLOYEE_BY_ID[employee], "Plan route decision references unknown employee.");
  const source = clean(route.source, 80);
  assert(source, "Plan route decision source is required.");
  return Object.freeze({
    employee,
    source,
    score:route.score == null ? null : canonicalizeJsonNumber(Number(route.score)),
    reasons:unique(route.reasons),
    factors:Object.freeze(Object.fromEntries(
      Object.entries(structuredClone(route.factors || {}))
        .map(([key, value]) => [key, canonicalizeJsonNumber(value)])
    )),
  });
}

function normalizeNodeMeta(meta = {}) {
  assert(meta && typeof meta === "object" && !Array.isArray(meta), "Plan node metadata must be an object.");
  const taskId = clean(meta.task_id, 160);
  assert(taskId, "Plan node metadata task_id is required.");
  const budget = meta.budget_policy || {};
  const amount = budget.hard_limit_amount == null ? null : Number(budget.hard_limit_amount);
  const currency = budget.currency == null ? null : clean(budget.currency, 3).toUpperCase();
  if (amount != null) {
    assert(Number.isFinite(amount) && amount >= 0, "Plan node budget amount must be non-negative or null.");
    assert(/^[A-Z]{3}$/.test(currency || ""), "Plan node budget currency is invalid.");
  } else {
    assert(currency == null, "Plan node budget currency must be null without amount.");
  }

  return Object.freeze({
    task_id:taskId,
    key:slug(meta.key),
    depends_on:unique(meta.depends_on, 160),
    constraints:unique(meta.constraints),
    required_skills:unique(meta.required_skills, 160),
    required_evidence:unique(meta.required_evidence),
    budget_policy:Object.freeze({
      source:"MISSION_SHARED",
      hard_limit_amount:amount,
      currency,
    }),
    route:normalizeRouteDecision(meta.route),
  });
}

export function normalizeMissionPlan(input = {}) {
  assert(input && typeof input === "object" && !Array.isArray(input), "Mission Plan input must be an object.");
  assert(input.schema === MISSION_PLAN_SCHEMA, "Mission Plan schema must be 1.");
  const strategy = clean(input.strategy, 80).toUpperCase();
  assert(STRATEGY_SET.has(strategy), "Mission Plan strategy is invalid.");
  const generatedAt = clean(input.generated_at, 80);
  assert(validTimestamp(generatedAt), "Mission Plan generated_at must be a valid timestamp.");

  const mission = normalizeMission(input.mission);
  const taskNodes = Object.freeze((Array.isArray(input.task_nodes) ? input.task_nodes : []).map(normalizeTaskNode));
  assert(taskNodes.length > 0, "Mission Plan requires at least one TaskNode.");
  const taskIds = taskNodes.map((task) => task.task_id);
  assert(new Set(taskIds).size === taskIds.length, "Mission Plan TaskNode IDs must be unique.");
  assert(taskNodes.every((task) => task.mission_id === mission.mission_id), "Mission Plan TaskNodes must reference the Mission.");
  assert(JSON.stringify([...mission.task_ids].sort()) === JSON.stringify([...taskIds].sort()), "Mission task_ids must exactly match plan TaskNodes.");

  const graph = validateTaskGraph(taskIds, input.graph?.edges || []);
  const nodeMeta = Object.freeze((Array.isArray(input.node_meta) ? input.node_meta : []).map(normalizeNodeMeta));
  assert(nodeMeta.length === taskNodes.length, "Mission Plan requires one node_meta record per TaskNode.");
  assert(new Set(nodeMeta.map((meta) => meta.task_id)).size === taskNodes.length, "Mission Plan node_meta task IDs must be unique.");
  assert(nodeMeta.every((meta) => taskIds.includes(meta.task_id)), "Mission Plan node_meta references unknown TaskNode.");

  const metaByTask = new Map(nodeMeta.map((meta) => [meta.task_id, meta]));
  const depsByTask = new Map(taskIds.map((id) => [id, []]));
  for (const edge of graph.edges) depsByTask.get(edge.to).push(edge.from);
  for (const id of taskIds) {
    const expected = [...depsByTask.get(id)].sort();
    const actual = [...metaByTask.get(id).depends_on].sort();
    assert(JSON.stringify(actual) === JSON.stringify(expected), `Mission Plan dependency metadata drift for ${id}`);
  }

  return Object.freeze({
    schema:MISSION_PLAN_SCHEMA,
    strategy,
    mission,
    task_nodes:taskNodes,
    node_meta:nodeMeta,
    graph,
    assumptions:unique(input.assumptions),
    unknowns:unique(input.unknowns),
    generated_at:new Date(generatedAt).toISOString(),
  });
}

export function validateMissionPlan(input) {
  normalizeMissionPlan(input);
  return true;
}

export function planMission(request = {}, {
  clock = () => new Date().toISOString(),
  idFactory = (kind, index, label) => `${kind}-${String(index + 1).padStart(3, "0")}-${slug(label)}`,
  workload = {},
  history = {},
} = {}) {
  assert(request && typeof request === "object" && !Array.isArray(request), "Mission planning request must be an object.");
  const objective = clean(request.objective, 4000);
  assert(objective, "Mission planning objective is required.");
  const generatedAt = clock();
  assert(validTimestamp(generatedAt), "Mission planner clock must return a valid timestamp.");

  const globalConstraints = unique(request.constraints);
  const globalRequiredEvidence = unique(request.required_evidence);
  const riskClass = clean(request.risk_class || "READ_ONLY", 40).toUpperCase();
  const missionId = clean(request.mission_id, 160) || idFactory("mission", 0, objective);
  const blueprint = Array.isArray(request.work_items) && request.work_items.length
    ? explicitBlueprints(request.work_items)
    : deterministicBlueprints(objective);
  const assumptions = unique([...(request.assumptions || []), ...blueprint.assumptions]);
  const unknowns = unique([...(request.unknowns || []), ...blueprint.unknowns]);

  const keyToTaskId = new Map();
  blueprint.work_items.forEach((item, index) => {
    const taskId = idFactory("task", index, item.key);
    assert(!keyToTaskId.has(item.key), `Duplicate planner work item key: ${item.key}`);
    assert(![...keyToTaskId.values()].includes(taskId), `Planner idFactory produced duplicate TaskNode ID: ${taskId}`);
    keyToTaskId.set(item.key, taskId);
  });

  const taskNodes = [];
  const nodeMeta = [];
  const edges = [];
  for (let index = 0; index < blueprint.work_items.length; index += 1) {
    const raw = blueprint.work_items[index];
    const item = raw.required_skills ? raw : normalizeWorkItem(raw, index);
    const taskId = keyToTaskId.get(item.key);
    const itemRisk = item.risk_class || riskClass;
    const route = routeWork(item.route_text || item.objective, {
      assignedId:item.assigned_id || "",
      requiredSkills:item.required_skills || [],
      workload,
      riskClass:itemRisk,
      history,
    });
    assert(PORTABLE_EMPLOYEE_BY_ID[route.employee], "Mission planner routed to an unknown employee.");

    const task = normalizeTaskNode({
      schema:1,
      task_id:taskId,
      mission_id:missionId,
      title:item.title,
      objective:item.objective,
      employee_id:route.employee,
      risk_class:itemRisk,
      state:"PLANNED",
      approval:approvalForRisk(itemRisk),
      attempt_ids:[],
      evidence_refs:[],
      receipt_refs:[],
      blocking:null,
      legacy:null,
      created_at:generatedAt,
      updated_at:generatedAt,
    });
    taskNodes.push(task);

    const dependsOn = (item.depends_on || []).map((key) => {
      assert(keyToTaskId.has(key), `Unknown planner dependency key: ${key}`);
      return keyToTaskId.get(key);
    });
    for (const dependency of dependsOn) edges.push({ from:dependency, to:taskId });

    nodeMeta.push({
      task_id:taskId,
      key:item.key,
      depends_on:dependsOn,
      constraints:unique([...globalConstraints, ...(item.constraints || [])]),
      required_skills:item.required_skills || [],
      required_evidence:unique([...globalRequiredEvidence, ...(item.required_evidence || [])]),
      budget_policy:{
        source:"MISSION_SHARED",
        hard_limit_amount:request.budget?.hard_limit_amount ?? null,
        currency:request.budget?.currency ?? null,
      },
      route,
    });
  }

  const graph = validateTaskGraph(taskNodes.map((task) => task.task_id), edges);
  const mission = normalizeMission({
    schema:1,
    mission_id:missionId,
    objective,
    constraints:globalConstraints,
    risk_class:riskClass,
    budget:request.budget || { hard_limit_amount:null, currency:null },
    autonomy:request.autonomy || { mode:"GUARDED", delegated_capabilities:[] },
    task_ids:taskNodes.map((task) => task.task_id),
    artifact_refs:[],
    evidence_refs:[],
    approval_refs:[],
    state:"PLANNED",
    created_at:generatedAt,
    updated_at:generatedAt,
  });

  return normalizeMissionPlan({
    schema:MISSION_PLAN_SCHEMA,
    strategy:blueprint.strategy,
    mission,
    task_nodes:taskNodes,
    node_meta:nodeMeta,
    graph:{ edges:graph.edges },
    assumptions,
    unknowns,
    generated_at:generatedAt,
  });
}

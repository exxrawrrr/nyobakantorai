const byId = (root, id) => root.getElementById(id);
const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const cleanList = (values, max = 1000) => Object.freeze((Array.isArray(values) ? values : []).map((value) => clean(value, max)).filter(Boolean));
const nullableNumber = (value) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;

function publicTelemetry(value, employeeById) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const employeeId = clean(value.employee?.employee_id,80);
  const employee = employeeById?.[employeeId] || {};
  const costKnown = value.usage?.cost?.status === "KNOWN" && Number.isFinite(Number(value.usage.cost.amount_usd));
  return Object.freeze({
    employee_id:employeeId,
    employee_name:clean(employee.name || employeeId || "Unknown employee",120),
    employee_role:clean(employee.role || "",160),
    execution:Object.freeze({
      attempt_id:clean(value.execution?.attempt_id,160),
      ordinal:nullableNumber(value.execution?.ordinal),
      state:clean(value.execution?.state || "UNKNOWN",40),
      terminal:value.execution?.terminal === true,
      state_source:clean(value.execution?.state_source || "UNKNOWN",120),
    }),
    timing:Object.freeze({
      started_at:value.timing?.started_at == null ? null : clean(value.timing.started_at,80),
      finished_at:value.timing?.finished_at == null ? null : clean(value.timing.finished_at,80),
      duration_ms:nullableNumber(value.timing?.duration_ms),
    }),
    model:Object.freeze({
      status:value.model?.status === "KNOWN" ? "KNOWN" : "UNKNOWN",
      provider_id:clean(value.model?.provider_id || "UNKNOWN",120),
      model_id:value.model?.model_id == null ? null : clean(value.model.model_id,240),
      model_route_ref:value.model?.model_route_ref == null ? null : clean(value.model.model_route_ref,1000),
      source:clean(value.model?.source || "UNKNOWN",120),
    }),
    runtime:Object.freeze({
      provider:clean(value.runtime?.provider || "UNKNOWN",120),
      runtime_ref:clean(value.runtime?.runtime_ref || "UNKNOWN",512),
      provider_version:value.runtime?.provider_version == null ? null : clean(value.runtime.provider_version,120),
    }),
    tools:Object.freeze({
      status:value.tools?.status === "KNOWN" ? "KNOWN" : "UNKNOWN",
      tool_ids:cleanList(value.tools?.tool_ids,160),
      capability_route_refs:cleanList(value.tools?.capability_route_refs,1000),
      source:clean(value.tools?.source || "UNKNOWN",120),
    }),
    usage:Object.freeze({
      source:clean(value.usage?.source || "UNKNOWN",120),
      duration_ms:nullableNumber(value.usage?.duration_ms),
      tool_calls:nullableNumber(value.usage?.tool_calls),
      input_tokens:nullableNumber(value.usage?.input_tokens),
      output_tokens:nullableNumber(value.usage?.output_tokens),
      total_tokens:nullableNumber(value.usage?.total_tokens),
      cost:Object.freeze(costKnown
        ? {status:"KNOWN",amount_usd:Number(value.usage.cost.amount_usd)}
        : {status:"UNKNOWN",amount_usd:null}),
    }),
    artifact_refs:cleanList(value.artifact_refs),
    evidence_refs:cleanList(value.evidence_refs),
    receipt_ref:value.receipt_ref == null ? null : clean(value.receipt_ref,1000),
    unknowns:cleanList(value.unknowns),
    blockers:Object.freeze((Array.isArray(value.blockers) ? value.blockers : []).map((item) => Object.freeze({
      source:clean(item?.source || "UNKNOWN",120),
      code:clean(item?.code || "UNKNOWN",120),
      detail:item?.detail == null ? null : clean(item.detail,1000),
    }))),
    residual_risks:cleanList(value.residual_risks),
    traceability:Object.freeze({
      terminal_state_ref:clean(value.traceability?.terminal_state_ref || "",1000) || null,
      sandbox_admission_ref:clean(value.traceability?.sandbox_admission_ref || "",1000) || null,
      sandbox_record_ref:clean(value.traceability?.sandbox_record_ref || "",1000) || null,
      previous_attempt_id:clean(value.traceability?.previous_attempt_id || "",160) || null,
      recovery_checkpoint_ref:clean(value.traceability?.recovery_checkpoint_ref || "",1000) || null,
    }),
  });
}

function publicNode(node, employeeById) {
  const employee = employeeById?.[node.employee_id] || {};
  return Object.freeze({
    task_id:clean(node.task_id,160),
    title:clean(node.title,240),
    employee_id:clean(node.employee_id,80),
    employee_name:clean(employee.name || node.employee_id || "Unassigned",120),
    employee_role:clean(employee.role || "",160),
    state:clean(node.state || "PLANNED",40),
    truth_label:clean(node.truth_label || "SYNTHETIC",40),
  });
}

export function buildPublicExperienceViewModel(payload = {}, employeeById = {}) {
  const isLive = payload?.experience === "LIVE"
    && payload?.live === true
    && payload?.truth_label === "LIVE_RUNTIME";
  const unavailable = payload?.experience === "LIVE" && !isLive;
  const modeLabel = isLive ? "LIVE RUNTIME" : unavailable ? "LIVE UNAVAILABLE" : "SYNTHETIC DEMO";
  const plan = payload?.plan && typeof payload.plan === "object" ? payload.plan : null;
  const presentation = payload?.presentation && typeof payload.presentation === "object"
    ? payload.presentation
    : null;
  const sourceNodes = Array.isArray(presentation?.task_nodes)
    ? presentation.task_nodes
    : Array.isArray(plan?.task_nodes) ? plan.task_nodes : [];
  const nodes = new Map(sourceNodes.map((node) => [node.task_id, publicNode(node, employeeById)]));
  const graph = presentation?.graph || plan?.graph || {};
  const layerIds = Array.isArray(graph.topological_layers) ? graph.topological_layers : [];
  const layers = Object.freeze(layerIds.map((ids) => Object.freeze(
    (Array.isArray(ids) ? ids : []).map((id) => nodes.get(id)).filter(Boolean)
  )));

  return Object.freeze({
    mode_label:modeLabel,
    is_live:isLive,
    truth_label:isLive ? "LIVE_RUNTIME" : unavailable ? "NOT_LIVE" : "SYNTHETIC",
    state:clean(payload?.state || (unavailable ? "LIVE_UNAVAILABLE" : "READY"),80),
    message:clean(payload?.message || "",1000),
    objective:clean(payload?.objective || plan?.mission?.objective || "",1200),
    mission_id:clean(plan?.mission?.mission_id || "",160),
    can_fallback_demo:payload?.fallback?.experience === "DEMO",
    session:payload?.session || null,
    sandbox:payload?.sandbox || null,
    telemetry:isLive ? publicTelemetry(payload?.telemetry, employeeById) : null,
    layers,
    edges:Array.isArray(graph.edges) ? Object.freeze(graph.edges.map((edge) => Object.freeze({
      from:clean(edge?.from,160),
      to:clean(edge?.to,160),
    }))) : Object.freeze([]),
  });
}
function setText(node, value) {
  if (node) node.textContent = String(value ?? "");
}

function quotaText(session) {
  const demo = session?.quotas?.demo;
  const live = session?.quotas?.live;
  if (!demo || !live) return "Anonymous session · bounded quota";
  return `Demo ${demo.used}/${demo.max} · Live ${live.used}/${live.max} · 1 active mission max`;
}

function displayValue(value, empty = "UNKNOWN") {
  if (value == null || value === "") return empty;
  return String(value);
}

function telemetryCard(root, title, entries) {
  const card = root.createElement("article");
  card.className = "public-telemetry-card";
  const heading = root.createElement("h3");
  heading.textContent = title;
  const list = root.createElement("dl");
  for (const [label, value] of entries) {
    const term = root.createElement("dt");
    term.textContent = label;
    const detail = root.createElement("dd");
    detail.textContent = displayValue(value);
    list.append(term, detail);
  }
  card.append(heading, list);
  return card;
}

function renderTelemetry(root, view) {
  const target = byId(root, "public-execution-evidence");
  if (!target) return;
  target.replaceChildren();
  const telemetry = view.telemetry;
  if (!telemetry) {
    const empty = root.createElement("p");
    empty.className = "public-telemetry-empty";
    empty.textContent = view.truth_label === "SYNTHETIC"
      ? "NO EXECUTION TELEMETRY · Synthetic planning only; no runtime execution is claimed."
      : "NO EXECUTION TELEMETRY · Live execution was unavailable or not verified.";
    target.append(empty);
    return;
  }

  const grid = root.createElement("div");
  grid.className = "public-telemetry-grid";
  const toolText = telemetry.tools.status === "KNOWN"
    ? (telemetry.tools.tool_ids.length ? telemetry.tools.tool_ids.join(" · ") : "NONE")
    : "UNKNOWN";
  const costText = telemetry.usage.cost.status === "KNOWN"
    ? telemetry.usage.cost.amount_usd+" USD"
    : "UNKNOWN";
  const blockerText = telemetry.blockers.length
    ? telemetry.blockers.map((item) => item.source+":"+item.code+(item.detail ? " · "+item.detail : "")).join(" | ")
    : "NONE";

  grid.append(
    telemetryCard(root, "Execution", [
      ["Employee", telemetry.employee_role ? telemetry.employee_name+" · "+telemetry.employee_role : telemetry.employee_name],
      ["Attempt", telemetry.execution.attempt_id],
      ["Attempt state", telemetry.execution.state],
      ["Terminal", telemetry.execution.terminal ? "YES" : "NO"],
      ["State source", telemetry.execution.state_source],
    ]),
    telemetryCard(root, "Model / runtime / tools", [
      ["Model", telemetry.model.status === "KNOWN" ? telemetry.model.model_id : "UNKNOWN"],
      ["Model provider", telemetry.model.provider_id],
      ["Runtime", telemetry.runtime.provider],
      ["Runtime ref", telemetry.runtime.runtime_ref],
      ["Runtime version", displayValue(telemetry.runtime.provider_version)],
      ["Tools", toolText],
      ["Capability routes", telemetry.tools.capability_route_refs.length ? telemetry.tools.capability_route_refs.join(" · ") : "NONE"],
    ]),
    telemetryCard(root, "Timing / usage", [
      ["Started", displayValue(telemetry.timing.started_at)],
      ["Finished", displayValue(telemetry.timing.finished_at)],
      ["Attempt duration", telemetry.timing.duration_ms == null ? "UNKNOWN" : telemetry.timing.duration_ms+" ms"],
      ["Measured duration", telemetry.usage.duration_ms == null ? "UNKNOWN" : telemetry.usage.duration_ms+" ms"],
      ["Tool calls", displayValue(telemetry.usage.tool_calls)],
      ["Input tokens", displayValue(telemetry.usage.input_tokens)],
      ["Output tokens", displayValue(telemetry.usage.output_tokens)],
      ["Total tokens", displayValue(telemetry.usage.total_tokens)],
      ["Cost", costText],
    ]),
    telemetryCard(root, "Artifacts / evidence", [
      ["Artifacts", telemetry.artifact_refs.length ? telemetry.artifact_refs.join(" · ") : "NONE"],
      ["Evidence", telemetry.evidence_refs.length ? telemetry.evidence_refs.join(" · ") : "NONE"],
      ["Receipt", displayValue(telemetry.receipt_ref,"NONE")],
    ]),
    telemetryCard(root, "Unknowns / blockers", [
      ["Unknowns", telemetry.unknowns.length ? telemetry.unknowns.join(" · ") : "NONE"],
      ["Blockers", blockerText],
      ["Residual risks", telemetry.residual_risks.length ? telemetry.residual_risks.join(" · ") : "NONE"],
    ]),
    telemetryCard(root, "Traceability", [
      ["Terminal state ref", displayValue(telemetry.traceability.terminal_state_ref)],
      ["Sandbox admission", displayValue(telemetry.traceability.sandbox_admission_ref,"NONE")],
      ["Sandbox record", displayValue(telemetry.traceability.sandbox_record_ref,"NONE")],
      ["Previous attempt", displayValue(telemetry.traceability.previous_attempt_id,"NONE")],
      ["Recovery checkpoint", displayValue(telemetry.traceability.recovery_checkpoint_ref,"NONE")],
    ]),
  );
  target.append(grid);
}

function renderGraph(root, view) {
  const target = byId(root, "public-task-graph");
  if (!target) return;
  target.replaceChildren();
  if (!view.layers.length) {
    const empty = root.createElement("p");
    empty.className = "public-graph-empty";
    empty.textContent = view.message || "No mission graph to display.";
    target.append(empty);
    return;
  }
  view.layers.forEach((layer, index) => {
    const layerNode = root.createElement("section");
    layerNode.className = "public-task-layer";
    const label = root.createElement("p");
    label.className = "eyebrow";
    label.textContent = `Layer ${index + 1}`;
    layerNode.append(label);
    const grid = root.createElement("div");
    grid.className = "public-task-layer-grid";
    layer.forEach((node) => {
      const card = root.createElement("article");
      card.className = "public-task-node";
      card.dataset.truth = node.truth_label;
      const truth = root.createElement("span");
      truth.className = "public-truth-chip";
      truth.textContent = node.truth_label.replaceAll("_", " ");
      const title = root.createElement("strong");
      title.textContent = node.title;
      const owner = root.createElement("small");
      owner.textContent = node.employee_role
        ? `${node.employee_name} · ${node.employee_role}`
        : node.employee_name;
      card.append(truth, title, owner);
      grid.append(card);
    });
    layerNode.append(grid);
    target.append(layerNode);
  });
}

function renderResult(root, payload, employeeById) {
  const view = buildPublicExperienceViewModel(payload, employeeById);
  const shell = byId(root, "public-experience-result");
  if (shell) {
    shell.hidden = false;
    shell.dataset.mode = view.is_live ? "live" : view.truth_label === "SYNTHETIC" ? "demo" : "unavailable";
  }
  setText(byId(root, "public-mode-label"), view.mode_label);
  setText(byId(root, "public-result-message"),
    view.message || (view.is_live
      ? "Verified bounded runtime evidence received."
      : view.truth_label === "SYNTHETIC"
        ? "Deterministic synthetic mission plan. No model execution is claimed."
        : "Live execution is unavailable or unverifiable. No live success is claimed."));
  setText(byId(root, "public-quota-status"), quotaText(view.session));
  const fallback = byId(root, "public-demo-fallback");
  if (fallback) fallback.hidden = !view.can_fallback_demo;
  renderTelemetry(root, view);
  renderGraph(root, view);
  return view;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials:"same-origin",
    cache:"no-store",
    ...options,
    headers:{ "Content-Type":"application/json", ...(options.headers || {}) },
  });
  let body;
  try { body = await response.json(); }
  catch { body = { ok:false, message:`HTTP ${response.status}` }; }
  return { response, body };
}

export function attachPublicDemo({
  root = document,
  employeeById = {},
  toast = () => {},
} = {}) {
  const objective = byId(root, "public-mission-objective");
  const demoButton = byId(root, "try-demo");
  const liveButton = byId(root, "try-live");
  const fallbackButton = byId(root, "public-demo-fallback");
  if (!objective || !demoButton || !liveButton) return Object.freeze({ attached:false });

  let sessionReady = false;
  let busy = false;

  async function ensureSession() {
    if (sessionReady) return true;
    const { response, body } = await jsonRequest("/api/public/session", {
      method:"POST",
      body:"{}",
    });
    if (!response.ok || body?.ok !== true) throw new Error(body?.message || "Anonymous session unavailable.");
    sessionReady = true;
    setText(byId(root, "public-session-status"),
      `Anonymous · expires ${new Date(body.session.expires_at).toLocaleTimeString()}`);
    setText(byId(root, "public-quota-status"), quotaText(body.session));
    if (body.live_available !== true) {
      setText(byId(root, "public-live-capacity"), "LIVE CAPACITY: UNAVAILABLE");
    } else {
      setText(byId(root, "public-live-capacity"), "LIVE CAPACITY: AVAILABLE");
    }
    return true;
  }

  function setBusy(value) {
    busy = value;
    demoButton.disabled = value;
    liveButton.disabled = value;
    if (fallbackButton) fallbackButton.disabled = value;
  }

  async function run(kind) {
    if (busy) return;
    const missionObjective = String(objective.value || "").trim();
    if (!missionObjective) {
      toast("Mission objective is required.", true);
      objective.focus();
      return;
    }
    setBusy(true);
    try {
      await ensureSession();
      setText(byId(root, "public-mode-label"), kind === "demo" ? "RUNNING DEMO" : "REQUESTING LIVE");
      const { response, body } = await jsonRequest(
        kind === "demo" ? "/api/public/demo" : "/api/public/live",
        { method:"POST", body:JSON.stringify({ objective:missionObjective }) },
      );
      renderResult(root, body, employeeById);
      if (!response.ok && body?.state !== "LIVE_UNAVAILABLE" && body?.state !== "LIVE_VERIFICATION_FAILED") {
        toast(body?.message || `Request failed: HTTP ${response.status}`, true);
      } else if (kind === "demo") {
        toast("Synthetic demo complete.");
      } else if (body?.live === true) {
        toast("Verified live runtime mission complete.");
      } else {
        toast("Live unavailable; deterministic demo remains available.", true);
      }
    } catch (error) {
      sessionReady = false;
      renderResult(root, {
        experience:kind === "live" ? "LIVE" : "DEMO",
        truth_label:kind === "live" ? "NOT_LIVE" : "SYNTHETIC",
        live:false,
        state:kind === "live" ? "LIVE_UNAVAILABLE" : "DEMO_UNAVAILABLE",
        message:error?.message || "Public experience unavailable.",
        fallback:kind === "live" ? { experience:"DEMO", endpoint:"/api/public/demo" } : null,
      }, employeeById);
      toast(error?.message || "Public experience unavailable.", true);
    } finally {
      setBusy(false);
    }
  }

  demoButton.addEventListener("click", () => run("demo"));
  liveButton.addEventListener("click", () => run("live"));
  fallbackButton?.addEventListener("click", () => run("demo"));

  return Object.freeze({
    attached:true,
    runDemo:() => run("demo"),
    runLive:() => run("live"),
  });
}

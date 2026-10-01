const byId = (root, id) => root.getElementById(id);
const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

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

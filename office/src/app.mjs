import { EMPLOYEES, STATUSES, createTask, demoRegistry, importRegistry, updateTask, validateRegistry } from "./registry.mjs";
import { reconcileClaims } from "./reconcile.mjs";
import { createOfficeScene } from "./scene.mjs";
import { EMPLOYEE_PLAYBOOK, PERSONA_SNAPSHOT } from "./persona-ops.mjs";
import { attachWorkerBubbles } from "./worker-bubbles.mjs";

const STORAGE_KEY = "nyobakantorai-registry-v1";
const SETTINGS_KEY = "nyobakantorai-settings-v1";
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const employee = (id) => EMPLOYEES.find((item) => item.id === id);

const profiles = {
  praroro: { personality: "COO hangat, tenang, taktis; memecah pekerjaan, memberi owner dan meminta bukti handoff yang benar-benar terkirim.", skills: ["Coordination", "Handoff", "Evidence"], visual: "Olive suit · tan tie · notebook" },
  paijo: { personality: "Analis growth yang lugas soal angka, rumus, periode dan asumsi; tidak mengarang akses Ads atau transaksi.", skills: ["KPI analysis", "Finance", "Source checks"], visual: "Glasses · olive jacket · tablet" },
  subagjo: { personality: "Engineer sistematis yang cek source dan runtime asli, memilih patch kecil, tes nyata, serta rollback; audit GitHub tanpa auto push.", skills: ["Codebase QA", "GitHub review", "Rollback"], visual: "Blue hoodie · backpack · tools" },
  alex: { personality: "Strategis cepat dan kreatif; merumuskan hipotesis yang bisa diuji, eksperimen kecil, serta keputusan berbasis sumber.", skills: ["Experiments", "Research", "Rapid scope"], visual: "Navy hoodie · headphones · coffee" },
  sumiati: { personality: "Kreatif dan cair dengan the owner, profesional untuk klien; copy dan visual brief dulu, tidak mengaku sudah generate atau publish.", skills: ["Creative briefs", "Brand copy", "Pashmina"], visual: "Sand pashmina · brown cardigan · guitar" },
  siti: { personality: "Reviewer independen yang tegas tetapi membantu; memeriksa artefak asli dan tes nyata sebelum menyatakan PASS atau VERIFIED.", skills: ["Independent QA", "Provenance", "Compliance"], visual: "Beige pashmina · green cardigan · clipboard" },
};
const knowledge = [
  ["Architecture", "Local-first boundaries, runtime adapter rules, and evidence-gated task state.", "docs/ARCHITECTURE.md"],
  ["Agent profiles", "Six public example personas with role, reasoning style, and safety contract.", "../agents/"],
  ["Reusable skills", "Portable safety, QA, research, growth, creative, and engineering skills.", "../skills/hermes-custom/"],
  ["Security policy", "Credential handling, least privilege, public-release rules, and disclosure guidance.", "../SECURITY.md"],
  ["Runtime adapter contract", "How external runtimes expose health, capabilities, tasks, and evidence safely.", "../docs/RUNTIME-ADAPTER-SPEC.md"],
];

let registry = loadRegistry();
let runtime = null;
let selected = "praroro";
let settings = loadSettings();
let scene;
let workerBubbles=null;

function loadRegistry() {
  try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)); validateRegistry(parsed); return parsed; }
  catch { return demoRegistry(); }
}
function loadSettings() {
  try { return { motion: true, debug: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; }
  catch { return { motion: true, debug: false }; }
}
function persist(render = true) {
  validateRegistry(registry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  if (render) renderAll();
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Unknown" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function toast(message, error = false) { const node=$("#toast");node.textContent=message;node.classList.toggle("error",error);node.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>node.classList.remove("show"),3400); }
function download(name, content) { const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([content],{type:"application/json"}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000); }

function showView(name) {
  $$(".view").forEach((view)=>{const active=view.id===`view-${name}`;view.hidden=!active;view.classList.toggle("is-active",active);});
  $$(".nav-button").forEach((button)=>button.classList.toggle("is-active",button.dataset.view===name));
  location.hash=name;
}

function presenceFor(id) {
  if (runtime?.employees?.[id]) return runtime.employees[id].presence;
  return ["praroro","subagjo","siti"].includes(id) ? "UNKNOWN" : "NOT CONNECTED";
}
function renderSelected() {
  const person=employee(selected),profile=profiles[selected],presence=presenceFor(selected);
  $("#selected-profile").innerHTML=`<img class="selected-portrait" src="./assets/generated/characters/${selected}/front.svg" alt="Sprite ${escapeHtml(person.name)} tampak depan"><h2 class="selected-name">${escapeHtml(person.name)}</h2><div class="selected-role">${escapeHtml(person.role)}</div><p class="selected-copy">${escapeHtml(profile.personality)}</p><div class="profile-states">${profile.skills.map((skill)=>`<span>${escapeHtml(skill)}</span>`).join("")}</div><p class="selected-copy"><strong>Gaya bicara:</strong> ${escapeHtml(EMPLOYEE_PLAYBOOK[selected].voice)}</p><span class="runtime-pill">${escapeHtml(presence)}</span>`;
  $("#scene-status").textContent=`Scene: VISUAL DEMO · selected ${person.name}`;
  $$("#scene-roster button").forEach((button)=>button.classList.toggle("is-active",button.dataset.employee===selected));
}
function renderRoster() {
  $("#scene-roster").innerHTML=EMPLOYEES.map(({id,name})=>`<button type="button" data-employee="${id}">${escapeHtml(name)}</button>`).join("");
  $$("#scene-roster button").forEach((button)=>button.addEventListener("click",()=>scene.select(button.dataset.employee)));
  renderSelected();
}
function selectEmployee(id) { selected=id;renderSelected();workerBubbles?.select(id); }

function renderPeople() {
  $("#people-grid").innerHTML=EMPLOYEES.map((person)=>{const profile=profiles[person.id],presence=presenceFor(person.id);return `<article class="person-card"><div class="person-art"><img src="./assets/generated/characters/${person.id}/front.svg" alt="${escapeHtml(person.name)} sesuai character sheet"></div><div class="person-copy"><p class="eyebrow">${escapeHtml(profile.visual)}</p><h2>${escapeHtml(person.name)}</h2><strong>${escapeHtml(person.role)}</strong><p>${escapeHtml(profile.personality)}</p><p class="employee-operating">Gaya bicara: ${escapeHtml(EMPLOYEE_PLAYBOOK[person.id].voice)}</p><p class="employee-operating">Skill profile: ${EMPLOYEE_PLAYBOOK[person.id].skillNames.length} skill lokal aktif, runtime capability is verified separately.</p><div class="profile-states"><span>${escapeHtml(presence)}</span><span>SKILL ≠ LIVE TOOL</span></div></div><button type="button" data-person="${person.id}">Inspect sprites</button></article>`}).join("");
  $$('[data-person]').forEach((button)=>button.addEventListener("click",()=>openPerson(button.dataset.person)));
}
function openPerson(id) {
  const person=employee(id),profile=profiles[id];
  $("#person-detail").innerHTML=`<p class="eyebrow">CANONICAL CHARACTER</p><h2 id="person-title">${escapeHtml(person.name)}</h2><p><strong>${escapeHtml(person.role)}</strong> · ${escapeHtml(profile.visual)}</p><p>${escapeHtml(profile.personality)}</p><section class="operating-playbook"><p class="eyebrow">PUBLIC SOUL / SKILLS · ${escapeHtml(PERSONA_SNAPSHOT)}</p><h3>Cara bicara</h3><p>${escapeHtml(EMPLOYEE_PLAYBOOK[id].voice)}</p><h3>Cara berpikir</h3><p>${escapeHtml(EMPLOYEE_PLAYBOOK[id].thinking)}</p><h3>Cara kerja</h3><p>${escapeHtml(EMPLOYEE_PLAYBOOK[id].workflow)}</p><h3>6 reusable skills</h3><p>${escapeHtml(EMPLOYEE_PLAYBOOK[id].skillNames.join(" · "))}</p><p class="readonly-warning">${escapeHtml(EMPLOYEE_PLAYBOOK[id].toolState)} · Skills are instructions, not proof that a model or external tool is running.</p></section><div class="person-sheet">${["front","side","back","idle","walk","role"].map((state)=>`<figure><img src="./assets/generated/characters/${id}/${state}.svg" alt="${escapeHtml(person.name)} ${state}"><figcaption>${state.toUpperCase()}</figcaption></figure>`).join("")}</div><p class="readonly-warning">Sprite diturunkan lokal dari PNG acuan. Ini aset visual, bukan bukti runtime agent.</p>`;
  $("#person-dialog").showModal();
}

const columns=[
  ["PLANNED",["PLANNED"]],["ACTIVE",["IN_PROGRESS"]],["BLOCKED",["BLOCKED"]],["DONE / VERIFIED",["COMPLETED","VERIFIED"]],
];
function matchesTask(task) {
  const query=$("#task-search").value.trim().toLowerCase(),owner=$("#task-owner").value,provenance=$("#task-provenance").value;
  return (!query||`${task.title} ${task.detail}`.toLowerCase().includes(query))&&(!owner||task.assignee_id===owner)&&(!provenance||task.provenance===provenance);
}
function taskCard(task) {
  const person=employee(task.assignee_id);
  return `<button type="button" class="task-card" data-task="${escapeHtml(task.id)}" data-owner="${escapeHtml(person.id)}"><span class="task-meta"><span>${escapeHtml(task.priority)}</span><span>${escapeHtml(task.lifecycle_status)}</span></span><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.detail||"No detail")}</p><span class="task-meta"><span>${escapeHtml(person.name)}</span><span class="provenance ${escapeHtml(task.provenance)}">${escapeHtml(task.provenance)}</span></span></button>`;
}
function renderMissions() {
  const visible=registry.tasks.filter((task)=>!task.quarantined&&matchesTask(task));
  $("#mission-board").innerHTML=columns.map(([label,statuses])=>{const tasks=visible.filter((task)=>statuses.includes(task.lifecycle_status));return `<section class="mission-column"><div class="column-title"><span>${label}</span><span>${tasks.length}</span></div><div class="task-stack">${tasks.length?tasks.map(taskCard).join(""):'<div class="empty">No tasks</div>'}</div></section>`}).join("");
  const quarantined=registry.tasks.filter((task)=>task.quarantined);
  const notice=$("#quarantine-notice");notice.hidden=!quarantined.length;notice.innerHTML=quarantined.length?`<strong>${quarantined.length} claim(s) quarantined.</strong> ${quarantined.map((task)=>`<button type="button" data-task="${escapeHtml(task.id)}">${escapeHtml(task.runtime_ref||task.id)} · ${escapeHtml(task.reconcile_reason||"UNCONFIRMED")}</button>`).join(" ")}`:"";
  $$('[data-task]').forEach((button)=>button.addEventListener("click",()=>openTask(button.dataset.task)));
}
function openTask(id) {
  const task=registry.tasks.find((item)=>item.id===id);if(!task)return;
  const person=employee(task.assignee_id),readOnly=task.execution_mode==="HERMES";
  $("#task-detail").innerHTML=`<p class="eyebrow">${escapeHtml(task.provenance)} · ${escapeHtml(task.id)}</p><h2 id="task-detail-title">${escapeHtml(task.title)}</h2><div class="task-summary"><strong>${escapeHtml(person.name)} · ${escapeHtml(task.lifecycle_status)}</strong><br>${escapeHtml(task.detail||"No detail")}<br><small>Updated ${escapeHtml(formatDate(task.updated_at))}</small>${task.runtime_ref?`<br><code>${escapeHtml(task.runtime_ref)} / ${escapeHtml(task.runtime_state)}</code>`:""}</div>${readOnly?`<p class="readonly-warning">Read-only Hermes claim. UI tidak boleh mengedit status ini. Provenance hanya AUTHORITATIVE_RUNTIME bila cocok dengan snapshot server.</p>`:`<form id="task-update-form" class="form-grid"><label>Status<select name="lifecycle_status">${STATUSES.map((status)=>`<option ${status===task.lifecycle_status?"selected":""}>${status}</option>`).join("")}</select></label><label>Actor<select name="actor"><option value="rafdi">the owner</option>${EMPLOYEES.map(({id,name})=>`<option value="${id}">${escapeHtml(name)}</option>`).join("")}</select></label><label class="wide">Evidence reference<input name="evidence_ref" maxlength="1000" placeholder="Required for VERIFIED"></label><label class="wide">Comment<textarea name="comment" maxlength="1000" rows="3"></textarea></label><label class="wide">Attachment metadata only<input name="attachment" type="file"><small>File content is not uploaded or stored.</small></label><div class="wide form-actions"><button type="button" data-close="task-detail-dialog">Close</button><button class="primary" type="submit">Record local update</button></div></form>`}<h3>Evidence & comments</h3><ul>${task.evidence_refs.map((item)=>`<li>${escapeHtml(item)}</li>`).join("")||"<li>None</li>"}</ul><ul>${task.comments.map((item)=>`<li><strong>${escapeHtml(item.actor)}</strong>: ${escapeHtml(item.text)}</li>`).join("")||"<li>No comments</li>"}</ul>`;
  $("#task-update-form")?.addEventListener("submit",(event)=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const file=event.currentTarget.elements.attachment.files[0];if(file){data.attachment_name=file.name;data.attachment_type=file.type;data.attachment_size=file.size;}try{registry=updateTask(registry,id,data);persist();$("#task-detail-dialog").close();toast("Local event recorded.");}catch(error){toast(error.message,true);}});
  $("#task-detail-dialog").showModal();
}

function renderActivity() {
  $("#activity-list").innerHTML=[...registry.events].reverse().map((event)=>`<article class="activity-row"><time>${escapeHtml(formatDate(event.at))}</time><strong>${escapeHtml(event.actor)}</strong><div><strong>${escapeHtml(event.action.replaceAll("_"," "))}</strong><small>${escapeHtml(registry.tasks.find((task)=>task.id===event.task_id)?.title||event.task_id)}</small></div><span class="badge">${escapeHtml(event.provenance||event.source||"LOCAL")}</span></article>`).join("")||'<div class="empty">No events</div>';
}
function renderSystems() {
  const connected=runtime?.hermes?.board_connected===true;
  const cards=[
    ["Local office server","Static UI and read-only runtime adapter.",[["LOCALHOST","pass"],["WRITE ENDPOINTS: 0","pass"],["DISPATCH: BLOCKED","blocked"]]],
    ["Hermes Kanban",connected?`${runtime.hermes.version} · ${runtime.hermes.task_count} sanitized task(s).`:"No verified board snapshot.",[[connected?"READ CONNECTED":"UNKNOWN",connected?"pass":"blocked"],["RUNTIME WRITES: 0","pass"],["READ-ONLY ADAPTER","pass"]]],
    ["Employee runtime","All six named profiles are read from Hermes; model label or animation does NOT prove execution.",EMPLOYEES.map(({id})=>[`${id.toUpperCase()}: ${presenceFor(id)}`,""])],
    ["Providers / models","The office server does not read provider keys, change providers, or run model inference.",[["SERVER INFERENCE: 0","pass"],["PROVIDER KEYS: NOT READ","pass"],["CONFIG CHANGES: 0","pass"]]],
    ["MCP / external APIs","External APIs are outside the default local office boundary.",[["DEFAULT MCP CALLS: 0","pass"],["EXTERNAL WRITES: 0","pass"],["MESSAGING: BLOCKED","blocked"]]],
    ["ChatGPT chat biasa","A separate chat can be used manually, but this office cannot invoke private conversations or inherit personal plugins.",[["DESIRED PRIMARY SURFACE",""],["MANUAL HANDOFF ONLY","pass"],["AUTO BRIDGE: NOT VERIFIED","blocked"]]],
  ];
  $("#systems-grid").innerHTML=cards.map(([title,note,states])=>`<article class="system-card"><p class="eyebrow">SYSTEM BOUNDARY</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(note)}</p><div class="system-states">${states.map(([text,state])=>`<span class="${state}">${escapeHtml(text)}</span>`).join("")}</div></article>`).join("");
  $("#runtime-evidence").textContent=runtime?JSON.stringify(runtime,null,2):"No runtime snapshot yet.";
}
function renderKnowledge() { $("#knowledge-grid").innerHTML=knowledge.map(([title,note,path])=>`<article class="knowledge-card"><p class="eyebrow">READ ON DEMAND</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(note)}</p><code>${escapeHtml(path)}</code></article>`).join(""); }
function renderAll(){renderSelected();renderPeople();renderMissions();renderActivity();renderSystems();renderKnowledge();}

async function refreshRuntime({ quiet=false }={}) {
  try {
    const response=await fetch("/api/runtime",{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);runtime=await response.json();
    if(Array.isArray(runtime.tasks)){
      const claims=registry.tasks.filter((task)=>task.execution_mode==="HERMES");
      const reconciled=reconcileClaims(claims,runtime.tasks,runtime.checked_at);let changed=false;
      registry.tasks=registry.tasks.map((task)=>{const next=reconciled.find((item)=>item.id===task.id);if(!next)return task;if(next.provenance!==task.provenance||next.quarantined!==task.quarantined||next.reconcile_reason!==task.reconcile_reason){changed=true;registry.events.push({id:`event_${crypto.randomUUID()}`,task_id:task.id,action:next.quarantined?"RUNTIME_CLAIM_QUARANTINED":"RUNTIME_RECONCILED",actor:"adapter:hermes-readonly",at:runtime.checked_at,source:"SERVER_SNAPSHOT",provenance:next.provenance,evidence_ref:next.quarantined?next.reconcile_reason:`${next.runtime_evidence.board}:${next.runtime_evidence.id}`});}return next;});
      if(changed)persist(false);
    }
    if(!quiet)toast("Read-only Hermes snapshot refreshed.");
  } catch(error) { runtime=null;if(!quiet)toast(`Runtime unavailable: ${error.message}`,true); }
  renderAll();
}

$("#task-create-form").addEventListener("submit",(event)=>{event.preventDefault();try{registry=createTask(registry,Object.fromEntries(new FormData(event.currentTarget)));persist();event.currentTarget.reset();$("#task-create-dialog").close();toast("Local DEMO mission created.");}catch(error){toast(error.message,true);}});
$("#new-task").addEventListener("click",()=>$("#task-create-dialog").showModal());
$("#task-owner").innerHTML+=[...EMPLOYEES].map(({id,name})=>`<option value="${id}">${escapeHtml(name)}</option>`).join("");
$("#task-create-form select[name='assignee_id']").innerHTML=EMPLOYEES.map(({id,name})=>`<option value="${id}">${escapeHtml(name)}</option>`).join("");
for(const selector of ["#task-search","#task-owner","#task-provenance"]){$(selector).addEventListener(selector==="#task-search"?"input":"change",renderMissions);}
$("#export-registry").addEventListener("click",()=>{const stamp=new Date().toISOString().replaceAll(":","-");download(`nyobakantorai-registry-${stamp}.json`,JSON.stringify(registry,null,2));localStorage.setItem(`${STORAGE_KEY}-backup`,JSON.stringify(registry));toast("Registry exported; local backup refreshed.");});
$("#import-registry").addEventListener("click",()=>$("#registry-file").click());
$("#registry-file").addEventListener("change",async(event)=>{const file=event.target.files[0];if(!file)return;try{const imported=importRegistry(await file.text());if(!confirm(`Import ${imported.tasks.length} task(s)? Existing registry will be backed up locally.`))return;localStorage.setItem(`${STORAGE_KEY}-backup-${Date.now()}`,JSON.stringify(registry));registry=imported;persist();await refreshRuntime({quiet:true});toast("Import complete; Hermes claims reconciled or quarantined.");}catch(error){toast(`Import rejected: ${error.message}`,true);}finally{event.target.value="";}});
$("#refresh-runtime").addEventListener("click",()=>refreshRuntime());
$$(".nav-button").forEach((button)=>button.addEventListener("click",()=>showView(button.dataset.view)));
$$("[data-close]").forEach((button)=>button.addEventListener("click",()=>document.getElementById(button.dataset.close).close()));

scene=createOfficeScene($("#office-canvas"),{onSelect:selectEmployee,initialMotion:settings.motion&&!matchMedia("(prefers-reduced-motion: reduce)").matches});
let workerAvailable=false, requestedWorker="praroro";
function syncWorkerPanel(live) {
 const frame=$("#worker-frame"), offline=$("#worker-offline-panel");
 offline.hidden=live; frame.hidden=!live;
 if(!live&&workerAvailable)frame.src="about:blank";
 if(live&&!workerAvailable)frame.src="http://127.0.0.1:4333/?embedded=1&employee="+encodeURIComponent(requestedWorker);
 workerAvailable=live;
}
workerBubbles=attachWorkerBubbles({layer:$("#speech-layer"),onSelect:(id)=>scene.select(id),
 onOpen:(id)=>{requestedWorker=id;showView("workers");if(workerAvailable)$("#worker-frame").src="http://127.0.0.1:4333/?embedded=1&employee="+encodeURIComponent(id);},
 onConnection:(live)=>{$("#worker-connection").textContent=live?"WORKER: CONNECTED":"WORKER: OFFLINE";syncWorkerPanel(live);}});
renderRoster();
$("#zoom-out").addEventListener("click",()=>scene.zoom(-.05));$("#zoom-in").addEventListener("click",()=>scene.zoom(.05));$("#reset-view").addEventListener("click",()=>scene.reset());
function applyMotion(){scene.motion(settings.motion);$("#motion-toggle").textContent=settings.motion?"Motion on":"Motion off";$("#motion-toggle").setAttribute("aria-pressed",String(settings.motion));$("#reduced-motion").checked=!settings.motion;}
$("#motion-toggle").addEventListener("click",()=>{settings.motion=!settings.motion;saveSettings();applyMotion();});
$("#reduced-motion").addEventListener("change",(event)=>{settings.motion=!event.currentTarget.checked;saveSettings();applyMotion();});
$("#debug-grid").checked=settings.debug;$("#debug-grid").addEventListener("change",(event)=>{settings.debug=event.currentTarget.checked;saveSettings();scene.debug(settings.debug);});scene.debug(settings.debug);applyMotion();

const allowedViews=new Set(["office","workers","people","missions","activity","systems","architecture","knowledge","settings"]);showView(allowedViews.has(location.hash.slice(1))?location.hash.slice(1):"office");
setInterval(()=>{$("#clock").textContent=new Intl.DateTimeFormat("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date());},1000);
renderAll();refreshRuntime({quiet:true});

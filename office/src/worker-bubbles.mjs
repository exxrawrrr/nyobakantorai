import { WORKFORCE } from "../workforce.mjs";

export const EMPLOYEE_DESKS = Object.freeze(Object.fromEntries(WORKFORCE.map((employee)=>[employee.id,employee.visual.scene_position])));
export const WORKER_NAMES = Object.freeze(Object.fromEntries(WORKFORCE.map((employee)=>[employee.id,employee.name])));
const EMPLOYEE_BY_ID = Object.freeze(Object.fromEntries(WORKFORCE.map((employee)=>[employee.id,employee])));
const STATES = new Set(["QUEUED","RUNNING","RESULT_READY","FAILED","INTERRUPTED"]);

export function shortWords(value, count=5) {
  return String(value??"").replace(/PUBLIC SANDBOX TEST:\s*/ig,"").replace(/[#*_\x60<>|]/g," ").replace(/\s+/g," ").trim().split(" ").filter(Boolean).slice(0,count).join(" ");
}
export function selectWorkerTask(tasks, id) {
  if(!Array.isArray(tasks))return null;
  const eligible=tasks.filter((task)=>task?.employee===id&&STATES.has(task.state));
  return [...eligible].reverse().find((task)=>["RUNNING","QUEUED"].includes(task.state)) ?? eligible.at(-1) ?? null;
}
export function makeWorkerCaption(task, employee, connected=true) {
  if(!connected)return "Worker belum nyala, cek panelnya";
  if(!task)return "Lagi kosong, siap bantu Bos";
  if(task.state==="QUEUED")return "Lagi nunggu giliran ngerjain tugas";
  if(task.state==="RUNNING")return "Lagi ngerjain tugas sesuai role";
  if(task.state==="RESULT_READY"){
    const finished=typeof task.completed_at==="string"?Date.parse(task.completed_at.replace(/([+-]\d{2})(\d{2})$/,"$1:$2")):NaN;
    if(Number.isFinite(finished)&&Date.now()-finished>20*60*1000)return "Hasil terakhir siap lu cek";
    return "Beres, hasilnya siap lu cek";
  }
  if(task.state==="FAILED")return "Ada kendala, cek detail tugasnya";
  if(task.state==="INTERRUPTED")return "Tugas terhenti, perlu diperiksa dulu";
  return "Lagi kosong, siap bantu Bos";
}
export function attachWorkerBubbles({layer,onSelect,onOpen,onConnection}) {
  let selected="praroro", connected=false, tasks=[];
  const buttons=new Map();
  for(const employee of WORKFORCE){
    const button=document.createElement("button");
    button.type="button";button.className="speech-bubble";button.dataset.employee=employee.id;button.dataset.slot=String(employee.visual.desk_slot);
    const name=document.createElement("strong");name.textContent=employee.name;
    const caption=document.createElement("span");caption.className="speech-caption";
    button.append(name,caption);button.addEventListener("click",()=>{onSelect(employee.id);onOpen(employee.id);});
    layer.append(button);buttons.set(employee.id,button);
  }
  function render(){
    for(const [id,button] of buttons){
      const task=selectWorkerTask(tasks,id),caption=makeWorkerCaption(task,id,connected);
      button.querySelector(".speech-caption").textContent=caption;button.classList.toggle("is-selected",id===selected);
      button.dataset.state=connected?(task?.state??"IDLE"):"DISCONNECTED";
      button.title=WORKER_NAMES[id]+": "+caption+". Klik untuk membuka tugas.";button.setAttribute("aria-label",button.title);
      button.dataset.assetStatus=EMPLOYEE_BY_ID[id].visual.asset_status;
    }
    onConnection(connected);
  }
  async function refresh(){
    try{const response=await fetch("/api/worker/tasks",{cache:"no-store"});if(!response.ok)throw Error("Worker snapshot unavailable");const snapshot=await response.json();connected=snapshot.connected===true;tasks=connected&&Array.isArray(snapshot.tasks)?snapshot.tasks:[];}
    catch{connected=false;tasks=[];}render();
  }
  render();refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);
  return {select(id){if(buttons.has(id)){selected=id;render();}},refresh,dispose(){clearInterval(timer);}};
}

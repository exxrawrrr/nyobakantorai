/* Pixel Office: compact worker captions. Pilot receipts are not official Kanban status. */
export const EMPLOYEE_DESKS = Object.freeze({
  praroro: [330, 430], paijo: [540, 420], subagjo: [750, 430],
  alex: [390, 610], sumiati: [610, 595], siti: [830, 610],
});
export const WORKER_NAMES = Object.freeze({
  praroro:"Praroro",paijo:"Paijo",subagjo:"Subagjo",alex:"Alex",
  sumiati:"Sumiati",siti:"Siti",
});
const STATES = new Set(["QUEUED","RUNNING","RESULT_READY","FAILED","INTERRUPTED"]);
export function shortWords(value, count=5) {
  return String(value??"").replace(/PUBLIC SANDBOX TEST:\s*/ig,"")
    .replace(/[#*_\x60<>|]/g," ").replace(/\s+/g," ").trim().split(" ")
    .filter(Boolean).slice(0,count).join(" ");
}
export function selectWorkerTask(tasks, id) {
  if(!Array.isArray(tasks))return null;
  const eligible=tasks.filter(t=>t?.employee===id&&STATES.has(t.state));
  return [...eligible].reverse().find(t=>["RUNNING","QUEUED"].includes(t.state))
    ?? eligible.at(-1) ?? null;
}
export function makeWorkerCaption(task, employee, connected=true) {
  if(!connected)return "Worker belum nyala, cek panelnya";
  if(!task)return "Lagi kosong, siap bantu Bos";
  if(task.state==="QUEUED")return "Lagi nunggu giliran ngerjain tugas";
  if(task.state==="RUNNING")return ({
    praroro:"Lagi mengatur pembagian kerja tim",paijo:"Lagi menghitung angka dari brief",
    subagjo:"Lagi menyusun solusi teknis baru",alex:"Lagi merancang ide strategi baru",
    sumiati:"Lagi bikin draft konten baru",siti:"Lagi memeriksa hasil kerja tim",
  })[employee]||"Lagi ngerjain tugas dari Bos";
  if(task.state==="RESULT_READY"){
    const finished=typeof task.completed_at==="string"?Date.parse(task.completed_at.replace(/([+-]\d{2})(\d{2})$/,"$1:$2")):NaN;
    if(Number.isFinite(finished)&&Date.now()-finished>20*60*1000)return ({
      praroro:"Arahan tim terakhir siap dicek",paijo:"Analisis terakhir siap lu cek",
      subagjo:"Draft teknis terakhir siap dicek",alex:"Ide strategi terakhir siap dicek",
      sumiati:"Draft konten terakhir siap dicek",siti:"Catatan review terakhir siap dicek",
    })[employee]||"Hasil terakhir siap lu cek";
    return ({
    praroro:"Beres, arahan tim siap dicek",paijo:"Beres, hasil analisis siap dicek",
    subagjo:"Beres, draft teknis siap dicek",alex:"Beres, ide strategi siap dicek",
    sumiati:"Beres, draft konten siap dicek",siti:"Beres, catatan review siap dicek",
  })[employee]||"Beres, hasilnya siap lu cek";
  }
  if(task.state==="FAILED")return "Ada kendala, cek detail tugasnya";
  if(task.state==="INTERRUPTED")return "Tugas terhenti, perlu diperiksa dulu";
  return "Lagi kosong, siap bantu Bos";
}
export function attachWorkerBubbles({layer,onSelect,onOpen,onConnection}) {
  let selected="praroro", connected=false, tasks=[];
  const buttons=new Map();
  for(const [id,[x,y]] of Object.entries(EMPLOYEE_DESKS)){
    const button=document.createElement("button");
    button.type="button";button.className="speech-bubble";button.dataset.employee=id;
    // Layout coordinates are mapped by static CSS: strict CSP rejects inline styles.
    const name=document.createElement("strong");name.textContent=WORKER_NAMES[id];
    const caption=document.createElement("span");caption.className="speech-caption";
    button.append(name,caption);
    button.addEventListener("click",()=>{onSelect(id);onOpen(id);});
    layer.append(button);buttons.set(id,button);
  }
  function render(){
    for(const [id,button] of buttons){
      const task=selectWorkerTask(tasks,id);
      const caption=makeWorkerCaption(task,id,connected);
      button.querySelector(".speech-caption").textContent=caption;
      button.classList.toggle("is-selected",id===selected);
      button.dataset.state=connected?(task?.state??"IDLE"):"DISCONNECTED";
      button.title=WORKER_NAMES[id]+": "+caption+". Klik untuk membuka tugas.";
      button.setAttribute("aria-label",button.title);
    }
    onConnection(connected);
  }
  async function refresh(){
    try{
      const response=await fetch("/api/worker/tasks",{cache:"no-store"});
      if(!response.ok)throw Error("Worker snapshot unavailable");
      const snapshot=await response.json();
      connected=snapshot.connected===true;tasks=connected&&Array.isArray(snapshot.tasks)?snapshot.tasks:[];
    }catch{connected=false;tasks=[];}
    render();
  }
  render();refresh();
  const timer=setInterval(()=>{if(!document.hidden)refresh();},5000);
  return {select(id){if(buttons.has(id)){selected=id;render();}},refresh,
    dispose(){clearInterval(timer);}};
}

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildDatasetSnapshot, readLedger, recordFinish, recordStart, recordVerification,
  resolveDefaultLedgerPath, summarizeLedger, verifyLedger,
} from "../packages/real-task-recorder/index.mjs";

const root=resolve(import.meta.dirname,"..");
const readJson=async(rel)=>JSON.parse(await readFile(resolve(root,rel),"utf8"));
const [recorderPolicy,evaluationPolicy,employees]=await Promise.all([
  readJson("config/real-task-recorder.json"),
  readJson("config/real-task-evaluation.json"),
  readJson("config/employees.json"),
]);
const context={recorderPolicy,evaluationPolicy,employees};
const argv=process.argv.slice(2);
const command=argv[0]||"status";
const flag=(name)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:null;};
const has=(name)=>argv.includes(name);
const ledgerPath=resolve(flag("--ledger")||resolveDefaultLedgerPath(root,recorderPolicy));

async function inputPayload() {
  const path=flag("--input");
  if(path) return JSON.parse(await readFile(resolve(path),"utf8"));
  if(has("--stdin")) {
    let text="";
    for await (const chunk of process.stdin) text+=chunk;
    return JSON.parse(text);
  }
  throw new Error("provide --input <json-file> or --stdin");
}

function print(value) {
  process.stdout.write(JSON.stringify(value,null,2)+"\n");
}

try {
  if(command==="start") {
    const result=await recordStart({ledgerPath,payload:await inputPayload(),context});
    print({ok:true,case_id:result.event.case_id,event_hash:result.event.event_hash,summary:result.summary,ledger:ledgerPath});
  } else if(command==="finish") {
    const result=await recordFinish({ledgerPath,payload:await inputPayload(),context});
    print({ok:true,case_id:result.event.case_id,event_hash:result.event.event_hash,summary:result.summary,ledger:ledgerPath});
  } else if(command==="verify") {
    const result=await recordVerification({ledgerPath,payload:await inputPayload(),context});
    print({ok:true,case_id:result.event.case_id,event_hash:result.event.event_hash,summary:result.summary,ledger:ledgerPath});
  } else if(command==="validate") {
    const events=await readLedger(ledgerPath);
    const result=verifyLedger(events,context);
    print({ok:result.ok,errors:result.errors,events:result.events,cases:result.cases,head_hash:result.head_hash,ledger:ledgerPath});
    if(!result.ok) process.exitCode=1;
  } else if(command==="export") {
    const events=await readLedger(ledgerPath);
    const checked=verifyLedger(events,context);
    if(!checked.ok) throw new Error("ledger integrity failed: "+checked.errors.join("; "));
    const dataset=buildDatasetSnapshot({events,evaluationPolicy,environment:{source:"local hash-chained recorder"}});
    const out=resolve(flag("--out")||"real-task-recorder-export.json");
    await writeFile(out,JSON.stringify(dataset,null,2)+"\n",{encoding:"utf8",mode:0o600});
    print({ok:true,out,cases:dataset.cases.length,false_successes:dataset.summary.false_successes,acceptance_passed:dataset.summary.acceptance_passed});
  } else if(command==="status") {
    const events=await readLedger(ledgerPath);
    const checked=verifyLedger(events,context);
    print({ok:checked.ok,integrity_errors:checked.errors,ledger:ledgerPath,...summarizeLedger(events)});
    if(!checked.ok) process.exitCode=1;
  } else {
    throw new Error("usage: real-task-recorder.mjs <start|finish|verify|status|validate|export> [--input file|--stdin] [--ledger path] [--out path]");
  }
} catch(error) {
  process.stderr.write("Real Task Recorder error: "+error.message+"\n");
  process.exitCode=1;
}

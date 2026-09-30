import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyExecutionReceipt } from "../../packages/execution-receipt/index.mjs";
import { verifyEvidencePacket } from "../../packages/evidence-verifier/index.mjs";

const asList=(value)=>Array.isArray(value)?value:value==null?[]:[value];
const clean=(value)=>String(value??"").trim();
const sortStrings=(values)=>[...values].map(String).sort();

function normalizeReceiptChecks(packet){
  const expected=packet.expected||{};
  const evidence=packet.evidence||{};
  const consumed=new Set(asList(expected.consumed_receipt_refs).map(clean).filter(Boolean));
  const publicKeys=expected.receipt_public_keys && typeof expected.receipt_public_keys==="object" && !Array.isArray(expected.receipt_public_keys)
    ? expected.receipt_public_keys : {};
  const requiredStates=asList(expected.required_receipt_result_states).map(clean).filter(Boolean);
  const allowedProviders=asList(expected.allowed_receipt_runtime_providers).map(clean).filter(Boolean);
  const allowedPrefixes=asList(expected.allowed_receipt_runtime_ref_prefixes).map(clean).filter(Boolean);
  const maxAge=Object.prototype.hasOwnProperty.call(expected,"max_execution_receipt_age_ms")
    ? expected.max_execution_receipt_age_ms
    : (packet.maxAgeMs??15*60*1000);
  const now=new Date(packet.now);
  const checks=[];
  for(const envelope of (Array.isArray(evidence.signed_receipts)?evidence.signed_receipts:[])){
    const check=verifyExecutionReceipt(envelope,{
      publicKeys,
      now,
      maxReceiptAgeMs:maxAge,
      consumedReceiptRefs:consumed,
      allowedRuntimeProviders:allowedProviders,
      allowedRuntimeRefPrefixes:allowedPrefixes,
      requiredTaskId:clean(expected.task_id)||null,
      requiredEmployeeId:clean(expected.assignee_id).toLowerCase()||null,
      requiredCapabilityId:Object.prototype.hasOwnProperty.call(expected,"capability_id")?expected.capability_id:undefined,
      requiredResultStates:requiredStates.length?requiredStates:null,
    });
    checks.push(sortStrings(check.reasons));
    if(check.receipt_ref) consumed.add(check.receipt_ref);
  }
  return checks;
}

export function evaluateCase(testCase){
  const result=verifyEvidencePacket({
    ...testCase.packet,
    now:new Date(testCase.packet.now),
  });
  return {
    id:testCase.id,
    accept:result.ok===true,
    packet_reason_codes:sortStrings(result.reasons.map((item)=>item.code)),
    receipt_reason_sets:normalizeReceiptChecks(testCase.packet),
  };
}

export function evaluateCorpus(corpus){
  return {
    schema:1,
    corpus_id:corpus.id,
    cases:corpus.cases.map(evaluateCase),
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const corpusPath=resolve(process.argv[2]||"benchmarks/verifier-differential/corpus.json");
  const bytes=await readFile(corpusPath);
  const corpus=JSON.parse(bytes.toString("utf8"));
  const output=evaluateCorpus(corpus);
  output.corpus_sha256=createHash("sha256").update(bytes).digest("hex");
  process.stdout.write(JSON.stringify(output,null,2)+"\n");
}

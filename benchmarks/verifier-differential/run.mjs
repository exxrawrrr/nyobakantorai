import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { evaluateCorpus } from "./node-runner.mjs";

const corpusPath=resolve(process.argv[2]||"benchmarks/verifier-differential/corpus.json");
const bytes=await readFile(corpusPath);
const corpus=JSON.parse(bytes.toString("utf8"));
const corpusSha=createHash("sha256").update(bytes).digest("hex");

const nodeResult=evaluateCorpus(corpus);
nodeResult.corpus_sha256=corpusSha;

const python=process.env.PYTHON||process.env.PYTHON3||"python";
const py=spawnSync(
  python,
  ["reference-verifier/python/differential_runner.py",corpusPath],
  {encoding:"utf8",windowsHide:true,shell:false,cwd:process.cwd()}
);
if(py.error) throw py.error;
if(py.status!==0){
  process.stderr.write(py.stderr||"Python differential runner failed.\n");
  process.exit(py.status||1);
}
const pythonResult=JSON.parse(py.stdout);

const expectedById=new Map(corpus.cases.map((item)=>[item.id,item.expected]));
const nodeById=new Map(nodeResult.cases.map((item)=>[item.id,item]));
const pythonById=new Map(pythonResult.cases.map((item)=>[item.id,item]));
const failures=[];

if(nodeResult.corpus_sha256!==corpusSha) failures.push("Node corpus SHA mismatch");
if(pythonResult.corpus_sha256!==corpusSha) failures.push("Python corpus SHA mismatch");

function stable(value){return JSON.stringify(value);}
function sameCase(left,right){
  return left?.id===right?.id
    && left?.accept===right?.accept
    && stable(left?.packet_reason_codes||[])===stable(right?.packet_reason_codes||[])
    && stable(left?.receipt_reason_sets||[])===stable(right?.receipt_reason_sets||[]);
}
let agreementCount=0;
for(const testCase of corpus.cases){
  const id=testCase.id;
  const expected=expectedById.get(id);
  const node=nodeById.get(id);
  const pyCase=pythonById.get(id);
  if(!node) failures.push(id+": missing Node result");
  if(!pyCase) failures.push(id+": missing Python result");
  if(!node||!pyCase) continue;

  const expectedNormalized={
    id,
    accept:expected.accept,
    packet_reason_codes:[...expected.packet_reason_codes].sort(),
    receipt_reason_sets:expected.receipt_reason_sets.map((set)=>[...set].sort()),
  };
  if(!sameCase(node,expectedNormalized)){
    failures.push(id+": Node != corpus expected\n  expected="+stable(expectedNormalized)+"\n  actual="+stable(node));
  }
  if(!sameCase(pyCase,expectedNormalized)){
    failures.push(id+": Python != corpus expected\n  expected="+stable(expectedNormalized)+"\n  actual="+stable(pyCase));
  }
  if(sameCase(node,pyCase)){
    agreementCount+=1;
  }else{
    failures.push(id+": Node/Python disagreement\n  node="+stable(node)+"\n  python="+stable(pyCase));
  }
}

const summary={
  schema:1,
  corpus_id:corpus.id,
  corpus_sha256:corpusSha,
  case_count:corpus.cases.length,
  agreement_count:agreementCount,
  expected_match:failures.length===0,
  failures,
};

process.stdout.write(JSON.stringify(summary,null,2)+"\n");
if(failures.length) process.exit(1);

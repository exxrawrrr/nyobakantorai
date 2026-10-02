import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const cases=[
  ["one_worker",["scripts/fresh-install-matrix.mjs","--employee=siti"]],
  ["subset",["scripts/fresh-install-matrix.mjs","--mode=subset","--employees=engineering","--remove=bimo"]],
  ["full",["scripts/fresh-install-matrix.mjs","--mode=full"]],
  ["lifecycle",["scripts/fresh-install-matrix.mjs","--mode=lifecycle","--remove=bimo"]],
];

const results=[];
for(const [id,args] of cases){
  const run=spawnSync(process.execPath,args,{cwd:root,encoding:"utf8",env:{...process.env}});
  results.push({
    id,
    status:run.status,
    passed:run.status===0,
    stdout:(run.stdout||"").trim().split(/\r?\n/).slice(-12),
    stderr:(run.stderr||"").trim().split(/\r?\n/).slice(-12).filter(Boolean),
  });
}

const summary={
  schema:1,
  kind:"v1-production-install-matrix",
  source_commit:process.env.GITHUB_SHA||null,
  one_worker:results.find((x)=>x.id==="one_worker").passed,
  subset:results.find((x)=>x.id==="subset").passed,
  full:results.find((x)=>x.id==="full").passed,
  lifecycle:results.find((x)=>x.id==="lifecycle").passed,
  cases:results,
};

process.stdout.write(JSON.stringify(summary,null,2)+"\n");
if(results.some((x)=>!x.passed))process.exit(1);

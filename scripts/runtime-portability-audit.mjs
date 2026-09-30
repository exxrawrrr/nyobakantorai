import { readAndValidateRuntimePortabilityMap } from "../packages/runtime-portability/index.mjs";

const {map,validation}=await readAndValidateRuntimePortabilityMap();
const output={
  audit:map.audit,
  audited_release:map.audited_release,
  audited_base_commit:map.audited_base_commit,
  ok:validation.ok,
  surface_count:validation.surface_count,
  counts:validation.counts,
  errors:validation.errors,
};
if(process.argv.includes("--json")) console.log(JSON.stringify(output,null,2));
else {
  console.log(`Runtime portability map: ${validation.ok?"PASS":"FAIL"} · ${validation.surface_count} surfaces`);
  for(const [name,count] of Object.entries(validation.counts)) console.log(`- ${name}: ${count}`);
  for(const error of validation.errors) console.error(`${error.code}: ${error.detail}`);
}
if(!validation.ok) process.exit(1);

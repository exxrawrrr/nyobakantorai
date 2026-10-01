import { readFile, readdir, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

export const PORTABILITY_CLASSIFICATIONS = Object.freeze([
  "CORE_PORTABLE",
  "ADAPTER_BOUNDARY",
  "HERMES_SHAPED",
  "RUNTIME_SPECIFIC_BY_DESIGN",
  "UNKNOWN_REQUIRES_PROOF",
]);

const nonEmpty=(value)=>typeof value==="string"&&value.trim().length>0;

async function pathInfo(root, relativePath) {
  const absolute=resolve(root, relativePath);
  try { return { absolute, info:await stat(absolute) }; }
  catch { return { absolute, info:null }; }
}

async function collectSourceFiles(absolute, extensions) {
  const info=await stat(absolute);
  if(info.isFile()) return extensions.has(extname(absolute)) ? [absolute] : [];
  if(!info.isDirectory()) return [];
  const out=[];
  for(const entry of await readdir(absolute,{withFileTypes:true})){
    const child=resolve(absolute,entry.name);
    if(entry.isDirectory()) out.push(...await collectSourceFiles(child,extensions));
    else if(entry.isFile()&&extensions.has(extname(entry.name))) out.push(child);
  }
  return out;
}

function importedSpecifiers(source) {
  const found=[];
  const patterns=[
    /(?:import|export)\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for(const pattern of patterns){
    for(const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

export async function validateRuntimePortabilityMap(map,{root=process.cwd()}={}) {
  const errors=[];
  if(map?.schema!==1) errors.push({code:"SCHEMA_VERSION",detail:"schema must be 1"});
  if(!nonEmpty(map?.audit)) errors.push({code:"AUDIT_ID",detail:"audit id required"});
  if(!Array.isArray(map?.surfaces)||map.surfaces.length===0) errors.push({code:"SURFACES_REQUIRED",detail:"surfaces required"});

  const allowed=new Set(PORTABILITY_CLASSIFICATIONS);
  const ids=new Set();
  for(const surface of map?.surfaces||[]){
    if(!nonEmpty(surface?.id)) errors.push({code:"SURFACE_ID",detail:"surface id required"});
    else if(ids.has(surface.id)) errors.push({code:"DUPLICATE_SURFACE",detail:surface.id});
    else ids.add(surface.id);
    if(!allowed.has(surface?.classification)) errors.push({code:"CLASSIFICATION_INVALID",detail:String(surface?.id||"?")});
    if(!Array.isArray(surface?.paths)||surface.paths.length===0) errors.push({code:"PATHS_REQUIRED",detail:String(surface?.id||"?")});
    if(!nonEmpty(surface?.rationale)) errors.push({code:"RATIONALE_REQUIRED",detail:String(surface?.id||"?")});
    if(!nonEmpty(surface?.next_action)) errors.push({code:"NEXT_ACTION_REQUIRED",detail:String(surface?.id||"?")});

    for(const relativePath of surface?.paths||[]){
      const {absolute,info}=await pathInfo(root,relativePath);
      if(!info){
        errors.push({code:"MAPPED_PATH_MISSING",detail:`${surface.id}:${relativePath}`});
        continue;
      }
      if(surface.classification!=="CORE_PORTABLE") continue;
      const extensions=new Set(map?.policy?.portable_source_extensions||[".mjs",".js",".cjs"]);
      const forbidden=map?.policy?.forbidden_core_import_fragments||[];
      for(const file of await collectSourceFiles(absolute,extensions)){
        const source=await readFile(file,"utf8");
        for(const specifier of importedSpecifiers(source)){
          const hit=forbidden.find((fragment)=>specifier.includes(fragment));
          if(hit) errors.push({
            code:"FORBIDDEN_CORE_IMPORT",
            detail:`${surface.id}:${relativePath} imports ${specifier} (matched ${hit})`,
          });
        }
      }
    }
  }

  for(const requiredId of map?.policy?.required_surface_ids||[]){
    if(!ids.has(requiredId)) errors.push({code:"REQUIRED_SURFACE_MISSING",detail:requiredId});
  }

  const counts=Object.fromEntries(PORTABILITY_CLASSIFICATIONS.map((name)=>[
    name,(map?.surfaces||[]).filter((surface)=>surface.classification===name).length
  ]));
  return Object.freeze({
    ok:errors.length===0,
    errors:Object.freeze(errors.map((error)=>Object.freeze(error))),
    surface_count:(map?.surfaces||[]).length,
    counts:Object.freeze(counts),
  });
}

export async function readAndValidateRuntimePortabilityMap({
  root=process.cwd(),
  relativePath="config/runtime-portability-map.json",
}={}) {
  const map=JSON.parse(await readFile(resolve(root,relativePath),"utf8"));
  const validation=await validateRuntimePortabilityMap(map,{root});
  return Object.freeze({map,validation});
}

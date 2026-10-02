import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const clean=(value,max=4000)=>String(value??"").trim().slice(0,max);
function assert(condition,message){ if(!condition) throw new Error(message); }

function fileNameForKey(key){
  const normalized=clean(key,500);
  assert(normalized,"Project Brain storage key is required.");
  return Buffer.from(normalized,"utf8").toString("base64url")+".json";
}

export function createDirectoryProjectBrainStorage(directory){
  const root=resolve(clean(directory,4000));
  assert(root,"Project Brain directory storage path is required.");
  mkdirSync(root,{recursive:true});

  const pathFor=(key)=>join(root,fileNameForKey(key));
  return Object.freeze({
    id:"project-brain-node-directory",
    root,
    get(key){
      const path=pathFor(key);
      return existsSync(path)?readFileSync(path,"utf8"):null;
    },
    set(key,value){
      const path=pathFor(key);
      const tmp=path+".tmp";
      writeFileSync(tmp,String(value),"utf8");
      renameSync(tmp,path);
    },
    remove(key){
      rmSync(pathFor(key),{force:true});
    },
  });
}

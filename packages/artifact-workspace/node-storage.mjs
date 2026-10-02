import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const clean=(value,max=4000)=>String(value??"").trim().slice(0,max);
function assert(condition,message){ if(!condition) throw new Error(message); }

function fileNameForKey(key){
  const normalized=clean(key,240);
  assert(normalized,"Artifact directory storage key is required.");
  return Buffer.from(normalized,"utf8").toString("base64url")+".txt";
}

export function createDirectoryArtifactStorage(directory){
  const root=resolve(clean(directory,4000));
  assert(root,"Artifact directory storage path is required.");
  mkdirSync(root,{recursive:true});

  const pathFor=(key)=>join(root,fileNameForKey(key));
  return Object.freeze({
    id:"node-directory",
    root,
    get(key){
      const path=pathFor(key);
      return existsSync(path)?readFileSync(path,"utf8"):null;
    },
    set(key,value){
      const path=pathFor(key);
      const tmp=path+".tmp";
      writeFileSync(tmp,String(value),"utf8");
      rmSync(path,{force:true});
      writeFileSync(path,readFileSync(tmp));
      rmSync(tmp,{force:true});
    },
    remove(key){
      rmSync(pathFor(key),{force:true});
    },
  });
}

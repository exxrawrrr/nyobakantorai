import test from "node:test";
import assert from "node:assert/strict";
import { resolveHermesHome } from "../hermes-home.mjs";

test("explicit nyobakantorai Hermes home wins", () => {
  assert.equal(resolveHermesHome({ env:{NYOBAKANTORAI_HERMES_HOME:"X:/custom",HERMES_HOME:"Y:/other"}, platform:"win32", home:"C:/Users/a", exists:()=>true }),"X:/custom");
});

test("Windows detects official LOCALAPPDATA Hermes home before legacy dot-home", () => {
  const seen=[];
  const value=resolveHermesHome({ env:{LOCALAPPDATA:"C:/Users/a/AppData/Local"}, platform:"win32", home:"C:/Users/a", exists:(p)=>{seen.push(p); return p.includes("AppData");} });
  assert.match(value,/AppData[\\/]Local[\\/]hermes$/);
  assert.equal(seen.length,1);
});

test("POSIX falls back to ~/.hermes", () => {
  const value=resolveHermesHome({ env:{}, platform:"linux", home:"/home/a", exists:(p)=>p==="/home/a/.hermes" });
  assert.equal(value,"/home/a/.hermes");
});

test("missing Hermes home stays disabled", () => {
  assert.equal(resolveHermesHome({ env:{}, platform:"linux", home:"/home/a", exists:()=>false }),"");
});
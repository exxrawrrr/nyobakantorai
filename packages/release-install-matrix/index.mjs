import { createHash } from "node:crypto";
import { EMPLOYEE_IDS } from "../../office/workforce.mjs";
import { resolveEmployeeSelection } from "../../scripts/employee-selection.mjs";
import { planSelectedProfileActions, USER_OWNED_HERMES_STATE } from "../../scripts/hermes-bootstrap-plan.mjs";
import { planSelectedProfileRemoval, removalSucceeded } from "../../scripts/hermes-remove-selected.mjs";

const hash=(value)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

function createState({profiles=[],userStateSeed="seed"}={}){
  const profileMap=new Map();
  for(const id of profiles){
    profileMap.set(id,{
      distribution_version:"legacy",
      user_state:Object.fromEntries(USER_OWNED_HERMES_STATE.map((key)=>[key,hash([userStateSeed,id,key])]))
    });
  }
  return {profiles:profileMap};
}

function snapshotUserState(state,ids){
  return Object.fromEntries(ids.map((id)=>[
    id,
    state.profiles.has(id)?structuredClone(state.profiles.get(id).user_state):null
  ]));
}

function applyBootstrap({state,selection,mode="install"}){
  const selected=resolveEmployeeSelection(selection,EMPLOYEE_IDS);
  const actions=planSelectedProfileActions({
    selectedIds:selected,
    existingIds:[...state.profiles.keys()],
    mode
  });
  const results=[];
  for(const item of actions){
    if(item.action==="install"||item.action==="force-install"){
      state.profiles.set(item.profile,{
        distribution_version:"candidate",
        user_state:Object.fromEntries(USER_OWNED_HERMES_STATE.map((key)=>[key,hash(["fresh",item.profile,key])]))
      });
      results.push({profile:item.profile,action:item.action,ok:true});
      continue;
    }
    if(item.action==="native-upgrade"||item.action==="native-update"){
      const current=state.profiles.get(item.profile);
      if(!current){
        results.push({profile:item.profile,action:item.action,ok:false});
        continue;
      }
      state.profiles.set(item.profile,{
        ...current,
        distribution_version:"candidate"
      });
      results.push({profile:item.profile,action:item.action,ok:true});
      continue;
    }
    if(item.action==="skip-existing"||item.action==="check"){
      results.push({profile:item.profile,action:item.action,ok:state.profiles.has(item.profile)});
      continue;
    }
    results.push({profile:item.profile,action:item.action,ok:false});
  }
  return {selected,actions,results};
}

function applyRemoval({state,selection,confirmed}){
  const plan=planSelectedProfileRemoval({selection,confirmDeleteUserState:confirmed});
  if(!confirmed){
    return {
      plan,
      results:[],
      verification:plan.profiles.map((id)=>({id,exists:state.profiles.has(id)})),
      mutated:false,
      ok:true
    };
  }
  const results=[];
  for(const id of plan.profiles){
    const existed=state.profiles.has(id);
    state.profiles.delete(id);
    results.push({profile:id,action:existed?"delete":"already-absent",ok:true});
  }
  const verification=plan.profiles.map((id)=>({id,exists:state.profiles.has(id)}));
  return {plan,results,verification,mutated:true,ok:removalSucceeded({results,verification})};
}

function exactProfiles(state,expected){
  const actual=[...state.profiles.keys()].sort();
  const wanted=[...expected].sort();
  return actual.length===wanted.length&&actual.every((id,i)=>id===wanted[i]);
}

function scenario(name,fn){
  const started=Date.now();
  try{
    const details=fn();
    return Object.freeze({name,passed:details.passed===true,duration_ms:Date.now()-started,...details});
  }catch(error){
    return Object.freeze({name,passed:false,duration_ms:Date.now()-started,error:String(error?.message||error)});
  }
}

export function runReleaseInstallMatrix(){
  const scenarios=[];

  scenarios.push(scenario("single-worker-fresh-install",()=>{
    const state=createState();
    const run=applyBootstrap({state,selection:"siti",mode:"install"});
    const passed=
      run.actions.length===1 &&
      run.actions[0].profile==="siti" &&
      run.actions[0].action==="install" &&
      exactProfiles(state,["siti"]);
    return {passed,selected:run.selected,actions:run.actions,profiles:[...state.profiles.keys()]};
  }));

  scenarios.push(scenario("arbitrary-subset-fresh-install",()=>{
    const state=createState();
    const run=applyBootstrap({state,selection:"praroro,siti",mode:"install"});
    const passed=
      run.actions.every((x)=>x.action==="install") &&
      exactProfiles(state,["praroro","siti"]);
    return {passed,selected:run.selected,actions:run.actions,profiles:[...state.profiles.keys()]};
  }));

  scenarios.push(scenario("full-workforce-fresh-install",()=>{
    const state=createState();
    const run=applyBootstrap({state,selection:"all",mode:"install"});
    const passed=
      run.actions.length===EMPLOYEE_IDS.length &&
      run.actions.every((x)=>x.action==="install") &&
      exactProfiles(state,EMPLOYEE_IDS);
    return {passed,employee_count:EMPLOYEE_IDS.length,action_count:run.actions.length};
  }));

  scenarios.push(scenario("v02-to-v04-upgrade-preserves-user-state",()=>{
    const legacy=["praroro","paijo","subagjo","alex","sumiati","siti"];
    const state=createState({profiles:legacy,userStateSeed:"owner-state"});
    const before=snapshotUserState(state,legacy);
    const run=applyBootstrap({state,selection:"all",mode:"upgrade"});
    const after=snapshotUserState(state,legacy);
    const existingActions=run.actions.filter((x)=>legacy.includes(x.profile));
    const newActions=run.actions.filter((x)=>!legacy.includes(x.profile));
    const userStatePreserved=JSON.stringify(before)===JSON.stringify(after);
    const passed=
      exactProfiles(state,EMPLOYEE_IDS) &&
      existingActions.every((x)=>x.action==="native-upgrade") &&
      newActions.every((x)=>x.action==="install") &&
      userStatePreserved;
    return {
      passed,
      existing_profile_count:legacy.length,
      new_profile_count:newActions.length,
      user_state_preserved:userStatePreserved,
      protected_state_keys:[...USER_OWNED_HERMES_STATE]
    };
  }));

  scenarios.push(scenario("uninstall-preview-is-non-mutating",()=>{
    const state=createState({profiles:EMPLOYEE_IDS});
    const before=[...state.profiles.keys()].sort();
    const run=applyRemoval({state,selection:"praroro,siti",confirmed:false});
    const after=[...state.profiles.keys()].sort();
    const passed=
      run.plan.action==="PREVIEW_ONLY" &&
      run.mutated===false &&
      JSON.stringify(before)===JSON.stringify(after);
    return {passed,selected:run.plan.profiles,mutated:run.mutated};
  }));

  scenarios.push(scenario("scoped-uninstall-preserves-unselected-workers",()=>{
    const state=createState({profiles:EMPLOYEE_IDS});
    const selected=["praroro","siti"];
    const expected=EMPLOYEE_IDS.filter((id)=>!selected.includes(id));
    const run=applyRemoval({state,selection:selected.join(","),confirmed:true});
    const passed=
      run.ok &&
      exactProfiles(state,expected) &&
      selected.every((id)=>!state.profiles.has(id));
    return {
      passed,
      selected:run.plan.profiles,
      remaining_count:state.profiles.size,
      unrelated_preserved:exactProfiles(state,expected)
    };
  }));

  scenarios.push(scenario("reinstall-after-scoped-uninstall",()=>{
    const state=createState({profiles:EMPLOYEE_IDS});
    applyRemoval({state,selection:"siti",confirmed:true});
    const run=applyBootstrap({state,selection:"siti",mode:"install"});
    const passed=
      run.actions.length===1 &&
      run.actions[0].action==="install" &&
      exactProfiles(state,EMPLOYEE_IDS);
    return {passed,action:run.actions[0],employee_count:state.profiles.size};
  }));

  const passed=scenarios.every((x)=>x.passed);
  return Object.freeze({
    schema:1,
    matrix:"v0.4-clean-room-install-lifecycle",
    claim_state:passed?"DETERMINISTIC_CLEAN_ROOM_PASS":"DETERMINISTIC_CLEAN_ROOM_FAIL",
    passed,
    platform:process.platform,
    node:process.version,
    scenario_count:scenarios.length,
    scenarios:Object.freeze(scenarios),
    claim_limit:"This matrix proves repository selection/upgrade/removal invariants in deterministic isolated state. It does not prove every upstream Hermes version, OS installer, provider authentication, or external runtime behavior."
  });
}

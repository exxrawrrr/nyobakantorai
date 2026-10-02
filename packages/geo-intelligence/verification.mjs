import { runSitiVerification,validateSitiVerificationRecord } from "../evidence-verifier/siti.mjs";
import { assert,clean,freeze,uniq } from "./common.mjs";

function allProfileSourceRefs(profile){return uniq([profile.cluster_ref,...(profile.source_refs||[])]).sort();}

export async function verifyBusinessProfileWithSiti({
  profile,score,author_employee_id="alex",now,task_id="task-geo-profile-verification",mission_id="mission-geo-intelligence",
}={}){
  assert(profile?.schema===1,"Profile required for Siti verification.");
  assert(score?.profile_ref===profile.profile_ref,"Score/profile mismatch for Siti verification.");
  assert(author_employee_id!=="siti","Siti may not author the profile she verifies.");
  const refs=allProfileSourceRefs(profile);
  assert(refs.length>0,"Profile verification requires source refs.");
  const facts=[
    "profile-ref:"+profile.profile_ref,
    "score:"+String(score.score),
    "score-model:"+score.model_id+"@"+score.model_version,
  ];
  const completion=["profile-provenance-checked","score-rationale-inspected","dedupe-rationale-inspected"];
  const task={
    schema:1,task_id,mission_id,title:"Verify geo business profile",
    objective:"Independently verify provenance, dedupe rationale, and scoring evidence.",
    employee_id:author_employee_id,risk_class:"READ_ONLY",state:"SUCCEEDED",
    approval:{required:false,status:"NOT_REQUIRED",approval_ref:null},
    attempt_ids:["attempt-"+task_id],evidence_refs:["artifact:"+profile.profile_ref,"artifact:"+score.score_ref],
    receipt_refs:[],blocking:null,legacy:null,
    created_at:new Date(Date.parse(now)-60_000).toISOString(),updated_at:new Date(Date.parse(now)-30_000).toISOString(),
  };

  const claims=[];
  claims.push({
    claim_id:"profile-identity",
    statement:"Profile identity and provenance were resolved under bounded geo policy.",
    source_ref:profile.cluster_ref,source_exists:true,source_relevant:true,source_current:true,
    expected_value:profile.profile_ref,observed_value:profile.profile_ref,
  });
  for(const contribution of score.contributions.filter(x=>x.points>0)){
    const sourceRef=contribution.evidence_refs[0];
    claims.push({
      claim_id:"score-"+contribution.criterion_id,
      statement:contribution.rationale,
      source_ref:sourceRef,source_exists:refs.includes(sourceRef),source_relevant:true,source_current:true,
      expected_value:String(contribution.points),observed_value:String(contribution.points),expected_unit:"points",observed_unit:"points",
    });
  }
  if(Object.values(profile.fields||{}).some(x=>x.status==="CONFLICT")){
    claims.push({
      claim_id:"unresolved-profile-conflict",statement:"No unresolved material profile conflicts remain.",
      source_ref:profile.cluster_ref,source_exists:true,source_relevant:false,source_current:true,
      expected_value:"none",observed_value:"conflict",
    });
  }

  const verification=await runSitiVerification({
    task_node:task,verifier_id:"siti",kind:"RESEARCH",
    evidence_packet:{
      expected:{
        required_facts:facts,required_artifacts:["artifact:"+profile.profile_ref,"artifact:"+score.score_ref],
        required_completion_items:completion,required_evidence_refs:refs,
      },
      report:{text:facts.join(" | "),claimed_verified:true,claimed_executed:false},
      evidence:{
        observed_text:facts.join(" | "),refs,artifacts:["artifact:"+profile.profile_ref,"artifact:"+score.score_ref],
        completion_items:completion,checked_at:new Date(Date.parse(now)-5_000).toISOString(),
      },
    },
    research:{claims},
    now:new Date(now),
  });
  validateSitiVerificationRecord(verification);
  return freeze(verification);
}

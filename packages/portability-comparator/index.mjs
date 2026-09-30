import { canonicalJson, sha256 } from "../execution-receipt/index.mjs";

export const PORTABILITY_CLAIM_STATES = Object.freeze([
  "NOT_RUN",
  "PARTIAL",
  "PORTABILITY_CANDIDATE",
  "PORTABILITY_VERIFIED_FOR_REFERENCE_CASE",
]);

export const PORTABILITY_EVIDENCE_CLASSES = Object.freeze([
  "FIXTURE_EVIDENCE",
  "UNVERIFIED_RUNTIME_ATTEMPT",
  "LIVE_RUNTIME_EVIDENCE",
]);

export const EXTERNAL_VERIFICATION_STATES = Object.freeze([
  "NOT_RUN",
  "PASS",
  "FAIL",
]);

const EXPECTED_RUNTIME_PAIR = Object.freeze(["codex","hermes"]);
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;

const clean = (value,max=1000) => String(value ?? "").trim().slice(0,max);

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function assert(condition,message) {
  if (!condition) throw new Error(message);
}

function unique(values) {
  return [...new Set(values)];
}

function refValue(refs,prefix) {
  const match=(refs || []).find((value)=>String(value).startsWith(prefix));
  return match ? String(match).slice(prefix.length) : "";
}

function normalizeVerification(value={}) {
  const status=clean(value.status,40).toUpperCase() || "NOT_RUN";
  assert(EXTERNAL_VERIFICATION_STATES.includes(status),"external verification status invalid");
  const implementationId=clean(value.implementation_id,120);
  const evidenceRef=clean(value.evidence_ref,1000);
  const independent=value.independent === true;
  if(status==="PASS"){
    assert(implementationId,"PASS verification requires implementation_id");
    assert(evidenceRef,"PASS verification requires evidence_ref");
  }
  return freeze({
    status,
    independent,
    implementation_id:implementationId || null,
    evidence_ref:evidenceRef || null,
  });
}

export function createPortabilityRunRecord({
  reference,
  outcome,
  evidenceClass,
  externalVerification={status:"NOT_RUN"},
}={}) {
  assert(reference?.manifest?.reference_case_id,"reference manifest required");
  assert(outcome?.schema===1,"runtime outcome schema must be 1");
  const evidenceClassValue=clean(evidenceClass,80).toUpperCase();
  assert(PORTABILITY_EVIDENCE_CLASSES.includes(evidenceClassValue),"portability evidence class invalid");

  const evidence=outcome.evidence || null;
  const refs=evidence?.evidence_refs || [];
  const coreRef=refValue(refs,"core-bundle-sha256:");
  const beforeRef=refValue(refs,"workspace-before-sha256:");
  const afterRef=refValue(refs,"workspace-after-sha256:");
  const codeCommit=refValue(refs,"code-commit:");

  return freeze({
    schema:1,
    reference_case_id:reference.manifest.reference_case_id,
    core_bundle_sha256:reference.manifest.core_bundle_sha256,
    component_sha256:structuredClone(reference.manifest.component_sha256),
    evidence_class:evidenceClassValue,
    adapter:{
      id:clean(outcome.adapter_id,120),
      version:clean(outcome.adapter_version,120),
    },
    runtime:{
      provider:clean(outcome.runtime?.provider,64).toLowerCase(),
      runtime_ref:clean(outcome.runtime?.runtime_ref,512),
      provider_version:outcome.runtime?.provider_version == null ? null : clean(outcome.runtime.provider_version,120),
    },
    execution:{
      ok:outcome.ok === true,
      state:clean(outcome.state,40).toUpperCase(),
      error_category:outcome.error_category == null ? null : clean(outcome.error_category,120),
      started_at:clean(outcome.started_at,120),
      finished_at:clean(outcome.finished_at,120),
      cleanup_attempted:outcome.cleanup?.attempted === true,
      cleanup_ok:outcome.cleanup?.ok === true,
    },
    normalized_result:outcome.normalized_result ? structuredClone(outcome.normalized_result) : null,
    evidence:evidence ? structuredClone(evidence) : null,
    evidence_binding:{
      core_bundle_sha256:coreRef || null,
      workspace_before_sha256:beforeRef || null,
      workspace_after_sha256:afterRef || null,
      code_commit:codeCommit || null,
    },
    external_verification:normalizeVerification(externalVerification),
  });
}

function protectedValue(output,path) {
  const parts=String(path || "").split(".").filter(Boolean);
  if(!parts.length) return undefined;
  let current=output;
  for(let i=0;i<parts.length;i++){
    const part=parts[i];
    if(part==="claims" && Array.isArray(current?.claims) && i+1<parts.length){
      const claimId=parts[++i];
      current=current.claims.find((claim)=>claim?.claim_id===claimId);
      continue;
    }
    current=current?.[part];
  }
  return current;
}

function assessProtectedAtoms(run,reference) {
  const output=run.normalized_result?.output;
  const checks=[];
  for(const atom of reference.core_bundle.verification_contract.protected_atoms){
    const actual=protectedValue(output,atom.path);
    checks.push(freeze({
      path:atom.path,
      expected:atom.expected,
      actual:actual === undefined ? null : actual,
      passed:actual === atom.expected,
    }));
  }
  const limitations=Array.isArray(output?.residual_limitations) ? output.residual_limitations : [];
  const residualTruth=limitations.some((item)=>/incomplete/i.test(String(item)));
  return freeze({
    passed:checks.every((item)=>item.passed) && residualTruth,
    protected_atoms:Object.freeze(checks),
    residual_limitation_present:residualTruth,
  });
}

function assessEvidence(run,reference) {
  const reasons=[];
  const evidence=run.evidence;
  if(!evidence) reasons.push("EVIDENCE_MISSING");
  if(!run.adapter.id || !run.adapter.version) reasons.push("ADAPTER_IDENTITY_INCOMPLETE");
  if(!run.runtime.provider || !run.runtime.runtime_ref) reasons.push("RUNTIME_IDENTITY_INCOMPLETE");
  if(!run.execution.started_at || !run.execution.finished_at) reasons.push("TIMESTAMPS_INCOMPLETE");
  if(!run.execution.cleanup_attempted || !run.execution.cleanup_ok) reasons.push("CLEANUP_INCOMPLETE");
  if(!run.execution.ok || run.execution.state!=="SUCCEEDED") reasons.push("RUNTIME_EXECUTION_NOT_SUCCESSFUL");
  if(!run.normalized_result || run.normalized_result.state!=="SUCCEEDED") reasons.push("NORMALIZED_RESULT_NOT_SUCCESSFUL");

  if(evidence){
    if(!clean(evidence.raw_result_ref)) reasons.push("RAW_RESULT_REF_MISSING");
    if(!clean(evidence.normalized_result_ref)) reasons.push("NORMALIZED_RESULT_REF_MISSING");
    if(!Array.isArray(evidence.capabilities_used) || !evidence.capabilities_used.length) reasons.push("CAPABILITIES_USED_MISSING");
    if(evidence.workspace_mutation_check?.temporary_workspace_only!==true) reasons.push("TEMPORARY_WORKSPACE_NOT_PROVEN");
    if(evidence.workspace_mutation_check?.production_repo_changed!==false) reasons.push("PRODUCTION_REPO_MUTATION");
    if(evidence.prohibited_action_check?.passed!==true) reasons.push("PROHIBITED_ACTION_CHECK_FAILED");
    for(const key of ["install","login","account_mutation","external_write"]){
      if(evidence.runtime_actions?.[key]!==false) reasons.push("FORBIDDEN_RUNTIME_ACTION_"+key.toUpperCase());
    }
  }

  if(run.evidence_binding.core_bundle_sha256!==reference.manifest.core_bundle_sha256) reasons.push("CORE_EVIDENCE_BINDING_MISMATCH");
  if(!SHA256.test(run.evidence_binding.workspace_before_sha256 || "")) reasons.push("WORKSPACE_BEFORE_HASH_MISSING");
  if(!SHA256.test(run.evidence_binding.workspace_after_sha256 || "")) reasons.push("WORKSPACE_AFTER_HASH_MISSING");
  if(!run.evidence_binding.code_commit) reasons.push("CODE_COMMIT_MISSING");
  if(run.evidence_class==="LIVE_RUNTIME_EVIDENCE" && !GIT_SHA.test(run.evidence_binding.code_commit || "")) reasons.push("LIVE_CODE_COMMIT_NOT_EXACT_SHA");

  const atomAssessment=assessProtectedAtoms(run,reference);
  if(!atomAssessment.passed){
    if(!atomAssessment.residual_limitation_present) reasons.push("RESIDUAL_LIMITATION_MISSING");
    if(atomAssessment.protected_atoms.some((item)=>!item.passed)) reasons.push("PROTECTED_ATOM_MISMATCH");
  }

  return freeze({
    complete:reasons.length===0,
    reasons:Object.freeze(unique(reasons)),
    protected_atoms:atomAssessment,
  });
}

function sameComponents(left,right) {
  return canonicalJson(left.component_sha256)===canonicalJson(right.component_sha256);
}

function componentsMatchReference(run,reference) {
  return canonicalJson(run.component_sha256)===canonicalJson(reference.manifest.component_sha256);
}

function expectedPair(runs) {
  return runs.map((run)=>run.runtime.provider).sort().join(",")===EXPECTED_RUNTIME_PAIR.join(",");
}

function verificationSummary(run) {
  return freeze({
    status:run.external_verification.status,
    independent:run.external_verification.independent,
    implementation_id:run.external_verification.implementation_id,
    evidence_ref:run.external_verification.evidence_ref,
  });
}

export function comparePortabilityReferenceRuns({reference,runs=[]}={}) {
  assert(reference?.manifest?.reference_case_id,"reference manifest required");
  const supplied=(runs || []).filter(Boolean);
  if(supplied.length<2){
    return freeze({
      schema:1,
      reference_case_id:reference.manifest.reference_case_id,
      state:"NOT_RUN",
      parity_claim_allowed:false,
      claim_scope:reference.manifest.claim_limit,
      blocking_reasons:Object.freeze(["BOTH_RUNTIME_RUNS_REQUIRED"]),
      comparison_sha256:sha256(canonicalJson({reference_case_id:reference.manifest.reference_case_id,state:"NOT_RUN"})),
    });
  }
  assert(supplied.length===2,"reference comparator requires exactly two runtime runs");

  const assessments=supplied.map((run)=>assessEvidence(run,reference));
  const blockers=[];

  if(supplied.some((run)=>run.reference_case_id!==reference.manifest.reference_case_id)) blockers.push("REFERENCE_CASE_ID_MISMATCH");
  if(supplied.some((run)=>run.core_bundle_sha256!==reference.manifest.core_bundle_sha256)) blockers.push("CORE_BUNDLE_HASH_MISMATCH");
  if(supplied.some((run)=>!componentsMatchReference(run,reference))) blockers.push("COMPONENT_HASH_REFERENCE_MISMATCH");
  if(!sameComponents(supplied[0],supplied[1])) blockers.push("COMPONENT_HASH_MISMATCH");
  if(!expectedPair(supplied)) blockers.push("RUNTIME_PAIR_INVALID");
  if(supplied[0].core_bundle_sha256!==supplied[1].core_bundle_sha256) blockers.push("CROSS_RUNTIME_CORE_HASH_MISMATCH");
  if(supplied[0].evidence_binding.code_commit!==supplied[1].evidence_binding.code_commit) blockers.push("CODE_COMMIT_MISMATCH");

  for(let i=0;i<assessments.length;i++){
    for(const reason of assessments[i].reasons) blockers.push(supplied[i].runtime.provider.toUpperCase()+":"+reason);
  }

  const protectedAtomAgreement=reference.core_bundle.verification_contract.protected_atoms.every((atom)=>{
    const left=protectedValue(supplied[0].normalized_result?.output,atom.path);
    const right=protectedValue(supplied[1].normalized_result?.output,atom.path);
    return left===right && left===atom.expected;
  });
  if(!protectedAtomAgreement) blockers.push("CROSS_RUNTIME_PROTECTED_ATOM_DISAGREEMENT");

  const hasFixture=supplied.some((run)=>run.evidence_class==="FIXTURE_EVIDENCE");
  const hasUnverified=supplied.some((run)=>run.evidence_class==="UNVERIFIED_RUNTIME_ATTEMPT");
  const hasNonLive=supplied.some((run)=>run.evidence_class!=="LIVE_RUNTIME_EVIDENCE");
  if(hasFixture) blockers.push("FIXTURE_ONLY_EVIDENCE");
  if(hasUnverified) blockers.push("UNVERIFIED_RUNTIME_EVIDENCE");

  const verifierFailed=supplied.some((run)=>run.external_verification.status==="FAIL");
  if(verifierFailed) blockers.push("INDEPENDENT_VERIFIER_FAILED");

  const independentPending=supplied.some((run)=>
    run.external_verification.status!=="PASS" ||
    run.external_verification.independent!==true ||
    !run.external_verification.evidence_ref
  );

  const hardBlockers=blockers.filter((reason)=>reason!=="FIXTURE_ONLY_EVIDENCE");
  let state="PARTIAL";
  if(!hasNonLive && hardBlockers.length===0){
    state=independentPending ? "PORTABILITY_CANDIDATE" : "PORTABILITY_VERIFIED_FOR_REFERENCE_CASE";
  }

  const reportCore={
    schema:1,
    reference_case_id:reference.manifest.reference_case_id,
    state,
    parity_claim_allowed:state==="PORTABILITY_VERIFIED_FOR_REFERENCE_CASE",
    claim_scope:reference.manifest.claim_limit,
    core_identity:{
      expected_sha256:reference.manifest.core_bundle_sha256,
      identical:supplied[0].core_bundle_sha256===supplied[1].core_bundle_sha256 &&
        supplied.every((run)=>run.core_bundle_sha256===reference.manifest.core_bundle_sha256) &&
        sameComponents(supplied[0],supplied[1]),
      component_hashes_identical:sameComponents(supplied[0],supplied[1]),
    },
    runtime_pair:Object.freeze(supplied.map((run)=>freeze({
      provider:run.runtime.provider,
      runtime_ref:run.runtime.runtime_ref,
      adapter_id:run.adapter.id,
      adapter_version:run.adapter.version,
      evidence_class:run.evidence_class,
      verification:verificationSummary(run),
    })).sort((a,b)=>a.provider.localeCompare(b.provider))),
    run_assessments:Object.freeze(supplied.map((run,index)=>freeze({
      provider:run.runtime.provider,
      evidence_complete:assessments[index].complete,
      evidence_reasons:assessments[index].reasons,
      protected_atoms:assessments[index].protected_atoms,
    })).sort((a,b)=>a.provider.localeCompare(b.provider))),
    protected_atom_agreement:protectedAtomAgreement,
    blocking_reasons:Object.freeze(unique(blockers).sort()),
  };

  return freeze({
    ...reportCore,
    comparison_sha256:sha256(canonicalJson(reportCore)),
  });
}

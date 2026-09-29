export function buildReleaseClaimSnapshot(report) {
  if (!report || typeof report !== "object") throw new Error("evaluation report required");
  if (report.valid !== true) throw new Error("release claims cannot be generated from invalid evaluation records");

  const browser = (report.browser?.evaluated || []).map((item) => ({
    provider_id:item.provider_id,
    status:item.status,
    acceptance_passed:Boolean(item.acceptance_passed),
  }));
  const memory = (report.memory?.evaluated || []).map((item) => ({
    provider_id:item.provider_id,
    status:item.status,
    acceptance_passed:Boolean(item.acceptance_passed),
  }));

  return Object.freeze({
    schema:1,
    evaluation_records_valid:true,
    live_evaluation_complete:Boolean(report.live_evaluation_complete),
    browser:Object.freeze(browser),
    memory:Object.freeze(memory),
    real_tasks:Object.freeze({
      status:report.real_tasks?.status || "UNKNOWN",
      claim_state:report.real_tasks?.claim_state || "UNKNOWN",
      cases:Number(report.real_tasks?.cases || 0),
      false_successes:Number(report.real_tasks?.false_successes || 0),
      acceptance_passed:Boolean(report.real_tasks?.acceptance_passed),
    }),
    truth_boundary:"cataloged != installed != connected != authorized != executed != succeeded != verified",
  });
}

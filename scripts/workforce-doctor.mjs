import { spawnSync } from "node:child_process";
import { WORKFORCE } from "../lib/workforce.mjs";

const json = process.argv.includes("--json");
const hermes = process.env.NYOBAKANTORAI_HERMES_EXE || "hermes";
const home = process.env.NYOBAKANTORAI_HERMES_HOME || process.env.HERMES_HOME || "";
const env = { ...process.env, ...(home ? { HERMES_HOME: home } : {}) };

const run = (args) => {
  const result = spawnSync(hermes, args, { encoding: "utf8", windowsHide: true, env });
  return { ok: result.status === 0, out: String(result.stdout || "").trim() };
};

const version = run(["--version"]);
const employees = [];
for (const employee of WORKFORCE) {
  const profile = version.ok ? run(["profile", "show", employee.id]) : { ok: false };
  const external = employee.external_capabilities || [];
  employees.push({
    id: employee.id,
    name: employee.name,
    state: !profile.ok ? "NOT_CONFIGURED" : external.length ? "PARTIAL" : "READY",
    profile: profile.ok,
    capabilities: Object.fromEntries(external.map((capability) => [capability, "NOT_CONNECTED"])),
  });
}
const board = version.ok ? run(["kanban", "boards", "show"]) : { ok: false };
const report = {
  ok: version.ok,
  employee_count: WORKFORCE.length,
  hermes: version.ok ? "READY" : "NOT_CONFIGURED",
  office: "READY",
  kanban: board.ok ? "READY" : "NOT_CONFIGURED",
  gateway: "OPTIONAL",
  telegram: "NOT_CONFIGURED",
  meta_ads: "NOT_CONFIGURED",
  google_ads: "NOT_CONFIGURED",
  employees,
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("nyobakantorai workforce doctor\n");
  console.log(`${WORKFORCE.length} employees discovered\n`);
  for (const employee of employees) {
    console.log(`${employee.name.padEnd(10)} ${employee.state}${Object.keys(employee.capabilities).length ? " — external capability not connected" : ""}`);
  }
  console.log(`\nHermes       ${report.hermes}`);
  console.log(`Office       ${report.office}`);
  console.log(`Kanban       ${report.kanban}`);
  console.log(`Gateway      ${report.gateway}`);
  console.log(`Telegram     ${report.telegram}`);
  console.log(`Meta Ads     ${report.meta_ads}`);
  console.log(`Google Ads   ${report.google_ads}`);
}

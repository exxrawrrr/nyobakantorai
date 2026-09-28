import { readFile, unlink } from "node:fs/promises";
const file = new URL(".nyobakantorai-stop-token", import.meta.url);
const requestedPort = Number.parseInt(process.env.NYOBAKANTORAI_PORT || "4322", 10);
const port = Number.isInteger(requestedPort) && requestedPort > 1023 && requestedPort < 65536 ? requestedPort : 4322;
const base = `http://127.0.0.1:${port}`;
try {
  const token = (await readFile(file, "utf8")).trim();
  const response = await fetch(base + "/api/admin/stop", { method: "POST", headers: { Authorization: `Bearer ${token}`, Origin: base } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  await unlink(file).catch(() => {});
  console.log("nyobakantorai stop requested.");
} catch (error) {
  console.error(`nyobakantorai was not stopped: ${error.message}`);
  process.exitCode = 1;
}

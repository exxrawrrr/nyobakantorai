import test from "node:test";
import assert from "node:assert/strict";
import { createPublicDemoService } from "../public-demo.mjs";
import { routePublicDemoRequest, readBoundedJsonBody } from "../public-demo-http.mjs";

const fixedNow = Date.parse("2026-10-01T12:00:00.000Z");
const service = () => createPublicDemoService({
  now:() => fixedNow,
  token_factory:(() => { let n=0; return () => `session-${++n}`; })(),
});

test("public capabilities disclose demo/live truth and bounded quotas", async () => {
  const current = service();
  const response = await routePublicDemoRequest(current, {
    pathname:"/api/public/capabilities",
    method:"GET",
    headers:{},
    body:null,
  });
  assert.equal(response.status,200);
  assert.equal(response.body.api,1);
  assert.equal(response.body.demo_available,true);
  assert.equal(response.body.live_available,false);
  assert.equal(response.body.no_login,true);
  assert.equal(response.body.one_active_mission_per_session,true);
  assert.ok(response.body.limits.max_requests_per_window > 0);
});

test("session endpoint returns an opaque ephemeral token outside public session metadata", async () => {
  const current = service();
  const response = await routePublicDemoRequest(current, {
    pathname:"/api/public/session",
    method:"POST",
    headers:{},
    body:{},
  });
  assert.equal(response.status,201);
  assert.equal(response.body.ok,true);
  assert.equal("session_token" in response.body,false);
  assert.equal("token" in response.body.session,false);
  assert.equal(response.body.session.active_mission,null);
  assert.match(response.headers["Set-Cookie"],/^nyoba_public_session=session-\d+;/);
  assert.match(response.headers["Set-Cookie"],/HttpOnly/);
  assert.match(response.headers["Set-Cookie"],/SameSite=Strict/);
});

test("demo endpoint requires the anonymous HttpOnly session cookie", async () => {
  const current = service();
  const created = await routePublicDemoRequest(current, {
    pathname:"/api/public/session", method:"POST", headers:{}, body:{},
  });
  const denied = await routePublicDemoRequest(current, {
    pathname:"/api/public/demo",
    method:"POST",
    headers:{},
    body:{objective:"Audit SEO landing page."},
  });
  assert.equal(denied.status,401);
  assert.equal(denied.body.error_code,"ANONYMOUS_SESSION_REQUIRED");

  const allowed = await routePublicDemoRequest(current, {
    pathname:"/api/public/demo",
    method:"POST",
    headers:{cookie:created.headers["Set-Cookie"].split(";")[0]},
    body:{objective:"Audit SEO landing page."},
  });
  assert.equal(allowed.status,200);
  assert.equal(allowed.body.truth_label,"SYNTHETIC");
  assert.equal(allowed.body.live,false);
});

test("live endpoint never fabricates success when no runner exists", async () => {
  const current = service();
  const created = await routePublicDemoRequest(current, {
    pathname:"/api/public/session", method:"POST", headers:{}, body:{},
  });
  const response = await routePublicDemoRequest(current, {
    pathname:"/api/public/live",
    method:"POST",
    headers:{cookie:created.headers["Set-Cookie"].split(";")[0]},
    body:{objective:"Review this safely."},
  });
  assert.equal(response.status,503);
  assert.equal(response.body.state,"LIVE_UNAVAILABLE");
  assert.equal(response.body.truth_label,"NOT_LIVE");
  assert.equal(response.body.fallback.endpoint,"/api/public/demo");
});

test("known public routes reject unsupported methods and unknown routes fall through", async () => {
  const current = service();
  const wrongMethod = await routePublicDemoRequest(current, {
    pathname:"/api/public/demo", method:"GET", headers:{}, body:null,
  });
  assert.equal(wrongMethod.status,405);
  assert.equal(wrongMethod.body.error_code,"METHOD_NOT_ALLOWED");
  assert.equal(await routePublicDemoRequest(current, {
    pathname:"/api/health", method:"GET", headers:{}, body:null,
  }),null);
});

test("bounded JSON reader rejects oversized and invalid request bodies", async () => {
  const request = (chunks) => ({
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield Buffer.from(chunk);
    },
  });
  const parsed = await readBoundedJsonBody(request(['{"objective":"safe"}']), { max_bytes:64 });
  assert.deepEqual(parsed,{objective:"safe"});
  await assert.rejects(
    () => readBoundedJsonBody(request(['{"objective":"'+ "x".repeat(80) +'"}']), { max_bytes:64 }),
    (error) => error?.status === 413 && error?.code === "REQUEST_BODY_TOO_LARGE",
  );
  await assert.rejects(
    () => readBoundedJsonBody(request(["{invalid"]), { max_bytes:64 }),
    (error) => error?.status === 400 && error?.code === "INVALID_JSON",
  );
});

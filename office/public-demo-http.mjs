export const PUBLIC_DEMO_SESSION_COOKIE = "nyoba_public_session";
export const PUBLIC_DEMO_MAX_BODY_BYTES = 8192;

class PublicDemoHttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function response(status, body, headers = {}) {
  return Object.freeze({ status, body:Object.freeze(body), headers:Object.freeze({ ...headers }) });
}

function methodNotAllowed() {
  return response(405, {
    schema:1,
    ok:false,
    error_code:"METHOD_NOT_ALLOWED",
    message:"Method not allowed.",
  });
}

function cookieValue(headers, name) {
  const raw = String(headers?.cookie ?? "");
  for (const item of raw.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionCookie(token) {
  return `${PUBLIC_DEMO_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800`;
}

export async function readBoundedJsonBody(request, { max_bytes = PUBLIC_DEMO_MAX_BODY_BYTES } = {}) {
  const limit = Number(max_bytes);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("max_bytes must be a positive integer.");
  let size = 0;
  const chunks = [];
  for await (const raw of request) {
    const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    size += chunk.length;
    if (size > limit) {
      throw new PublicDemoHttpError(413, "REQUEST_BODY_TOO_LARGE", "Request body exceeds public demo limit.");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new PublicDemoHttpError(400, "INVALID_JSON", "JSON body must be an object.");
    }
    return value;
  } catch (error) {
    if (error instanceof PublicDemoHttpError) throw error;
    throw new PublicDemoHttpError(400, "INVALID_JSON", "Request body must contain valid JSON.");
  }
}

export async function routePublicDemoRequest(service, request = {}) {
  if (!service || typeof service !== "object") throw new Error("Public demo service is required.");
  const pathname = String(request.pathname ?? "");
  const method = String(request.method ?? "GET").toUpperCase();
  const headers = request.headers || {};
  const body = request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body : {};

  if (pathname === "/api/public/capabilities") {
    if (method !== "GET") return methodNotAllowed();
    return response(200, {
      schema:1,
      api:service.api,
      demo_available:true,
      live_available:service.live_available === true,
      no_login:true,
      anonymous_sessions:true,
      one_active_mission_per_session:true,
      synthetic_truth_label:"SYNTHETIC",
      live_truth_label:"LIVE_RUNTIME",
      limits:service.limits,
    });
  }

  if (pathname === "/api/public/session") {
    if (method !== "POST") return methodNotAllowed();
    const created = service.createSession();
    return response(201, {
      schema:1,
      ok:true,
      live_available:service.live_available === true,
      limits:service.limits,
      session:created.public_session,
    }, { "Set-Cookie":sessionCookie(created.token) });
  }

  if (pathname === "/api/public/demo") {
    if (method !== "POST") return methodNotAllowed();
    const token = cookieValue(headers, PUBLIC_DEMO_SESSION_COOKIE);
    return service.runDemo(token, body);
  }

  if (pathname === "/api/public/live") {
    if (method !== "POST") return methodNotAllowed();
    const token = cookieValue(headers, PUBLIC_DEMO_SESSION_COOKIE);
    return service.runLive(token, body);
  }

  if (pathname.startsWith("/api/public/")) {
    return response(404, {
      schema:1,
      ok:false,
      error_code:"PUBLIC_DEMO_ROUTE_NOT_FOUND",
      message:"Public demo route not found.",
    });
  }

  return null;
}

export function publicDemoHttpErrorResponse(error) {
  if (error instanceof PublicDemoHttpError) {
    return response(error.status, {
      schema:1,
      ok:false,
      error_code:error.code,
      message:error.message,
    });
  }
  return null;
}

/* eslint-disable no-console */
/**
 * HTTP integration test: login as admin, create disabled user, delete via API, confirm gone from list.
 */
const BASE = process.env.PAINT_API_BASE || "http://localhost:3010/paint/api";

async function api(path, opts = {}, cookie = "") {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (opts.body != null && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body != null && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

async function main() {
  const login = await api("/auth/login", {
    method: "POST",
    body: { email: "admin@local.test", password: "admin123" }
  });
  const setCookie = login.res.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";
  if (!login.res.ok || !cookie) {
    console.error("LOGIN FAILED", login.res.status, login.data);
    process.exit(1);
  }

  const email = `api-delete-${Date.now()}@example.com`;
  const create = await api(
    "/admin/users",
    {
      method: "POST",
      body: {
        name: "API Delete Test",
        email,
        password: "testpass123",
        confirmPassword: "testpass123",
        role: "customer",
        status: "disabled"
      }
    },
    cookie
  );
  if (!create.res.ok) {
    console.error("CREATE FAILED", create.res.status, create.data);
    process.exit(1);
  }
  const userId = create.data.user?.id;
  console.log("created user", userId, email);

  const del = await api(`/admin/users/${userId}`, { method: "DELETE" }, cookie);
  console.log("DELETE status", del.res.status, del.data);
  if (!del.res.ok || !del.data?.deleted) {
    process.exit(1);
  }

  const list = await api("/admin/users?q=" + encodeURIComponent(email) + "&status=all", {}, cookie);
  const found = (list.data.users || []).some((u) => Number(u.id) === Number(userId));
  console.log("still in admin list?", found);
  if (found) process.exit(1);

  console.log("API delete flow OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Access-control smoke tests for DELETE routes and user disable flow.
 * Run: node scripts/test-access-control.js
 */
const http = require("http");

const BASE = "127.0.0.1";
const PORT = Number(process.env.PORT || process.env.PAINT_PORT || 3010);

function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: BASE,
        port: PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
          ...(cookie ? { Cookie: cookie } : {})
        }
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text.slice(0, 200) };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(email, password) {
  const res = await request("POST", "/paint/api/auth/login", { email, password });
  if (res.status !== 200) throw new Error(`Login failed ${email}: ${res.status}`);
  const setCookie = res.headers?.["set-cookie"];
  // headers not passed - fix login to return cookie from set-cookie in response
  return res;
}

async function loginWithCookie(email, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password });
    const req = http.request(
      {
        hostname: BASE,
        port: PORT,
        path: "/paint/api/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          const cookie = (res.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
          resolve({ status: res.statusCode, cookie, json: JSON.parse(text || "{}") });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const admin = await loginWithCookie("admin@local.test", "admin123");
  assert(admin.status === 200, "admin login");
  const adminCookie = admin.cookie;

  const disableTarget = await request(
    "POST",
    "/paint/api/admin/users",
    {
      name: "Disable Test",
      email: `disable-test-${Date.now()}@local.test`,
      password: "password123",
      confirmPassword: "password123",
      role: "customer",
      status: "active"
    },
    adminCookie
  );
  assert(disableTarget.status === 201, `create user for disable test: ${disableTarget.status}`);
  const targetId = disableTarget.json.user.id;

  const secondAdmin = await request(
    "POST",
    "/paint/api/admin/users",
    {
      name: "Second Admin",
      email: `second-admin-${Date.now()}@local.test`,
      password: "password123",
      confirmPassword: "password123",
      role: "admin",
      status: "active"
    },
    adminCookie
  );
  assert(secondAdmin.status === 201, `create second admin: ${secondAdmin.status}`);

  const secondLogin = await loginWithCookie(secondAdmin.json.user.email, "password123");
  assert(secondLogin.status === 200, "second admin login");
  const secondCookie = secondLogin.cookie;

  const denyDisable = await request("DELETE", `/paint/api/admin/users/${targetId}`, null, secondCookie);
  assert(denyDisable.status === 200 || denyDisable.status === 403, `secondary admin DELETE user: ${denyDisable.status}`);
  // Any admin may delete (soft-disable) users
  assert(denyDisable.status === 200, `secondary admin can delete user: ${denyDisable.status}`);

  const denyPatchDisable = await request(
    "PATCH",
    `/paint/api/admin/users/${targetId}`,
    { active: false },
    secondCookie
  );
  assert(
    denyPatchDisable.status === 200 || denyPatchDisable.status === 400,
    `secondary admin PATCH disable: ${denyPatchDisable.status}`
  );

  const secondCanCreate = await request(
    "POST",
    "/paint/api/admin/users",
    {
      name: "Created By Second",
      email: `second-created-${Date.now()}@local.test`,
      password: "password123",
      confirmPassword: "password123",
      role: "customer",
      status: "active"
    },
    secondCookie
  );
  assert(secondCanCreate.status === 201, "secondary admin can create users");

  const mePrimary = await request("GET", "/paint/api/auth/me", null, adminCookie);
  assert(mePrimary.json.user.isPrimaryAdmin === true, "primary admin isPrimaryAdmin flag");

  const meSecond = await request("GET", "/paint/api/auth/me", null, secondCookie);
  assert(meSecond.json.user.isPrimaryAdmin !== true, "secondary admin not primary");

  const listActive = await request(
    "GET",
    "/paint/api/admin/users?status=active&limit=100",
    null,
    adminCookie
  );
  assert(listActive.status === 200, "list active users");
  const stillInActive = (listActive.json.users || []).some((u) => u.id === targetId);
  assert(!stillInActive, "disabled user not in active list");

  const listDisabled = await request(
    "GET",
    `/paint/api/admin/users?status=disabled&q=${encodeURIComponent(disableTarget.json.user.email)}`,
    null,
    adminCookie
  );
  assert(listDisabled.status === 200, "list disabled users");
  const inDisabled = (listDisabled.json.users || []).some((u) => u.id === targetId);
  assert(inDisabled, "disabled user visible when filtered");

  const shopDeny = await request("DELETE", "/paint/api/admin/users/1", null, "");
  assert(shopDeny.status === 401, `unauthenticated DELETE -> 401 got ${shopDeny.status}`);

  const shopLogin = await loginWithCookie("admin@local.test", "admin123");
  // Try DELETE as non-admin if we have a customer - create one without session
  const anonDelete = await request("DELETE", "/paint/api/admin/ads/1", null, "");
  assert(anonDelete.status === 401, `anon DELETE admin ads -> 401 got ${anonDelete.status}`);

  const removedShopDelete = await request("DELETE", "/paint/api/shop/products/1", null, shopLogin.cookie);
  assert(
    removedShopDelete.status === 403 || removedShopDelete.status === 404,
    `shop DELETE products blocked/removed: ${removedShopDelete.status}`
  );

  const removeProduct = await request(
    "POST",
    "/paint/api/shop/catalog/remove-product",
    { masterProductId: 999999 },
    shopLogin.cookie
  );
  assert(
    removeProduct.status === 403 || removeProduct.status === 404,
    `shop remove-product without shop role or missing product: ${removeProduct.status}`
  );

  console.log("All access-control checks passed.");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

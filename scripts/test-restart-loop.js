/**
 * POST /api/dev-action/restart N times and verify health after each cycle.
 * Usage: node scripts/test-restart-loop.js [count] [port]
 */
const http = require("http");

const count = Number(process.argv[2]) || 10;
const port = Number(process.argv[3]) || 3010;
const base = `http://127.0.0.1:${port}`;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${base}${path}`,
      {
        method,
        headers: payload
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
          : {}
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch (_) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(oldPid, maxMs = 45000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await request("GET", "/api/dev-action/health");
      if (res.status === 200 && res.body?.ok && res.body.pid && res.body.pid !== oldPid) {
        return res.body;
      }
    } catch (_) {
      /* server down */
    }
    await sleep(500);
  }
  throw new Error(`Health check failed after restart (oldPid=${oldPid})`);
}

async function main() {
  console.log(`Restart loop: ${count} cycles on port ${port}`);
  let lastPid = null;

  for (let i = 1; i <= count; i++) {
    const healthBefore = await request("GET", "/api/dev-action/health");
    if (healthBefore.status !== 200 || !healthBefore.body?.ok) {
      throw new Error(`Server not healthy before cycle ${i}`);
    }
    const oldPid = healthBefore.body.pid;
    lastPid = oldPid;

    const restart = await request("POST", "/api/dev-action/restart", {});
    if (restart.status !== 200 || !restart.body?.ok) {
      throw new Error(`Restart request failed cycle ${i}: ${JSON.stringify(restart.body)}`);
    }

    const healthAfter = await waitForHealth(oldPid);
    console.log(`Cycle ${i}/${count}: ${oldPid} -> ${healthAfter.pid} OK`);
    lastPid = healthAfter.pid;
    await sleep(800);
  }

  console.log(`All ${count} restarts succeeded. Final PID: ${lastPid}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

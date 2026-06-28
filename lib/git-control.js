/**
 * Git Control Center — backend helpers for /api/git/* routes.
 */

const HISTORY_LIMIT = 50;

function createGitControl(root, runGit) {
  function headHash() {
    const r = runGit(["rev-parse", "HEAD"]);
    return r.ok ? r.stdout : "";
  }

  function headShort() {
    const r = runGit(["rev-parse", "--short", "HEAD"]);
    return r.ok ? r.stdout : "";
  }

  function currentBranch() {
    const r = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    return r.ok ? r.stdout : "";
  }

  function isGitConnected() {
    return Boolean(runGit(["rev-parse", "--git-dir"]).ok);
  }

  function parseDecorations(decor) {
    const d = String(decor || "").trim();
    const refs = [];
    const re = /(?:HEAD\s*->\s*)?([^\s,()]+)/g;
    let m;
    while ((m = re.exec(d))) {
      if (m[1] && m[1] !== "HEAD") refs.push(m[1]);
    }
    return refs;
  }

  function classifyCommitStatus(decor, fullHash, head) {
    const refs = parseDecorations(decor);
    const decorStr = String(decor || "");
    if (fullHash === head || decorStr.includes("HEAD")) return "current";
    if (refs.some((r) => r.startsWith("origin/") || r.includes("origin/"))) return "remote";
    if (refs.some((r) => !r.startsWith("tag:"))) return "local";
    return "old";
  }

  function statusLabel(status) {
    if (status === "current") return "🟢 Current";
    if (status === "remote") return "🔵 Remote";
    if (status === "local") return "🟡 Local";
    return "⚪ Old";
  }

  function primaryBranch(decor) {
    const refs = parseDecorations(decor);
    const headRef = refs.find((r) => r.includes("HEAD") || (!r.startsWith("origin/") && !r.startsWith("tag:")));
    const origin = refs.find((r) => r.startsWith("origin/"));
    if (headRef && headRef !== "HEAD") return headRef.replace(/^origin\//, "");
    if (origin) return origin.replace(/^origin\//, "");
    return refs[0] || "—";
  }

  function getHistory() {
    const head = headHash();
    const log = runGit([
      "log",
      "--all",
      `-${HISTORY_LIMIT}`,
      "--decorate=short",
      "--format=%H%x09%h%x09%s%x09%an%x09%cI%x09%d"
    ]);
    if (!log.ok) return { ok: false, error: log.output || "git log failed", commits: [] };

    const commits = log.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [fullHash, hash, message, author, date, decor] = line.split("\t");
        const status = classifyCommitStatus(decor, fullHash, head);
        return {
          hash,
          fullHash,
          message,
          author,
          date,
          branch: primaryBranch(decor),
          status,
          statusLabel: statusLabel(status)
        };
      });

    return { ok: true, commits, head: headShort(), branch: currentBranch() };
  }

  function getStatus() {
    const connected = isGitConnected();
    const branch = connected ? currentBranch() : "";

    return {
      ok: connected,
      gitConnected: connected,
      branch: branch || "—",
      head: connected ? headShort() : ""
    };
  }

  function resolveHash(hash) {
    const r = runGit(["rev-parse", "--verify", String(hash)]);
    return r.ok ? r.stdout : null;
  }

  function getCommitDetail(hash) {
    const full = resolveHash(hash);
    if (!full) return { ok: false, error: "Invalid commit hash" };

    const show = runGit(["show", "--stat", "--format=%H%x09%h%x09%an%x09%cI%x09%s", full]);
    if (!show.ok) return { ok: false, error: show.output || "git show failed" };

    const header = show.stdout.split("\n")[0].split("\t");
    const numstat = runGit(["show", "--numstat", "--format=", full]);
    const files = [];
    let insertions = 0;
    let deletions = 0;

    if (numstat.ok) {
      for (const line of numstat.stdout.split("\n").filter(Boolean)) {
        const [ins, del, file] = line.split("\t");
        if (!file) continue;
        const i = ins === "-" ? 0 : Number(ins) || 0;
        const d = del === "-" ? 0 : Number(del) || 0;
        insertions += i;
        deletions += d;
        files.push({ file, insertions: i, deletions: d });
      }
    }

    return {
      ok: true,
      hash: header[1] || hash,
      fullHash: header[0] || full,
      author: header[2] || "",
      date: header[3] || "",
      message: header[4] || "",
      insertions,
      deletions,
      files,
      output: show.stdout
    };
  }

  function gitAction(args, label) {
    const result = runGit(args);
    return {
      ok: result.ok,
      output: result.output,
      error: result.ok ? null : result.output || `${label} failed`
    };
  }

  return {
    getHistory,
    getStatus,
    getCommitDetail,
    pull: (branch) => {
      const b = branch || currentBranch() || "main";
      return gitAction(["pull", "origin", b], "git pull");
    },
    checkout: (target) => gitAction(["checkout", String(target)], "git checkout"),
    restore: (hash) => {
      const full = resolveHash(hash);
      if (!full) return { ok: false, error: "Invalid commit hash" };
      return gitAction(["checkout", full], "git checkout");
    },
    projectRoot: root.replace(/\\/g, "/")
  };
}

function registerGitControlRoutes(app, root, runGit, devActionForbidden) {
  const git = createGitControl(root, runGit);

  const mountGet = (route, handler) => {
    app.get(route, handler);
    app.get(`/paint${route}`, handler);
  };

  const mountPost = (route, handler) => {
    app.post(route, handler);
    app.post(`/paint${route}`, handler);
  };

  mountGet("/api/git/history", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.getHistory());
  });

  mountGet("/api/git/status", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.getStatus());
  });

  mountGet("/api/git/commit/:hash", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.getCommitDetail(req.params.hash));
  });

  mountPost("/api/git/pull", (req, res) => {
    if (devActionForbidden(req, res)) return;
    const result = git.pull(req.body?.branch);
    res.json({ ...result, message: result.ok ? "Pull completed." : undefined });
  });

  mountPost("/api/git/checkout", (req, res) => {
    if (devActionForbidden(req, res)) return;
    const target = req.body?.branch || req.body?.hash || req.body?.target;
    if (!target) return res.status(400).json({ ok: false, error: "branch or hash required" });
    res.json(git.checkout(target));
  });

  mountPost("/api/git/restore", (req, res) => {
    if (devActionForbidden(req, res)) return;
    const hash = req.body?.hash;
    if (!hash) return res.status(400).json({ ok: false, error: "hash required" });
    res.json(git.restore(hash));
  });

  return git;
}

module.exports = { createGitControl, registerGitControlRoutes };

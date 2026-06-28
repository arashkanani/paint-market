/**
 * Git Control Center — backend helpers for /api/git/* routes.
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const HISTORY_LIMIT = 50;
const DIFF_PREVIEW_MAX = 12000;

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

  function remoteUrl() {
    const r = runGit(["config", "--get", "remote.origin.url"]);
    return r.ok ? r.stdout : "";
  }

  function trackingBranch() {
    const r = runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
    if (!r.ok) return null;
    return r.stdout;
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
    const headRef = refs.find((r) => r.includes("HEAD") || !r.startsWith("origin/") && !r.startsWith("tag:"));
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
          decorations: parseDecorations(decor),
          status,
          statusLabel: statusLabel(status)
        };
      });

    return { ok: true, commits, head: headShort(), branch: currentBranch() };
  }

  function parsePorcelain(porcelain) {
    const modified = [];
    const untracked = [];
    const staged = [];
    const conflicts = [];

    for (const line of String(porcelain || "").split("\n").filter(Boolean)) {
      const code = line.slice(0, 2);
      const file = line.slice(3).trim();
      if (code.includes("U") || code === "AA" || code === "DD") conflicts.push(file);
      if (code[0] !== " " && code[0] !== "?") staged.push(file);
      if (code[1] === "M" || code[1] === "D") modified.push(file);
      if (code === "??") untracked.push(file);
    }

    return { modified, untracked, staged, conflicts };
  }

  function getStatus() {
    const branch = currentBranch();
    const porcelain = runGit(["status", "--porcelain"]);
    const parsed = parsePorcelain(porcelain.ok ? porcelain.stdout : "");
    const track = trackingBranch();

    let ahead = 0;
    let behind = 0;
    if (track) {
      const ab = runGit(["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
      if (ab.ok) {
        const parts = ab.stdout.split(/\s+/);
        ahead = Number(parts[0]) || 0;
        behind = Number(parts[1]) || 0;
      }
    }

    return {
      ok: true,
      branch,
      trackingBranch: track,
      ahead,
      behind,
      remoteUrl: remoteUrl(),
      head: headShort(),
      modifiedFiles: parsed.modified,
      untrackedFiles: parsed.untracked,
      stagedFiles: parsed.staged,
      conflicts: parsed.conflicts,
      isClean: !porcelain.stdout
    };
  }

  function parseBranchLine(line, current) {
    const trimmed = line.trim();
    const isCurrent = trimmed.startsWith("*");
    const name = trimmed.replace(/^\*\s+/, "");
    const parts = name.split(/\s+/);
    const branchName = parts[0];
    const tracking = name.includes("[") ? name.match(/\[([^\]]+)\]/)?.[1] || null : null;
    return {
      name: branchName,
      current: isCurrent || branchName === current,
      tracking,
      raw: line
    };
  }

  function getBranches() {
    const current = currentBranch();
    const local = runGit(["branch", "-vv"]);
    const remote = runGit(["branch", "-r"]);
    const locals = local.ok
      ? local.stdout.split("\n").filter(Boolean).map((l) => parseBranchLine(l, current))
      : [];
    const remotes = remote.ok
      ? remote.stdout
          .split("\n")
          .filter(Boolean)
          .map((l) => l.trim())
          .filter((l) => !l.includes("HEAD ->"))
          .map((l) => ({ name: l.replace(/^\*\s+/, ""), remote: true }))
      : [];

    return { ok: true, current, branches: locals, remoteBranches: remotes };
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

    const lines = show.stdout.split("\n");
    const header = lines[0].split("\t");
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

  function getDiff(from, to) {
    const fromFull = resolveHash(from);
    const toFull = resolveHash(to);
    if (!fromFull || !toFull) return { ok: false, error: "Invalid commit hash" };

    const stat = runGit(["diff", "--stat", `${fromFull}..${toFull}`]);
    const numstat = runGit(["diff", "--numstat", `${fromFull}..${toFull}`]);
    const diff = runGit(["diff", `${fromFull}..${toFull}`]);

    const added = [];
    const removed = [];
    const modified = [];
    let linesAdded = 0;
    let linesDeleted = 0;

    if (numstat.ok) {
      for (const line of numstat.stdout.split("\n").filter(Boolean)) {
        const [ins, del, file] = line.split("\t");
        if (!file) continue;
        const i = ins === "-" ? 0 : Number(ins) || 0;
        const d = del === "-" ? 0 : Number(del) || 0;
        linesAdded += i;
        linesDeleted += d;
        if (i > 0 && d === 0) added.push(file);
        else if (d > 0 && i === 0) removed.push(file);
        else modified.push(file);
      }
    }

    let preview = diff.ok ? diff.stdout : "";
    if (preview.length > DIFF_PREVIEW_MAX) {
      preview = preview.slice(0, DIFF_PREVIEW_MAX) + "\n\n… (diff truncated)";
    }

    return {
      ok: true,
      from: fromFull,
      to: toFull,
      filesAdded: added,
      filesRemoved: removed,
      filesModified: modified,
      linesAdded,
      linesDeleted,
      stat: stat.ok ? stat.stdout : "",
      preview
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
    getBranches,
    getCommitDetail,
    getDiff,
    fetch: () => gitAction(["fetch", "--all"], "git fetch"),
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
    stash: (message) => {
      const args = message ? ["stash", "push", "-m", String(message)] : ["stash", "push"];
      return gitAction(args, "git stash");
    },
    stashApply: (index) => {
      const args = index != null && index !== "" ? ["stash", "apply", `stash@{${index}}`] : ["stash", "apply"];
      return gitAction(args, "git stash apply");
    },
    createBranch: (name, from) => {
      const branch = String(name || "").trim();
      if (!branch) return { ok: false, error: "Branch name required" };
      const args = from ? ["checkout", "-b", branch, String(from)] : ["checkout", "-b", branch];
      return gitAction(args, "git create branch");
    },
    deleteBranch: (name, force) => {
      const branch = String(name || "").trim();
      if (!branch) return { ok: false, error: "Branch name required" };
      if (branch === currentBranch()) return { ok: false, error: "Cannot delete current branch" };
      const flag = force ? "-D" : "-d";
      return gitAction(["branch", flag, branch], "git delete branch");
    },
    renameBranch: (oldName, newName) => {
      const o = String(oldName || "").trim();
      const n = String(newName || "").trim();
      if (!o || !n) return { ok: false, error: "Old and new branch names required" };
      return gitAction(["branch", "-m", o, n], "git rename branch");
    },
    merge: (branch) => {
      const b = String(branch || "").trim();
      if (!b) return { ok: false, error: "Branch name required" };
      return gitAction(["merge", b], "git merge");
    },
    openRepositoryFolder: () => {
      try {
        if (process.platform === "win32") {
          spawn("explorer.exe", [root], { detached: true, stdio: "ignore" }).unref();
        } else if (process.platform === "darwin") {
          spawn("open", [root], { detached: true, stdio: "ignore" }).unref();
        } else {
          spawn("xdg-open", [root], { detached: true, stdio: "ignore" }).unref();
        }
        return { ok: true, path: root.replace(/\\/g, "/"), output: `Opened ${root}` };
      } catch (e) {
        return { ok: false, error: e.message, path: root.replace(/\\/g, "/") };
      }
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

  mountGet("/api/git/branches", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.getBranches());
  });

  mountGet("/api/git/commit/:hash", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.getCommitDetail(req.params.hash));
  });

  mountGet("/api/git/diff/:from/:to", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.getDiff(req.params.from, req.params.to));
  });

  mountPost("/api/git/pull", (req, res) => {
    if (devActionForbidden(req, res)) return;
    const result = git.pull(req.body?.branch);
    res.json({ ...result, message: result.ok ? "Pull completed." : undefined });
  });

  mountPost("/api/git/fetch", (req, res) => {
    if (devActionForbidden(req, res)) return;
    const result = git.fetch();
    res.json({ ...result, message: result.ok ? "Fetch completed." : undefined });
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

  mountPost("/api/git/stash", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.stash(req.body?.message));
  });

  mountPost("/api/git/stash/apply", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.stashApply(req.body?.index));
  });

  mountPost("/api/git/create-branch", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.createBranch(req.body?.name, req.body?.from));
  });

  mountPost("/api/git/delete-branch", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.deleteBranch(req.body?.name, Boolean(req.body?.force)));
  });

  mountPost("/api/git/rename-branch", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.renameBranch(req.body?.oldName, req.body?.newName));
  });

  mountPost("/api/git/merge", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.merge(req.body?.branch));
  });

  mountPost("/api/git/open-folder", (req, res) => {
    if (devActionForbidden(req, res)) return;
    res.json(git.openRepositoryFolder());
  });

  return git;
}

module.exports = { createGitControl, registerGitControlRoutes };

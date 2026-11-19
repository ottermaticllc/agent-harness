#!/usr/bin/env python3
"""sessions.py: list live Claude Code and Codex sessions on this computer; end one on request.

Read-only unless called with --end-session or --end-codex.

Source of truth for Claude Code: ~/.claude/sessions/<PID>.json, which each running Claude Code
process writes about itself (an undocumented internal file; its shape may change). A file only
counts when its PID is alive AND its recorded process start time matches, so a reused PID is never
mistaken for a session. The session's transcript adds last message, context and cache figures.

Usage:
  sessions.py                              # plain-text table
  sessions.py --json                       # Claude sessions as JSON
  sessions.py --panel                      # everything the /sessions pane draws, as JSON
  sessions.py --end-session PID SESSION_ID # SIGTERM an idle Claude session, after re-checking it
  sessions.py --end-codex PID STARTED      # SIGTERM an idle Codex process tree, after re-checking it
  sessions.py --selftest
"""
import glob, json, os, re, signal, subprocess, sys, time
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
SESSIONS_DIR = f"{HOME}/.claude/sessions"
PROJECTS_DIR = f"{HOME}/.claude/projects"
TAIL_BYTES = 3_000_000  # enough for the last few turns of a big transcript
FULL_READ_LIMIT = 60_000_000  # never read more than this to find an old typed message
SUBAGENT_ACTIVE_SECONDS = 120  # a subagent counts as running if its transcript changed in the last 2 minutes
SUBAGENT_LIST_SECONDS = 3600  # the details list also shows subagents that finished within the hour
CODEX_BUSY_CPU = 5  # with no turn record, CPU is Codex's only busy signal

LOCATIONS = {"claude-desktop": "Desktop app", "claude-vscode": "VS Code", "cli": "Terminal"}

# Values after these flags or keys are hidden before a command line is shown or summarized.
SECRET = re.compile(r"((?:--?|\b)[\w.-]*(?:key|token|secret|password|passwd|auth)[\w.-]*[= ])\S+", re.I)


def redact(command):
    return SECRET.sub(r"\1***", command)


def run(argv):
    try:
        return subprocess.run(argv, capture_output=True, text=True, env={**os.environ, "TZ": "UTC", "LC_ALL": "C"})
    except FileNotFoundError:  # lsof, sysctl or memory_pressure missing on this system
        return subprocess.CompletedProcess(argv, 127, "", "")


def process_table():
    """pid -> {ppid, cpu, rss_kb, lstart, command} for every process (TZ=UTC: session files record procStart in UTC)."""
    r = run(["ps", "-A", "-o", "pid=,ppid=,%cpu=,rss=,lstart=,command="])
    if r.returncode != 0:
        sys.exit(f"sessions.py: ps failed: {r.stderr.strip()}")
    procs = {}
    for line in r.stdout.splitlines():
        p = line.split(None, 9)  # lstart is 5 words: "Thu Oct 29 05:00:32 2026"
        if len(p) < 10:
            continue
        procs[int(p[0])] = {"ppid": int(p[1]), "cpu": float(p[2]), "rss_kb": int(p[3]),
                            "lstart": " ".join(p[4:9]), "command": p[9]}
    pid = None
    for line in run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]).stdout.splitlines():
        if line.startswith("p"):
            pid = int(line[1:])
        elif line.startswith("n") and pid in procs:
            ports = procs[pid].setdefault("ports", [])
            port = line.rsplit(":", 1)[-1]
            if port not in ports:
                ports.append(port)
    return procs


def descendants(pid, procs):
    kids = {}
    for cpid, p in procs.items():
        kids.setdefault(p["ppid"], []).append(cpid)
    found, stack = [], list(kids.get(pid, []))
    while stack:
        c = stack.pop()
        found.append(c)
        stack.extend(kids.get(c, []))
    return found


def ancestors(procs):
    """This script's own process chain: the session that asked is in it and must never be signalled."""
    chain, pid = set(), os.getpid()
    while pid in procs and pid not in chain and pid > 1:
        chain.add(pid)
        pid = procs[pid]["ppid"]
    return chain


def child_kind(command):
    c = command.lower()
    words = c.split()
    if words and words[0].rsplit("/", 1)[-1] in ("zsh", "bash", "sh", "fish"):
        return "script"  # shell commands the session started (checked first: their text can mention anything)
    if "mcp" in c or "npm exec" in c or "uvx" in c:
        return "helper"  # MCP servers and similar tool servers
    return "other"


def location(entrypoint, pid, procs):
    loc = LOCATIONS.get(entrypoint, entrypoint or "unknown")
    if entrypoint == "cli":  # a terminal session: say which app hosts the terminal
        p = procs.get(pid)
        for _ in range(12):
            if not p:
                break
            cmd = p["command"]
            for needle, label in (("Visual Studio Code", "in VS Code"), ("Code Helper", "in VS Code"), ("Cursor", "in Cursor"),
                                  ("iTerm", "iTerm"), ("Terminal.app", "Terminal app"), ("Claude.app", "in Claude app")):
                if needle in cmd:
                    return f"Terminal ({label})"
            p = procs.get(p["ppid"])
    return loc


def started_epoch(lstart):
    """ps lstart (UTC, 'Thu Oct 29 05:00:32 2026') -> epoch seconds."""
    try:
        return datetime.strptime(lstart, "%a %b %d %H:%M:%S %Y").replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def proc_row(pid, procs):
    p = procs[pid]
    return {"pid": pid, "ppid": p["ppid"], "kind": child_kind(p["command"]), "cpu_percent": p["cpu"],
            "memory_mb": round(p["rss_kb"] / 1024, 1), "started": started_epoch(p["lstart"]),
            "command": redact(p["command"])[:300], "ports": p.get("ports", [])}


def system_memory():
    """Free memory and swap in use: the honest 'this computer is out of memory' signals."""
    out = {}
    if os.path.exists("/proc/meminfo"):  # Linux
        info = {}
        for line in open("/proc/meminfo"):
            k, v = line.split(":", 1)
            info[k] = int(v.split()[0]) // 1024  # kB -> MB
        if info.get("MemTotal"):
            out["memory_total_mb"] = info["MemTotal"]
            out["memory_free_percent"] = round(100 * info.get("MemAvailable", 0) / info["MemTotal"])
        if "SwapTotal" in info:
            out["swap_total_mb"], out["swap_used_mb"] = info["SwapTotal"], info["SwapTotal"] - info.get("SwapFree", 0)
        return out
    m = re.search(r"total = ([\d.]+)M\s+used = ([\d.]+)M", run(["sysctl", "-n", "vm.swapusage"]).stdout)  # macOS
    if m:
        out["swap_total_mb"], out["swap_used_mb"] = round(float(m.group(1))), round(float(m.group(2)))
    total = run(["sysctl", "-n", "hw.memsize"]).stdout.strip()
    if total.isdigit():
        out["memory_total_mb"] = int(total) // 1048576
    m = re.search(r"free percentage: (\d+)%", run(["memory_pressure", "-Q"]).stdout)
    if m:
        out["memory_free_percent"] = int(m.group(1))
    return out


def leftovers(procs, owned):
    """Helper programs (MCP servers and similar) whose parent is gone: re-parented to PID 1 and not inside any
    live Claude or Codex process tree. Shown only; the panel never ends them, since it cannot prove who started them."""
    return sorted((proc_row(pid, procs) for pid, p in procs.items()
                   if p["ppid"] == 1 and pid not in owned and child_kind(p["command"]) == "helper"),
                  key=lambda c: c["memory_mb"], reverse=True)


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


# ---- Codex ----

def codex_rollout(pid):
    """The session file a running Codex process holds open, if any."""
    for line in run(["lsof", "-p", str(pid), "-Fn"]).stdout.splitlines():
        if line.startswith("n") and "/.codex/sessions/" in line and line.endswith(".jsonl"):
            return line[1:]
    return None


def read_codex_rollout(path):
    info = {}
    with open(path, errors="replace") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            p, t = rec.get("payload") or {}, rec.get("type")
            if rec.get("timestamp"):
                info["last_activity"] = max(info.get("last_activity", 0), ts(rec["timestamp"]))
            if t == "session_meta":
                info.setdefault("session_id", p.get("id"))
                info.setdefault("cwd", p.get("cwd"))
            elif t == "turn_context":
                info["model"] = p.get("model")
            elif t == "event_msg" and p.get("type") in ("task_started", "task_complete", "turn_aborted"):
                info["status"] = "busy" if p["type"] == "task_started" else "idle"
            elif t == "event_msg" and p.get("type") == "token_count" and p.get("info"):
                usage, total = p["info"].get("last_token_usage") or {}, p["info"].get("total_token_usage") or {}
                info["context_tokens"] = usage.get("input_tokens")
                info["context_window"] = p["info"].get("model_context_window")
                info["tokens_used"] = total.get("total_tokens")
            elif (t == "event_msg" and p.get("type") == "user_message" and p.get("message")) or (
                    t == "response_item" and p.get("type") == "message" and p.get("role") == "user"):
                text = p.get("message") or "\n".join(b.get("text", "") for b in p.get("content") or [] if isinstance(b, dict))
                if not text.strip() or text.lstrip().startswith("<"):
                    continue  # environment and instruction blocks, not something a person typed
                info["last_message"] = " ".join(text.split())[:120]
                info["last_message_full"] = text[:50_000]
                info["last_message_at"] = ts(rec["timestamp"]) if rec.get("timestamp") else None
    return info


def is_codex_command(command):
    """The Codex program itself (its node launcher or native binary), not a command that mentions it."""
    words = command.split()
    exe = words[0].rsplit("/", 1)[-1] if words else ""
    return exe == "codex" or (exe == "node" and len(words) > 1 and "@openai/codex" in words[1])


CODEX_ORIGINS = [("Visual Studio Code", "VS Code"), ("Cursor.app", "Cursor"), ("Codex.app", "Codex app"),
                 ("/Claude.app/", "Claude app"), ("/claude ", "Claude Code"), ("Terminal.app", "Terminal"),
                 ("iTerm", "iTerm"), ("tmux", "tmux")]


def codex_origin(pid, procs):
    """Which app started this Codex: the nearest ancestor whose command names a known app."""
    seen = set()
    while pid in procs and pid not in seen and pid > 1:
        seen.add(pid)
        pid = procs[pid]["ppid"]
        cmd = procs.get(pid, {}).get("command", "") + " "
        hit = next((label for needle, label in CODEX_ORIGINS if needle in cmd), None)
        if hit:
            return hit
    return "unknown"


def find_codex(procs):
    """Live Codex sessions: the outermost process of each Codex process tree."""
    is_codex = {pid for pid, p in procs.items() if is_codex_command(p["command"])}
    found = []
    for pid in is_codex:
        if procs[pid]["ppid"] in is_codex:
            continue
        kids = descendants(pid, procs)
        p = procs[pid]
        origin = codex_origin(pid, procs)
        background = " app-serve" in p["command"] + " "  # an editor extension's always-on server, not a chat
        cpu = round(p["cpu"] + sum(procs[k]["cpu"] for k in kids), 1)
        row = {"pid": pid, "name": f"Codex ({origin} extension, no chat open)" if background else f"Codex ({origin})",
               "location": f"Codex · {origin}", "origin": origin, "background": background,
               "status": "busy" if cpu >= CODEX_BUSY_CPU else "idle",
               "started_at": started_epoch(p["lstart"]), "cpu_percent": cpu,
               "memory_mb": round((p["rss_kb"] + sum(procs[k]["rss_kb"] for k in kids)) / 1024),
               "children": sorted((proc_row(k, procs) for k in kids), key=lambda c: c["cpu_percent"], reverse=True)}
        rollout = next((r for r in map(codex_rollout, [pid] + kids) if r), None)
        if rollout:
            try:
                row.update(read_codex_rollout(rollout))
            except OSError as err:
                row["error"] = str(err)
        if row.get("last_message"):
            row["name"] = f"Codex ({origin}): " + row["last_message"][:60]
        found.append(row)
    return found, {k for pid in is_codex for k in [pid] + descendants(pid, procs)}


# ---- Claude Code ----

def user_text(rec):
    """The words a person typed in a user record, or None for tool results and system rows."""
    content = rec.get("message", {}).get("content")
    if isinstance(content, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
            return None
        content = " ".join(b.get("text", "") for b in content if isinstance(b, dict))
    if not isinstance(content, str):
        return None
    text = " ".join(content.split())
    if "<command-name>" in text:  # a slash command: show it the way it was typed
        name = text.split("<command-name>", 1)[1].split("<", 1)[0]
        args = text.split("<command-args>", 1)[1].split("<", 1)[0] if "<command-args>" in text else ""
        return f"{name} {args}".strip()
    if text.startswith("<pasted_content"):
        return "(pasted text) " + text.split(">", 1)[-1][:80]
    if not text or text.startswith("<") or rec.get("isMeta"):
        return None
    return text


def full_text(rec, fallback):
    """The whole typed message with its line breaks (for copying); fallback for slash commands."""
    content = rec.get("message", {}).get("content")
    if isinstance(content, list):
        content = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    if not isinstance(content, str) or "<command-name>" in content:
        return fallback
    return re.sub(r"</?pasted_content[^>]*>", "", content).strip()[:50_000]


def tool_group(name):
    """mcp__acme-docs__search -> 'acme-docs (MCP)'; built-in tools keep their name."""
    parts = name.split("__")
    return f"{parts[1]} (MCP)" if name.startswith("mcp__") and len(parts) > 2 else name


def first_prompt(path):
    """What a subagent was asked to do: its first user message, trimmed."""
    try:
        with open(path, errors="replace") as f:
            for line in f:
                rec = json.loads(line)
                if rec.get("type") == "user":
                    c = rec.get("message", {}).get("content")
                    if isinstance(c, list):
                        c = " ".join(b.get("text", "") for b in c if isinstance(b, dict))
                    return " ".join(str(c or "").split())[:600]
    except (OSError, ValueError):
        pass
    return ""


def subagent_details(path, touched, now):
    """One subagent: task, type and model (from its .meta.json) and token use (from its transcript).
    Subagents run inside the session's own process, so they have no CPU figure of their own."""
    meta = {}
    try:
        with open(path[:-len(".jsonl")] + ".meta.json") as f:
            meta = json.load(f)
    except (OSError, ValueError):
        pass
    started = last_ctx = None
    model, total, tools = meta.get("model"), 0, 0
    with open(path, errors="replace") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if rec.get("timestamp") and started is None:
                started = ts(rec["timestamp"])
            if rec.get("type") != "assistant":
                continue
            msg = rec.get("message", {})
            model = msg.get("model") or model
            tools += sum(1 for b in msg.get("content") or [] if isinstance(b, dict) and b.get("type") == "tool_use")
            u = msg.get("usage") or {}
            ctx = u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
            if ctx:
                last_ctx = ctx
            total += ctx + u.get("output_tokens", 0)
    prompt = first_prompt(path)
    return {"id": os.path.basename(path)[:-6], "task": meta.get("description") or prompt[:120],
            "prompt": prompt, "type": meta.get("agentType"), "model": model,
            "started": started, "last_active": touched,
            "running": not meta.get("finished") and now - touched < SUBAGENT_ACTIVE_SECONDS,
            "context_tokens": last_ctx, "tokens_used": total, "tool_calls": tools}


def read_transcript(session_id, tail_bytes=TAIL_BYTES):
    paths = glob.glob(f"{PROJECTS_DIR}/*/{glob.escape(session_id)}.jsonl")
    if not paths:
        return {}
    path = paths[0]
    info = {}
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        f.seek(max(0, size - tail_bytes))
        lines = f.read().decode("utf-8", "replace").splitlines()
    ttl = None
    tool_names, by_tool = {}, {}  # tool_use id -> tool group; tool group -> [calls, chars of output]
    for line in lines:
        try:
            rec = json.loads(line)
        except ValueError:
            continue
        if rec.get("timestamp"):
            info["last_activity"] = max(info.get("last_activity", 0), ts(rec["timestamp"]))
        if rec.get("subtype") == "compact_boundary":
            by_tool = {}  # compaction cleared older tool output from the context
        content = rec.get("message", {}).get("content")
        if isinstance(content, list) and not rec.get("isSidechain"):
            for b in content:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_use":
                    tool_names[b.get("id")] = tool_group(b.get("name", "?"))
                elif b.get("type") == "tool_result":
                    out = b.get("content")
                    chars = len(out) if isinstance(out, str) else sum(len(x.get("text", "")) for x in out or [] if isinstance(x, dict))
                    g = by_tool.setdefault(tool_names.get(b.get("tool_use_id"), "other"), [0, 0])
                    g[0] += 1
                    g[1] += chars
        if rec.get("type") == "user" and not rec.get("isSidechain"):
            t = user_text(rec)
            if t:
                info["last_message"] = t[:120]
                info["last_message_full"] = full_text(rec, t)
                info["last_message_at"] = ts(rec["timestamp"]) if rec.get("timestamp") else None
        usage = rec.get("message", {}).get("usage") if rec.get("type") == "assistant" else None
        if usage and not rec.get("isSidechain"):
            cc = usage.get("cache_creation") or {}
            if cc.get("ephemeral_1h_input_tokens"):
                ttl = 3600
            elif cc.get("ephemeral_5m_input_tokens"):
                ttl = 300
            if usage.get("cache_read_input_tokens") or usage.get("cache_creation_input_tokens"):
                info["last_cache_use"] = ts(rec["timestamp"])  # only requests that touched the cache refresh it
            info["context_tokens"] = (usage.get("input_tokens", 0) + usage.get("cache_read_input_tokens", 0)
                                      + usage.get("cache_creation_input_tokens", 0))
            info["model"] = rec["message"].get("model")
    # estimate: ~4 characters per token, from the part of the conversation read
    info["context_by_tool"] = sorted(({"tool": g, "calls": c, "tokens": n // 4} for g, (c, n) in by_tool.items()),
                                     key=lambda t: t["tokens"], reverse=True)
    if ttl and info.get("last_cache_use"):
        # estimate: the cache lifetime comes from the transcript's own usage records; the exact refresh time isn't there
        info["cache_expires_at"] = info["last_cache_use"] + ttl
    if "last_message" not in info and tail_bytes < size <= FULL_READ_LIMIT:
        return read_transcript(session_id, size)  # the typed message is older than the tail: read it all
    now = time.time()
    subs = []
    for sub in glob.glob(f"{path[:-len('.jsonl')]}/subagents/*.jsonl"):
        try:
            touched = os.path.getmtime(sub)
            if now - touched < SUBAGENT_LIST_SECONDS:
                subs.append(subagent_details(sub, touched, now))
        except (OSError, ValueError):
            continue  # finished and removed, or half-written, between listing and reading
    info["subagents"] = sorted(subs, key=lambda a: a["last_active"], reverse=True)
    info["subagents_running"] = sum(1 for a in subs if a["running"])
    return info


def describe(d, pid, p, procs):
    kids = descendants(pid, procs)
    s = {"pid": pid, "name": d.get("name") or "(untitled)", "location": location(d.get("entrypoint"), pid, procs),
         "status": d.get("status"), "session_id": d.get("sessionId"), "cwd": d.get("cwd"),
         "started_at": d["startedAt"] / 1000 if d.get("startedAt") else None,
         "cpu_percent": round(p["cpu"] + sum(procs[k]["cpu"] for k in kids), 1),
         "memory_mb": round((p["rss_kb"] + sum(procs[k]["rss_kb"] for k in kids)) / 1024),
         "children": sorted((proc_row(k, procs) for k in kids), key=lambda c: c["cpu_percent"], reverse=True)}
    s.update(read_transcript(s["session_id"]) if s["session_id"] else {})
    return s


def find_sessions(procs, only_pid=None):
    sessions = []
    for f in glob.glob(f"{SESSIONS_DIR}/*.json"):
        try:
            with open(f) as fh:
                d = json.load(fh)
        except (OSError, ValueError):
            continue
        pid = d.get("pid")
        if only_pid and pid != only_pid:
            continue
        p = procs.get(pid) if isinstance(pid, int) else None
        # alive AND provably the same process that wrote the file (PIDs get reused)
        if not p or not d.get("procStart") or d["procStart"] != p["lstart"]:
            continue
        try:
            sessions.append(describe(d, pid, p, procs))
        except Exception as err:  # one odd session must not hide the others
            sessions.append({"pid": pid, "name": d.get("name") or "(untitled)", "status": d.get("status"),
                             "session_id": d.get("sessionId"), "error": str(err), "children": [],
                             "cpu_percent": p["cpu"], "memory_mb": round(p["rss_kb"] / 1024),
                             "location": LOCATIONS.get(d.get("entrypoint"), "unknown")})
    sessions.sort(key=lambda s: s.get("last_activity") or 0, reverse=True)
    return sessions


def panel():
    """Everything the /sessions pane draws, from one ps snapshot."""
    procs = process_table()
    sessions = find_sessions(procs)
    codex, codex_pids = find_codex(procs)
    owned = codex_pids | {k for s in sessions for k in [s["pid"]] + [c["pid"] for c in s["children"]]}
    return {"generated_at": time.time(), "sessions": sessions, "codex": codex,
            "leftovers": leftovers(procs, owned), "system": system_memory()}


# ---- Ending ----

def log(line):
    """One line per signal sent, in the plugin's data folder when the mod passes it."""
    folder = os.environ.get("CLAUDE_PLUGIN_DATA")
    if folder:
        try:
            with open(os.path.join(folder, "end.log"), "a") as f:
                f.write(f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {line}\n")
        except OSError:
            pass


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def terminate(pids, wait=5.0):
    """SIGTERM only (never SIGKILL); True once the first pid has exited."""
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
    deadline = time.time() + wait
    while alive(pids[0]) and time.time() < deadline:
        time.sleep(0.25)
    return not alive(pids[0])


def end_session(pid, expect_id):
    """Ends one Claude Code session, only if it is still that same session, idle, and not this script's own."""
    procs = process_table()
    if pid in ancestors(procs):
        return {"result": "refused_self"}
    found = find_sessions(procs, only_pid=pid)
    if not found or not found[0].get("session_id"):
        return {"result": "identity_unknown"}
    s = found[0]
    if s["session_id"] != expect_id:
        return {"result": "identity_mismatch"}
    if s.get("status") != "idle":
        return {"result": "busy"}
    log(f"SIGTERM claude pid={pid} session={expect_id}")
    if not terminate([pid]):
        return {"result": "still_running"}
    time.sleep(1)
    return {"result": "ended", "survivors": [c["pid"] for c in s["children"] if alive(c["pid"])]}


def end_codex(pid, started):
    """Ends one Codex process tree root and its direct children, only if it is still that same idle Codex root."""
    procs = process_table()
    if pid in ancestors(procs):
        return {"result": "refused_self"}
    row = next((c for c in find_codex(procs)[0] if c["pid"] == pid), None)
    if not row or row.get("started_at") is None or int(row["started_at"]) != started:
        return {"result": "identity_unknown"}
    if row["status"] != "idle":
        return {"result": "busy"}
    kids = [k for k, p in procs.items() if p["ppid"] == pid]
    log(f"SIGTERM codex pid={pid} children={kids}")
    return {"result": "ended" if terminate([pid] + kids) else "still_running"}


# ---- Plain-text table ----

def ago(seconds):
    seconds = int(seconds)
    if seconds < 90:
        return f"{seconds}s"
    if seconds < 5400:
        return f"{seconds // 60}m"
    if seconds < 172800:
        return f"{seconds // 3600}h{(seconds % 3600) // 60:02d}m"
    return f"{seconds // 86400}d"


def print_table(sessions):
    now = time.time()
    if not sessions:
        print("No live Claude Code sessions.")
        return
    for i, s in enumerate(sessions, 1):
        cache = "-"
        if s.get("cache_expires_at"):
            left = s["cache_expires_at"] - now
            cache = f"{ago(left)} left" if left > 0 else "expired"
        ctx = f"{s['context_tokens'] // 1000}k tokens" if s.get("context_tokens") else "-"
        last = s.get("last_activity")
        print(f"[{i}] {s['name']}")
        print(f"    {s['location']} | {s['status']} | PID {s['pid']} | last active {ago(now - last) + ' ago' if last else '-'}")
        print(f"    CPU {s['cpu_percent']}% | memory {s['memory_mb']} MB | context {ctx} | cache {cache}"
              f" | subagents running {s.get('subagents_running', 0)}")
        print(f"    Last message: {s.get('last_message', '(none found)')}")
        print()


def _selftest():
    assert ago(30) == "30s" and ago(600) == "10m" and ago(7200) == "2h00m"
    assert user_text({"message": {"content": [{"type": "tool_result"}]}}) is None
    assert user_text({"message": {"content": "  hi\n there "}}) == "hi there"
    assert user_text({"message": {"content": "<command-name>/x</command-name><command-args>a b</command-args>"}}) == "/x a b"
    assert full_text({"message": {"content": "<pasted_content id=\"x\">a\nb</pasted_content>"}}, "") == "a\nb"
    assert is_codex_command("/x/node /y/@openai/codex/bin/codex.js exec hi") and not is_codex_command("/bin/zsh -c codex exec")
    fake = {10: {"ppid": 1, "command": "/Applications/Visual Studio Code.app/Contents/MacOS/Code"},
            11: {"ppid": 10, "command": "Code Helper (Plugin)"}, 12: {"ppid": 11, "command": "/x/codex app-serve"}}
    assert codex_origin(12, fake) == "VS Code" and codex_origin(10, fake) == "unknown"
    assert tool_group("mcp__acme-docs__search") == "acme-docs (MCP)" and tool_group("Bash") == "Bash"
    assert started_epoch("Thu Oct 29 05:00:32 2026") == 1793250032
    assert child_kind("/bin/zsh -c ls") == "script" and child_kind("/bin/zsh -c echo mcp") == "script"
    assert child_kind("npm exec @acme/mcp-server") == "helper" and child_kind("/usr/bin/vim") == "other"
    assert redact("node srv.js --api-key=abc123 --port 3000") == "node srv.js --api-key=*** --port 3000"
    assert redact("x GITHUB_TOKEN=ghp_x --auth-token zzz") == "x GITHUB_TOKEN=*** --auth-token ***"
    assert descendants(10, fake) and sorted(descendants(10, fake)) == [11, 12]
    print("selftest ok")


if __name__ == "__main__":
    args = sys.argv[1:]
    try:
        if args[:1] == ["--selftest"]:
            _selftest()
        elif args[:1] == ["--panel"]:
            print(json.dumps(panel()))
        elif args[:1] == ["--json"]:
            print(json.dumps(find_sessions(process_table())))
        elif args[:1] == ["--end-session"] and len(args) == 3 and args[1].isdigit():
            print(json.dumps(end_session(int(args[1]), args[2])))
        elif args[:1] == ["--end-codex"] and len(args) == 3 and args[1].isdigit() and args[2].isdigit():
            print(json.dumps(end_codex(int(args[1]), int(args[2]))))
        elif not args:
            print_table(find_sessions(process_table()))
        else:
            sys.exit(__doc__)
    except BrokenPipeError:
        pass

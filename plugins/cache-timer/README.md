# cache-timer

A status-line countdown of the minutes left before Claude's prompt cache expires.

> **Claude Code only.** This is a mod: it uses Claude Code's early-access mods (function hooks) API and needs Claude Code 2.1.290 or newer (CLI or desktop app). The API may change between releases.

## What it does

Claude re-reads your whole conversation on every message. While the prompt cache is warm that is cheap and fast; once it expires, the next message pays full price. This mod shows how long you have left, for example `34m left (1h cache)`, then `cache expired`.

The countdown restarts on every main-chat request. It updates once a minute.

**Which lifetime does it use?** The one the API reports. After each response the mod reads how the cache write was sized (a 5-minute or a 1-hour write) from the response's usage and uses that. Before any response has said, it assumes **5 minutes**, which is the API default (Anthropic's prompt caching docs: the default lifetime is 5 minutes, with a 1-hour option at extra cost). The label always names the lifetime it is using, so a wrong assumption is visible. Whether your account gets the 1-hour cache depends on your plan and settings; the mod does not assume it.

## When to use it

- You step away mid-task and want to know whether coming back will be cheap.
- You want to decide between continuing and starting fresh without guessing.

## Install

```
/plugin marketplace add ottermaticllc/agent-harness
/plugin install cache-timer@agent-harness
```

## Configuration

None.

## Example

```
status line:  52m left (1h cache)
              ...an hour later...
              cache expired
```

## What it reads, writes and sends

- **Reads:** the clock and each main-chat response's token usage.
- **Writes:** one value (last request time and lifetime) in the session's mod state. Nothing on disk.
- **Sends:** nothing.

## Limits and known issues

- It counts from when the request was sent, as the API does. The exact server-side expiry is not visible, so treat the number as an estimate.
- A response that only read the cache (wrote nothing) does not name a lifetime. The mod keeps the last known one.
- Subagents have their own caches and are not tracked.
- If the account switches lifetime mid-session, the label corrects itself on the next response that writes to the cache.
- In a live Claude Code 2.1.318 session it read the lifetime from the response and showed "5m left (5m cache)". Not yet watched across a full expiry.

## Author

Jared Schulman, OtterMatic LLC (https://jaredschulman.com)

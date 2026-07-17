---
name: GitHub push auth failures via replit-git-askpass
description: git push to a GitHub remote can hang (exit 124) or fail with 401 "Invalid username or token" even when the GitHub connection status is healthy and the token works fine via direct API calls.
---

`git push <remote> <branch>` to a GitHub HTTPS remote can hang indefinitely (timeout/exit 124) or fail with:

```
remote: Invalid username or token. Password authentication is not supported for Git operations.
fatal: Authentication failed
```

This can happen even when:
- `listConnections('github')` shows the connection as `healthy`
- The same token works fine when used directly against the GitHub REST API (e.g. `GET /repos/{owner}/{repo}` returns 200 with push permission)
- Re-running `addIntegration()` / `proposeIntegration()` on the connection to force a refresh does not fix it

**Why:** The `replit-git-askpass` credential relay that git invokes (via `GIT_ASKPASS`) can supply a stale/invalid token to git's Basic-auth flow independently of whether the underlying connector token itself is valid. This is an environment/credential-relay issue, not a token-scope or repo-permission issue.

**How to apply:** Diagnose with `GIT_CURL_VERBOSE=1 GIT_TRACE=1 git push ... 2>&1` — look for the `401` + `www-authenticate: Basic` response and the subsequent `replit-git-askpass` invocations for username/password. If push still fails after that despite a verified-good token, bypass the askpass relay entirely: in the code_execution sandbox, fetch the token via `listConnections('github')`, build a URL like `https://x-access-token:<token>@github.com/<owner>/<repo>.git`, and push directly to that URL (as a positional git argument, not written to `.git/config`) using `child_process.execFile`. Never print or log the token; only reference it as an in-memory variable.

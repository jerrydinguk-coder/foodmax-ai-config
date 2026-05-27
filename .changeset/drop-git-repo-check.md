---
'foodmax-ai-config': patch
---

fix(init): drop git-repo preflight check so `npx -y foodmax-ai-config@latest init` succeeds in any directory.

Previously init threw `... is not a git repository. Re-run with --yes ...` when the cwd had no `.git/`, which blocked teammates who ran the install command in their home dir or a fresh project before `git init`. The check was UX defense, not a technical requirement — init writes plain text files (`CLAUDE.md`, `package.json` devDep, `.gitignore`, `.github/workflows/ai-config-verify.yml`, `.foodmax-ai.lock.json`) and shells out to `claude plugin install` + MCP setup, none of which need git.

`--yes` is retained as a no-op flag for backward compat (older docs and scripts reference it).

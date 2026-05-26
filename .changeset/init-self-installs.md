---
"foodmax-ai-config": minor
---

feat(init): self-install the package when missing from cwd `node_modules`

`init` previously required users to run `npm install --no-save <url>#vX.Y.Z`
first, then `npx foodmax-ai init` — the single-command `npx -y <url>.git init`
entry point that the old README advertised never actually worked because the
npx cache lives outside the project's `node_modules`.

`init` now detects that case and runs `npm install --no-save <SOURCE>#<tag>`
itself before continuing, so the single-command bootstrap from `npx` works
end-to-end. `--dry-run` prints the would-install line and exits without
touching the filesystem. If the install fails to materialize the package, init
throws a clearer error pointing at the likely Codeup auth issue.

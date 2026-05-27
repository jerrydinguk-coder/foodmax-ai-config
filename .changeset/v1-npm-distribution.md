---
"foodmax-ai-config": major
---

feat!: switch distribution to npm public registry (BREAKING)

**For teammates: install is now one zero-auth command.**

```bash
npx -y foodmax-ai-config@latest init
```

No more Codeup SSO, no PAT setup, no `git ls-remote` preflight — npm public
registry is anonymous-readable from anywhere.

**Why it broke**

Codeup tenant (`bgs2026-...`) force-redirects all HTTPS traffic to SSO
login, and teammates authed via 飞书 SSO have no git CLI credentials to
respond with. That made "one-line install" impossible on the Codeup path
without per-teammate setup work.

**What changed**

- **Distribution**: package now publishes to **npm public registry** as
  `foodmax-ai-config`. Install spec is plain `foodmax-ai-config@<version>`
  (no git URL).
- **Plugin marketplace**: registered to Claude via
  `claude plugin marketplace add https://github.com/jerrydinguk-coder/foodmax-ai-config.git#v<X.Y.Z>`
  — the GitHub public mirror serves the marketplace catalog (anonymous
  HTTPS clone, no auth). Codeup remains the **dev source** but is never
  reached by teammates.
- **Version flags**: `--channel <name>` renamed to `--tag <name>` to match
  npm dist-tag terminology (`latest`, `beta`, etc.). `--version <semver>`
  unchanged.
- **Project package.json devDep** is now written as semver caret range
  (`^X.Y.Z`), not a git URL.
- **versions.json + deprecation block mechanism removed**. Channel selection
  uses npm dist-tags natively. Deprecation uses `npm deprecate` (warn-only;
  no hard block — npm doesn't support that, but the warning surfaces in
  every `npm install` output).
- **LICENSE**: added MIT.

**Migration from v0.x**

Existing projects on v0.x: re-run `npx -y foodmax-ai-config@latest init` to
rewrite project files. `npx foodmax-ai update` from v0.x won't migrate
because v0.x's update calls Codeup; it has to be a fresh init.

**Maintainer setup (one-time before publishing this release)**

1. Create empty public repo `jerrydinguk-coder/foodmax-ai-config` on GitHub.
2. `git remote add github git@github.com:jerrydinguk-coder/foodmax-ai-config.git`
3. `git push -u github main && git push github --tags`
4. `npm login` (so `npm publish` works during release).

**Release flow gains an `npm-login` pre-release gate** and `pnpm release`
now does `git tag → push tag (Codeup) → push main+tag (github) → npm publish`.

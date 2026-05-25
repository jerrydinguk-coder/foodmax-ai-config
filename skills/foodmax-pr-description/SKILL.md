---
name: foodmax-pr-description
description: Generate a PR description in the FoodMax team format (Why / What / How verified / Risk / Rollback). Use when the user asks to write or draft a PR description, or invokes /foodmax-pr-description.
---

# FoodMax PR Description

When the user asks you to write a PR description (or types `/foodmax-pr-description`):

## Step 1: Gather context
Run in parallel:
- `git log <base>..HEAD --oneline` → collect commits
- `git diff <base>...HEAD --stat` → summarize change footprint

If base branch unknown, ask the user; default guess is `main`.

## Step 2: Output exactly this format

```markdown
## Why
<one paragraph: the business or technical motivation — what problem is this PR solving>

## What
- <bullet per significant change, grouped by area>

## How verified
- [ ] <test command 1, e.g. `pnpm test`>
- [ ] <manual check 1, e.g. "Click X, observe Y">

## Risk
<one sentence: what breaks if this ships wrong>

## Rollback
<one sentence: how to revert quickly — `git revert <sha>` or a flag flip>
```

## Anti-patterns to avoid
- Don't write "various improvements" or "small fixes" — be specific
- Don't include git commit messages verbatim — synthesize the story
- Don't say "should be safe" in Risk — name a concrete failure mode

---
name: foodmax-new-module
description: Scaffold a new module following FoodMax conventions (v1 placeholder — adjust to actual stack). Use when the user asks to create a new module or invokes /foodmax-new-module.
---

# FoodMax New Module Scaffold

> **v1 placeholder.** This skill is a scaffold for future FoodMax-specific module conventions (TS / Python / Go etc.). Customize when team conventions are decided.

When the user runs `/foodmax-new-module <module-name>`:

1. Ask: target language (TypeScript / Python / Go)? target subdirectory?
2. Generate skeleton:
   - Source file: `<subdir>/<module-name>/index.<ext>`
   - Test file: `<subdir>/<module-name>/<module-name>.test.<ext>`
   - README stub: `<subdir>/<module-name>/README.md`
3. Run team formatter on the generated files (e.g. `prettier`, `black`, `gofmt`)
4. Stage the new files with `git add`

Do NOT commit automatically — the user runs the commit themselves.

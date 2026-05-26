---
"foodmax-ai-config": patch
---

fix(repair): honor pinned `packageVersion` from `.foodmax-ai.lock.json`

`repair` previously ran `npm install --no-save <bare-url>`, which silently
moved projects pinned to an older release to bootstrapper main. It now reads
`packageVersion` from the project lockfile and pins the reinstall to
`<url>#v<version>`. Falls back to the bare URL only when the lockfile is
absent or malformed.

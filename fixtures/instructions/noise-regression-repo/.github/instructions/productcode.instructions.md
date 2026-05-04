---
applyTo: "src/**/*.go,web/src/*.ts"
---

# Product Code

- Preserve public API names unless the task explicitly asks for a breaking change.
- Keep validation close to the domain boundary that owns the input.
- Use existing error wrapping conventions when returning operational failures.
- Avoid adding framework abstractions when a small function keeps the behavior clear.
- Prefer typed request and response models over loosely shaped maps.
- Keep browser-facing code free of server-only assumptions.

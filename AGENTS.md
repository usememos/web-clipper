# Agent notes

## UI

- The clipper's UI comes from [`@usememos/ui`](https://github.com/usememos/ui), the shared Memos design system, pinned to an exact version.
- Before any UI work, read `node_modules/@usememos/ui/llms-full.txt`: tokens, components and their parts, and the rules. Follow it over habit.
- Never add local UI primitives (a `src/components/ui/` kit) or import `@base-ui/react` directly. Use ui's components; if one is missing, keep the stand-in small and local, like `src/components/inline-status.tsx`, until ui ships it.
- Style with the Tailwind names mapped from ui tokens in `src/index.css` (`bg-surface`, `text-ink-muted`, `border-line`, …), or `var(--mu-*)` where Tailwind can't reach. No raw colors.
- `--clip-highlight*` is the clipper's own content color (template tokens, the excerpt bar, the template preview). Never use it on a ui control, for focus, or for warnings.

# Contributor rules

These apply to people and to automated agents working in this repository.

## Legal
- Write everything from public specifications (ECMA-376 / ISO 29500 for `.pptx`) and your own design.
- Copy nothing from other companies' software, documents, help text, icons, templates or fonts.
- Add no GPL or AGPL code. New dependencies must be MIT, BSD, ISC, Apache-2.0 or similar, and go in `NOTICE` and `ASSETS.md`.
- The app and this repository don't name other presentation apps or their makers. Use neutral words such as "other apps".

## Interface
- ClerdoFrame has its own layout: a rail, a tool panel, the slide list, the canvas, notes and an optional format pane on the right. Don't add a tabbed strip of tools.
- Interface text is plain and short. Say what a control does.
- SVG icons only (lucide-react, `strokeWidth` 1.9). No emoji or symbol characters as icons.
- Everything works with touch (iPad) as well as mouse and keyboard: pointer events, no hover-only controls.

## Code
- TypeScript in strict mode. Keep the layers in [docs/architecture.md](docs/architecture.md).
- Document changes go through `FrameStore.change()` / `tryChange()` so they can be undone.
- Features plug in through `src/app/registry.ts`; they don't import each other's UI.
- Add comments only when the reason isn't clear from the code.
- Every file reader treats its input as untrusted: no `eval`, no remote fetches, and only `https:`, `mailto:` and in-deck links.
- Keep unknown `.pptx` parts on save where it's safe.

## Before you open a pull request
```bash
npm run typecheck
npm test
npm run build
```
New file-format work needs a save-and-reopen test in `tests/`.

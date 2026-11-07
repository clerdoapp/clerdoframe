# Architecture

ClerdoFrame is a React + TypeScript app built with Vite. The same build runs in the browser (and as the iPad home-screen app) and inside Electron for the desktop installers.

```
src/
  model/      Plain data: the Deck, slides, layouts, masters, shapes, text, animations (deck.ts), defaults.ts
  render/     Pure drawing: SlideView draws any slide, layout or master as SVG at any size
  app/        FrameStore (state + undo), command registry, extension registry, file open/save
  formats/    File readers and writers (.pptx, PDF, images, outline) and the internal draft format
  ui/         The shell: top bar, rail, tool panel, slide list, canvas, notes, status bar, shared kit
  features/   Everything else, one folder per area, wired in through src/app/registry.ts
electron/     Desktop main process and preload bridge
```

## Model

`src/model/deck.ts` is the contract. Units are pixels at 96 dpi (a 16:9 slide is 1280 x 720), angles are degrees, font sizes are points. Colours are either `'#RRGGBB'` or theme references (`{ theme: 'accent1', lum: 0.4 }`) so changing the design recolours everything.

A slide has a layout; a layout belongs to a master; the master owns the theme and text styles. Slide placeholders (`shape.ph`) inherit text styles, body settings, fill and line from the matching layout and master placeholders (`render/inherit.ts`).

Binary media (pictures, video, audio) lives in `deck.media` and is referred to by id. It is append-only and never copied by undo.

## State and undo

`FrameStore` (`app/store.ts`) holds the deck, the current slide, the selection, view settings and transient UI state. Every document change goes through `store.change(label, fn)` (or `tryChange`), which snapshots the deck (without media) before running `fn`, so every change is undoable. Nested calls fold into one step. UI-only state changes call `store.emit()`.

## Commands

Every action is a command (`app/commands.ts`) with an id, label, optional shortcut and `enabled`/`active` checks. Tool panels, menus, the command search and shortcuts all run commands by id, so behaviour lives in one place.

## Extension points

Feature modules never import each other's UI. They register what they add at start-up (`features/index.ts` calls each module's `register…()`):

| Registry | What it adds |
|---|---|
| `registerRailTab`, `registerPanelSection` | Rail tabs and the groups inside each tool panel |
| `registerPane` | Right-hand panes (Format shape, Animation pane, Selection, Comments) |
| `registerDialog` | Dialogs, opened with `openDialog(store, id, data)` |
| `registerKind` (render) | How a shape kind is drawn (charts, diagrams, media, ink, equations) |
| `registerPreset` (render/geometry) | Preset shape geometry |
| `registerTool` | Canvas drawing tools (shapes, text boxes, pens, tables) |
| `registerCanvasLayer` | Things drawn over the slide while editing |
| `registerOverlay` | Full-screen layers (slide show, presenter view) |
| `registerView` | Views other than Normal (outline, sorter, notes page, reading, master list) |
| `registerFormat` | File formats to open, save and export |
| `registerMenu` | Context menu items |

## Drawing

`render/SlideView.tsx` draws slides as SVG. Text is HTML inside `foreignObject` so wrapping, bullets and mixed styles follow the browser's text engine. The same component draws the editing canvas, thumbnails, the slide show, the presenter view and exports, so what you see is what you present.

## Security

Files are untrusted input: readers never `eval`, never fetch remote resources, and only keep `https:`, `mailto:` and in-deck links. The built app ships a strict Content-Security-Policy with no remote scripts or network calls. Electron runs with context isolation, sandboxing and no Node integration in the page; the page can only write to paths the person picked.

# File formats

| Format | Open | Save / export | Notes |
|---|---|---|---|
| `.pptx` | Yes | Yes | The main format. Themes, masters, layouts, all shape kinds, tables, charts (with an embedded workbook so the data stays editable), transitions, animations, notes, comments (both comment formats), sections, custom shows and document properties. Parts ClerdoFrame doesn't understand are kept on save. |
| `.pptm` | Yes | Saves as `.pptx` | Macros are kept out and never run. |
| `.ppsx` | Yes, starts the show | Yes | |
| `.potx` | Yes | Yes | Save as template. |
| `.odp` | No | Yes | Text, shapes and pictures. Rotation, animations and charts are left out. |
| PDF | | Yes | Slides, notes pages, handouts (1, 2, 3, 4, 6 or 9 per page), outline; range, hidden slides, frames. |
| PNG / JPEG | | Yes | The current slide, or every slide in a zip. |
| SVG | | Yes | The current slide. |
| GIF | | Yes | Animated, one frame per slide. |
| Video | | Yes (`.webm`) | Plays through the deck with timings and cross-fades. Records in real time. |
| Outline | | Yes (`.rtf`, `.txt`) | Slide titles and body text. |

## What isn't kept yet
- Animations: effect names, options and timing are kept; complex motion may play a little differently in other apps.
- Ink is saved as drawn shapes, not as ink.
- Newer chart kinds from other apps open as their fallback picture; chart formatting beyond type, data, colours, title, legend, labels and axes isn't kept.
- Equations are saved as text.
- Embedded fonts are listed by name only. OLE objects keep their preview picture.

Files are treated as untrusted: only `https:`, `mailto:` and in-deck links are kept, document types are ignored, and parts are size-limited.

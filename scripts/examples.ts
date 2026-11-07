// Writes the example decks to examples/*.pptx (npm run examples).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES } from '../src/features/files/examples';
import { writePptx } from '../src/formats/pptx';

const dir = join(process.cwd(), 'examples');
mkdirSync(dir, { recursive: true });
for (const e of EXAMPLES) {
  const deck = e.build();
  const file = join(dir, `${e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pptx`);
  writeFileSync(file, writePptx(deck));
  console.log(`${file}  (${deck.slides.length} slides)`);
}

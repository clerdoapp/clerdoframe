# Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev          # the web app at http://localhost:5173
npm test             # unit tests
npm run typecheck
npm run build        # web build in dist/
npm run dist         # desktop installers for this system in release/
```

To run the desktop app from source: `npm run build && npm run electron:compile && npx electron .`

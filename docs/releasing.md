# Releasing

1. Set the version in `package.json` and add a `CHANGELOG.md` entry.
2. Commit and push to `main`. The web app at `https://clerdoapp.github.io/clerdoframe/` updates on every push.
3. Tag the commit with the same version and push the tag:

   ```bash
   git tag v0.5.0 && git push origin v0.5.0
   ```

The Release workflow builds Windows, macOS and Linux installers and publishes them with checksums on the Releases page. Actions > Release > Run workflow builds everything without publishing.

GitHub Pages must use **GitHub Actions** as its source (Settings > Pages).

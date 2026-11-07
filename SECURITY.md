# Security

ClerdoFrame opens files from anywhere, so a bug in a file reader matters. Please report security problems privately through the repository's **Security > Report a vulnerability** page rather than in a public issue.

Include the version, your system, and a sample file if there is one.

## What the app does
- The desktop app runs with a sandboxed, isolated page and can only write to files you picked.
- Presentations never leave your device. There is no account, server or tracking.
- The built app has a strict content policy: no remote scripts and no network requests. Pictures and media come only from the file or your device.
- Links on slides open only for `http`, `https` and `mailto`, or jump inside the presentation. Actions that would run programs are not supported.
- Macros in `.pptm` files are kept in the file but never run.
- The camera, microphone and screen are used only when you record narration, audio or the screen, and only after the system asks you.

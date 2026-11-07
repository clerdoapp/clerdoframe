# Installing on Windows

Each release has three Windows files:

| File | Use it when |
|---|---|
| `clerdoframe-<version>-win-x64.msi` | You want a normal installation with a Start menu entry and file associations |
| `clerdoframe-<version>-win-x64.exe` | You want to run it without installing, for example from a USB drive |
| `clerdoframe-<version>-win-x64.zip` | You want to unpack it somewhere yourself |

The builds aren't code-signed yet, so SmartScreen may warn the first time: click **More info**, then **Run anyway**.

## Installing for many computers

```bat
msiexec /i clerdoframe-0.5.0-win-x64.msi /qn
```

Uninstall with:

```bat
msiexec /x clerdoframe-0.5.0-win-x64.msi /qn
```

## File types

The installer offers ClerdoFrame for `.pptx`, `.pptm`, `.ppsx`, `.potx` and `.odp` files. Windows asks once which app to use; choose ClerdoFrame and tick **Always**.

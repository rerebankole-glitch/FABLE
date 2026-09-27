# FABLE desktop shell

Wraps the single-file web build in Electron for stores that need a native executable (Steam, Microsoft Store,
itch.io desktop downloads). The game code is unchanged; this folder only adds the window.

    npm run build                 # in the repo root: produces dist/index.html
    node tools/build-desktop.mjs  # copies it to desktop/app/ and renders the icons
    cd desktop && npm install && npm start          # run it (add -- --windowed for a window)
    npm run dist                                    # installers for the current OS -> desktop/release/

Targets: Windows NSIS installer + APPX (Microsoft Store), macOS universal DMG, Linux AppImage + deb.
Fill in `build.appx.identityName / publisher` from Partner Center before building the Store package, and
sign macOS builds with your Developer ID (`CSC_LINK` / `CSC_KEY_PASSWORD` env vars) before notarising.
Steam: upload the unpacked `release/win-unpacked` (and mac/linux equivalents) as depots with SteamPipe;
the launch executable is `FABLE.exe` / `FABLE.app` / `fable-desktop`.

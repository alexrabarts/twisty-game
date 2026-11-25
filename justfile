# Install what the game, its tests and the leaderboard deploy need
deps:
    #!/usr/bin/env bash
    set -euo pipefail
    if ! command -v firebase >/dev/null; then
        if ! command -v brew >/dev/null; then
            echo "firebase is missing and Homebrew is not installed: install firebase-tools (https://firebase.google.com/docs/cli)" >&2
            exit 1
        fi
        brew install firebase-cli
    fi
    firebase --version
    # The browser proofs run on the Chrome that TWISTY_CHROME names; puppeteer's own Chrome 131 does not set up on these Macs
    PUPPETEER_SKIP_DOWNLOAD=1 npm ci
    (cd functions && npm ci)

# MTGO Cube Chronicle

A read-only visual history of the MTGO powered cube: 47 snapshots from December 2012 through August 2026, connected into 540 slot timelines.

The viewer uses original-printing images from Scryfall. Consecutive appearances are stacked; replacement links are curated interpretations, not claims that every pair is an official direct upgrade.

When a card returns in a different slot, its return appears as a parallel path labeled with the card it replaced. Later reintroductions on those branches are followed recursively. Every lane continues to the latest snapshot; the underlying one-to-one replacement links are unchanged. Never-replaced cards remain selectable in a muted group at the bottom of the card selector.

Numbered branch links connect the source card to its returning path. Desktop families open in a fitted overview; toggle **Fit all paths** off for larger cards. Mobile keeps readable cards and scrolls vertically. Click any card to see its full-size original-printing image.

## Hosting

This repository contains only the public viewer. GitHub Pages serves the root of the `main` branch. There is no backend, editing interface, or browser-persisted pairing data.

For local preview, run `python3 -m http.server 4174` in this directory and open `http://127.0.0.1:4174/`.

## Updating the viewer

Edit the standalone viewer in this repository, run `node --test cube-model.test.mjs`, preview it, then commit and push. Preserve `.nojekyll`. Do not copy editor code, private source history, credentials, or pairing backups into this repository. Copying an older Sites build over this checkout would remove the viewer's newer changes.

## Sources

- Historical lists: [Cube Cobra](https://cubecobra.com/cube/list/mtgo-holiday-v1)
- Modern updates: [Magic Online](https://www.mtgo.com/vintage-cube-cardlist)
- Card information and images: [Scryfall](https://scryfall.com)

Unofficial fan project. Magic: The Gathering card names and artwork belong to Wizards of the Coast and their respective rights holders.

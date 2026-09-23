# MTGO Cube Chronicle

A read-only visual history of the MTGO powered cube: 47 snapshots from December 2012 through August 2026, connected into 540 slot timelines.

The viewer uses original-printing images from Scryfall. Consecutive appearances are stacked; replacement links are curated interpretations, not claims that every pair is an official direct upgrade.

The selected version and card identify a specific occurrence. Its main row traces the slot back to the earliest available snapshot, even when that card was introduced later. Only the selected card's other slots create alternate paths, including first inclusions and returns before the selected version. Reintroductions of later replacement cards do not branch, and repeat returns to the same slot do not duplicate rows. Every row continues to the latest snapshot; the underlying one-to-one replacement links are unchanged. Never-replaced cards remain selectable in a muted group at the bottom of the card selector.

Parallel paths are stacked vertically on shared date columns. The card displaced by an alternate inclusion appears faded and grey in the preceding snapshot. Runs are split at changes on either row: repeated images labeled **Continued** are the same uninterrupted run, not extra replacements. The first image retains the full revision count. Ended runs say **Lasted X revisions**; current runs say **Present** and end their date range in **present**, meaning the latest archived snapshot shown beneath the timeline. Desktop opens in a fitted overview; toggle **Fit all paths** off for larger cards. Mobile keeps the rows aligned in a shared horizontal scroller.

Click any timeline card, including a faded predecessor, to open that occurrence's full slot history. Earlier inclusions on other slots appear as parallel rows. Each selection has a shareable URL using stable version/card IDs, with browser Back/Forward support. Use the small enlarge button on a card to inspect its full-size original-printing image.

Single paths use the same aligned date axis and straight, left-to-right card row as parallel paths—never a wrapping grid. Desktop fits the complete timeline by default; toggle **Fit timeline** off for larger cards. On mobile, swipe horizontally along the timeline.

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

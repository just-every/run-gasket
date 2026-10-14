# Fonts

Geist is self-hosted under the SIL Open Font License 1.1 in
`geist/LICENSE.txt`. The Latin and Latin Extended variable WOFF2 subsets come
from Fontsource's Geist distribution; upstream: https://github.com/vercel/geist-font.

`/rer-theme.css` declares Geist once, because Base's sign-in and setup frames
read only the theme. `/fonts/fonts.css` holds its size-matched `Geist Fallback`
and the `--font-body` stack; the app and the root document link it before the
theme and preload only the primary Latin file. Do not import either from a component.

Fallback scales use Geist/Arial advance-width ratios over A-Z, a-z and 0-9
at weights 400, 500 and 700. Ascent, descent and line gap match Geist's
1005, -295 and 0 per 1000 units, divided by each scale. Matching metrics reduces
layout movement; different glyph designs cannot have identical widths in every
piece of text. Recalculate the fallback and preload when changing the brand font.

# Fonts

Self-hosted under the SIL Open Font License 1.1; each folder keeps its licence.

- `inter/inter-variable-latin.woff2`: Inter 4.1 variable (weight and optical
  size axes) from the `inter-ui` 4.1.0 distribution (upstream
  https://github.com/rsms/inter), subset with fontTools to Latin-1, general
  punctuation, arrows (U+2190–2199), ✓, ×, ÷, °, ≈, ≤, ≥ and − so the page's
  arrows and ticks render in Inter. Licence: `inter/LICENSE.txt`.
- `jetbrains-mono/`: JetBrains Mono, Latin variable WOFF2 from Fontsource
  (upstream https://github.com/JetBrains/JetBrainsMono), for commands.
  Licence: `jetbrains-mono/LICENSE.txt`.

`/rer-theme.css` declares both faces and the size-matched `Inter Fallback`
(Arial scaled to Inter's advance widths; ascent and descent from Inter's
1984/-494 per 2048 units, divided by the scale) and names the stacks, so the
installer serves them too; `/look.css` sets the page font. The app, Base's
frames, the run site and /run read them from there. Do not import either file
from a component.

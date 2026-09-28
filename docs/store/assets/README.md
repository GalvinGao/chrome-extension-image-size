# Store artwork

The icon and promotional tile layouts are original SVG designs. The sample photograph was generated with OpenAI Image Generation on 2026-09-28 and converted to WebP for the demo page. It contains no third-party branding or identifiable people.

The two screenshots show the actual extension running against `../demo.html`. The B · KB · MB pills in the promotional tiles are graphic illustrations, not claimed measurements.

## Regenerate

With `rsvg-convert` (librsvg) installed, run `node scripts/render-store-assets.mjs` from the repository root to render the icon sizes and promotional PNGs. Their text uses Arial/Helvetica, so font availability can affect rendering.

To reproduce screenshots using a Chromium build that supports loading unpacked extensions:

```sh
CHROME_BIN=/path/to/chromium STORE_SCREENSHOTS=1 npm run test:browser
```

The fixture and photographs are excluded from the extension ZIP.

## Original photograph prompt

> Use case: photorealistic-natural. Create one original photograph to be used as a sample image on a browser-extension demonstration website and in its Chrome Web Store marketing screenshots. A serene alpine lake with deep teal water, rugged pale limestone mountains, a tiny warm white boathouse near the bottom left and a few orange autumn trees, softly overcast daylight, premium travel editorial photography, realistic fine detail. Landscape composition 1536 by 1024 pixels. Beautiful restrained teal / forest green / warm stone palette, ample visual clarity at small sizes. No people, no logos, no text, no UI overlays, no watermarks, no montage. The photograph must be wholly original.

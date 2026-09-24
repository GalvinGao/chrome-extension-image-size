# Image File Size

A Chrome extension that shows tiny **B / KB / MB** labels at the top-right of images. It measures the page's existing image requests without downloading images again.

## Example

![Image File Size showing file-size labels on a video thumbnail and avatar](docs/example.png)

The screenshot shows the size labels. Current labels show encoded file size only until hovered or focused. Expanded details include the MIME type, for example `image/jpeg + gzip`, with `image/` muted.

## Install

Requires **Chrome 126 or newer**. No build step is needed.

1. [Download the extension ZIP](https://github.com/GalvinGao/chrome-extension-image-size/archive/refs/heads/main.zip) and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the extracted `chrome-extension-image-size-main` folder containing `manifest.json`.
5. Open Chrome's Extensions menu (the puzzle icon) and pin **Image File Size**.

Keep the extracted folder; Chrome loads the extension from it.

## Use

1. Open a webpage and click the extension icon, or press **Alt+Shift+I**, to open the popup.
2. Turn on **Monitor this tab**. The **ON** badge means monitoring is active.
3. **Only images loaded AFTER monitoring is enabled can show their size.** Reload the page after enabling it to capture existing images.
4. Hover or keyboard-focus a label to expand the image details. The collapsed label shows **encoded file size only**.
5. Turn the popup switch off to hide the labels and stop monitoring.

Chrome shows a debugging banner while the extension monitors image requests. This is expected. If you used the earlier userscript, disable it to avoid duplicate labels and downloads.

A **—** label means the size is unavailable. Some cached images, partial responses, CSS backgrounds, and images inside shadow roots are not supported. Labels use the browser’s top layer to stay above ordinary page overlays, while CSS anchors keep them attached to each image. Labels inside a frame remain within that frame. Chrome's internal pages cannot be monitored; hover over an **!** badge for the error.

## What size is shown?

The collapsed label shows **encoded image file size**, excluding response headers. It uses the full response Content-Length when available, resource bytes when there is no HTTP compression, or observed encoded body bytes. Cache validation traffic is never used as the file size. Unavailable measurements show **—**. No extra requests are made.

Hover or keyboard-focus the label for:

- Transferred bytes for the latest request, including headers. Cache checks may transfer only a few hundred bytes, and cache hits may transfer 0 B.
- Resource bytes after HTTP decompression (image-format compression remains intact).
- Intrinsic dimensions (browser-reported natural dimensions).
- Displayed dimensions (rendered CSS pixels), on a separate row.
- Source: network, memory cache, disk cache, revalidated cache, prefetch cache, or service worker, when reported by Chrome.
- Load duration / TTFB in milliseconds for the final request after redirects. TTFB is unavailable when Chrome does not expose first-byte timing, including cached responses.
- Resource bytes per megapixel of intrinsic dimensions.
- `srcset YES` only when the image or its `<picture>` sources have a nonempty srcset.

**Red labels mean more than 1 MB per megapixel** (decimal units), using resource bytes so caching and HTTP compression do not hide heavy images. This is a heuristic, not a quality score: small icons, transparency, and animated files can legitimately score high. The expanded label includes the numeric density and threshold explanation. Press Escape to collapse it.

The size excludes request uploads and TLS/TCP overhead. Service-worker measurements describe the observed image request, not every underlying fetch. Network and resource sizes are both retained from the original load.

The expanded label shows the MIME type, right-aligned, with its prefix (such as `image/`) in gray. A suffix such as `+ gzip` or `+ br` appears only when the response has a non-identity **Content-Encoding**. **Transfer-Encoding** describes HTTP message transport (for example, chunking), so it is not displayed as image compression.

Extra HTTP compression on already-compressed formats such as JPEG is often unnecessary; the suffix makes it visible. Compression is still useful for text-based formats such as SVG.

## Privacy

Monitoring starts only when you turn it on for a tab. The debugger permission lets the extension inspect existing image responses, including cross-origin images. It does not send data to a server or save image contents. Sizes describe file bytes, not pixel dimensions or decoded bitmap memory.

## Development

Run `npm test` and `npm run check`. No dependencies to install.

Optional browser test: `CHROME_BIN=/path/to/chromium node tests/browser.mjs`.

# Image File Size

A Chrome extension that shows tiny **B / KB / MB** labels at the top-right of images. It measures the page's existing image requests without downloading images again.

## Example

![Image File Size showing file-size labels on a video thumbnail and avatar](docs/example.png)

The screenshot shows the size labels. Current labels also show the MIME type below the size when available, for example `image/jpeg + gzip`, with `image/` muted.

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
4. Choose **Resource** or **Network** under **Label size**. Switching updates captured labels immediately without another request. The choice lasts for the monitoring session.
5. Turn the popup switch off to hide the labels and stop monitoring.

Chrome shows a debugging banner while the extension monitors image requests. This is expected. If you used the earlier userscript, disable it to avoid duplicate labels and downloads.

A **—** label means the size is unavailable. Some cached images, partial responses, CSS backgrounds, and images inside shadow roots are not supported. Labels use the browser’s top layer to stay above ordinary page overlays, while CSS anchors keep them attached to each image. Labels inside a frame remain within that frame. Chrome's internal pages cannot be monitored; hover over an **!** badge for the error.

## What size is shown?

Choose the measurement in the popup:

- **Resource** (default): file bytes after HTTP decompression (gzip/Brotli). Image-format compression remains intact; this is not decoded bitmap memory.
- **Network**: Chrome’s reported response transfer size (`Network.loadingFinished.encodedDataLength`), including response headers and the compressed body. It is not a packet-level bandwidth measurement and excludes request upload and TLS/TCP overhead. This is the final response's size, not the sum of redirect responses.

Cached loads can report **0 B** transferred while their resource size is nonzero. Service-worker responses describe the observed image request, not every underlying fetch made by the worker. Missing transfer measurements show **—**, never a guessed resource size. Units are decimal B / KB / MB. Both measurements come from the original load; switching requires no new requests.

The second line shows the MIME type, right-aligned, with its prefix (such as `image/`) in gray. A suffix such as `+ gzip` or `+ br` appears only when the response has a non-identity **Content-Encoding**. **Transfer-Encoding** describes HTTP message transport (for example, chunking), so it is not displayed as image compression.

Extra HTTP compression on already-compressed formats such as JPEG is often unnecessary; the suffix makes it visible. Compression is still useful for text-based formats such as SVG.

## Privacy

Monitoring starts only when you turn it on for a tab. The debugger permission lets the extension inspect existing image responses, including cross-origin images. It does not send data to a server or save image contents. Sizes describe file bytes, not pixel dimensions or decoded bitmap memory.

## Development

Run `npm test` and `npm run check`. No dependencies to install.

Optional browser test: `CHROME_BIN=/path/to/chromium node tests/browser.mjs`.

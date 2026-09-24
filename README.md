# Image File Size

A Chrome extension that shows tiny **B / KB / MB** labels at the top-right of images. It measures the page's existing image requests without downloading images again.

## Install

Requires **Chrome 126 or newer**. No build step is needed.

1. [Download the extension ZIP](https://github.com/GalvinGao/chrome-extension-image-size/archive/refs/heads/main.zip) and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the extracted `chrome-extension-image-size-main` folder containing `manifest.json`.
5. Open Chrome's Extensions menu (the puzzle icon) and pin **Image File Size**.

Keep the extracted folder; Chrome loads the extension from it.

## Use

1. Open a webpage and click the extension icon, or press **Alt+Shift+I**.
2. The **ON** badge means monitoring is active for that tab.
3. Reload the page to capture images that loaded before you enabled monitoring.
4. Click again to hide the labels and stop monitoring.

Chrome shows a debugging banner while the extension monitors image requests. This is expected. If you used the earlier userscript, disable it to avoid duplicate labels and downloads.

A **—** label means the size is unavailable. Some cached images, partial responses, CSS backgrounds, and images inside shadow roots are not supported. Labels may be clipped by the page's layout. Chrome's internal pages cannot be monitored; hover over an **!** badge for the error.

## Privacy

Monitoring starts only when you turn it on for a tab. The debugger permission lets the extension inspect existing image responses, including cross-origin images. It does not send data to a server or save image contents. Sizes describe file bytes, not pixel dimensions or decoded bitmap memory.

## Development

Run `npm test` and `npm run check`. No dependencies to install.

Optional browser test: `CHROME_BIN=/path/to/chromium node tests/browser.mjs`.

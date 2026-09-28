# Chrome Web Store listing

These fields describe the packaged extension, not the publishing credentials. Use English as the default language. Suggested category: Developer Tools, subject to the categories offered by the dashboard.

## Name

Image File Size

## Short description

Tiny image file-size labels measured from existing requests. No duplicate downloads.

## Detailed description

See how much your images weigh, right where they appear.

Image File Size adds small B / KB / MB labels to images on a web page. It measures the page's existing image requests, so it does not download the images again.

HOW TO USE
1. Open a web page and click the extension icon, or press Alt+Shift+I.
2. Turn on “Monitor this tab”.
3. Reload the page to measure images that were already loaded.
4. Hover over a label, or focus it with the keyboard, to see more details.
5. Turn monitoring off to remove the labels and stop observing requests.

WHAT YOU CAN SEE
• Encoded image file size, excluding response headers.
• Resource size and the actual bytes transferred by the latest request.
• Intrinsic and displayed image dimensions.
• Cache source, load time, and time to first byte when Chrome reports them.
• MIME type, HTTP content encoding, and srcset availability.
• Bytes per displayed megapixel, with optional colors to help spot heavy images.

Choose the value shown on the badge and the details you want to see. Display preferences are saved locally and apply to monitored tabs.

IMPORTANT NOTES
Monitoring is opt-in for each tab. Only images loaded after monitoring starts can be measured. Chrome shows a debugging banner because the extension uses the debugger API to observe existing network requests, including cross-origin images.

Some cached images and partial responses have no available file size and show “—”. CSS background images, images inside shadow roots, and Chrome's internal pages are not supported. Size-per-megapixel colors are a helpful heuristic, not an image-quality score.

PRIVACY
Measurements are processed locally. The extension has no analytics or backend and does not upload page data or image contents. Display preferences are stored on your device. See the privacy policy for the information accessed while monitoring.

Requires Chrome 126 or newer.

## Single purpose

Display image file sizes and related image-loading measurements directly on the page, using the current tab's existing network requests without downloading images again.

## Permission justifications

| Permission | Explanation for reviewers |
| --- | --- |
| `debugger` | After the user enables monitoring for a tab, observe its existing image requests through the Chrome DevTools Protocol. Network events provide response sizes, cache state, headers and timings, including cross-origin/frame images. When size information is unavailable, read the existing buffered image response without refetching it. Chrome displays its debugging banner; switching monitoring off detaches the debugger. |
| `scripting` | Inject the image-label content script into the selected tab and its frames when the tab was already open before the extension was installed. |
| `activeTab` | Identify and act on the active tab after the user opens the popup or invokes the extension shortcut. Monitoring always requires an explicit per-tab action. |
| `storage` | Save display preferences locally, such as the badge metric and which detail rows are visible. No observed browsing or image data is saved in extension storage. |
| HTTP/HTTPS host access | Display image labels on arbitrary sites and their frames and continue the selected tab's monitoring through reloads. The static content script is available on these pages, while debugger/network monitoring remains off until the user enables it for that tab. |

## Data handling declaration

Review the dashboard's current wording against `PRIVACY.md`. The extension handles **web history / resource URLs**, **website content / image resources**, and **user activity in the form of image network monitoring** locally for its single purpose. It does not record clicks, scrolling, keystrokes, or form entries. Do not claim it never accesses website data simply because there is no server upload.

The extension has no remote executable code, external service, advertising, analytics, sign-in, purchase, or paid feature. Measurements are held in memory; only display preferences persist. See the policy for the full data flow and retention behavior.

## Test instructions for reviewers

No account or credentials are needed. Open an ordinary HTTP/HTTPS page containing `<img>` elements. Open the extension popup, enable “Monitor this tab”, then reload the page. Confirm the debugging banner and ON badge. Move the pointer over a size label to view details; test the Display options, then turn monitoring off and verify labels disappear. A page served with `python3 -m http.server` from `docs/store/` can be used as a local fixture after cloning the repository; open `demo.html`.

The fixture uses an original AI-generated sample photograph. The included store screenshots capture the actual extension, not a replacement implementation of its labels.

## Links and assets

- Homepage/support: the repository and its issue tracker.
- Privacy policy: a public, durable URL to `PRIVACY.md` from the exact released source revision. Use the approved publisher's maintained repository; a local filesystem path is not a valid store URL.
- Store icon: `icons/icon-128.png`.
- Screenshots: `docs/store/assets/screenshot-overview.png`, `screenshot-details.png` (1280×800).
- Small promotional tile: `docs/store/assets/promo-small.png` (440×280).
- Optional marquee: `docs/store/assets/promo-marquee.png` (1400×560).
- Distribution: free; select the intended countries and visibility in the dashboard.

The publisher must review the declarations against the submitted package before certifying them in the dashboard. The exact extension ID and publisher ID belong in repository configuration, not this reusable listing template.

# Image File Size privacy policy

Last updated: September 28, 2026

Image File Size displays image file sizes and network details directly on web pages. Its measurements and preferences are processed locally in your browser.

## What the extension accesses

The extension installs a content script on HTTP and HTTPS pages so that it can display labels next to images. Network monitoring starts only when you turn on **Monitor this tab** in the extension popup.

While a tab is monitored, the extension uses Chrome's debugger API to observe the tab's existing network requests, including requests from frames. Network events can include request URLs and response metadata. The extension temporarily tracks requests and filters the results to images. For images, it uses information such as URLs, response headers, MIME types, byte counts, cache source, and timing. When necessary, it reads an image's existing response body from Chrome's buffer to calculate its size. It does not download the image a second time.

The content script reads image elements and their source URLs, dimensions, and srcset attributes to position the labels and show details. URLs and website resources may contain personal information; the extension uses this information only to provide the measurements you requested. It does not use it to build a browsing profile.

## Storage and retention

Your display preferences are saved in `chrome.storage.local` on your device. They are not synced by the extension to an account or server.

Request and image measurement records are held in memory with bounded limits. They are cleared when monitoring stops, the tab closes, or the monitored top-level page navigates. The extension does not retain image response bodies after the size calculation. Chrome's own network buffers, cache, and history are controlled by Chrome and the websites you visit.

## Sharing and remote services

The extension does not send the observed URLs, image contents, measurements, or display preferences to the developer or third parties. It has no analytics, advertising, external account, or backend service. It does not sell user data, use data for advertising, or use data for creditworthiness or lending decisions. All executable extension code is included in the installed package.

Image File Size's use of information is limited to displaying image and network measurements and respects the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Your controls

Turn **Monitor this tab** off to stop observing new requests and remove the labels. Closing the tab also ends its monitoring. Chrome displays a debugging banner while monitoring is active; dismissing that banner disconnects the debugger. You can remove the extension to remove its saved preferences.

## Questions and updates

Please report questions through the [project's issue tracker](https://github.com/GalvinGao/chrome-extension-image-size/issues). Do not include private URLs, credentials, or sensitive images in a public issue. Material changes to data handling will be reflected in this policy and the store listing.

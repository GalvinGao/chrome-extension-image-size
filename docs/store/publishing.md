# Publish to the Chrome Web Store

## First release

1. Run `npm run check`, `npm test`, and `npm run package` with Node 24 and the `zip` utility available. No dependency installation is needed.
2. Upload `dist/image-file-size-<version>.zip` as a new item in the [developer dashboard](https://chrome.google.com/webstore/devconsole). Its manifest is at the ZIP root; tests, docs, sample pictures, and credentials are excluded.
3. Complete the store listing using `listing.md`, upload the assets, set a public URL for `PRIVACY.md`, and review the privacy, permissions and distribution fields.
4. Record the new item ID and publisher ID. Submit the completed item for review in the dashboard. Uploading a ZIP alone does not publish it.

## Configure future updates

Create the GitHub Environment `chrome-webstore`. Configure the following repository or environment **Variables**:

| Variable | Value |
| --- | --- |
| `CWS_PUBLISHER_ID` | Publisher ID shown in the dashboard's publisher settings |
| `CWS_EXTENSION_ID` | This extension's store ID, not another extension's ID |

Choose one authentication method:

### Existing OAuth credentials

Set the **Secrets** `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN`. The script exchanges the refresh token for a short-lived access token. The Google account behind the token must have access to the selected publisher, and the Chrome Web Store API must be enabled in the Cloud project. Use scope `https://www.googleapis.com/auth/chromewebstore`.

Alternatively, an existing Plasmo/BPP `SUBMIT_KEYS` Secret is supported. Only its `chrome.clientId`, `chrome.clientSecret` and `chrome.refreshToken` are used. Its old `chrome.extId` and all other stores are ignored. The target always comes from `CWS_EXTENSION_ID` and `CWS_PUBLISHER_ID`.

OAuth apps left in External/Testing can issue refresh tokens that expire after seven days. Resolve the consent-screen state before relying on unattended updates. Never paste credentials into an issue, pull request, store listing, or workflow log.

### Keyless GitHub OIDC

Enable the Chrome Web Store API and IAM Service Account Credentials API in your Google Cloud project. Create a service account and link its email in the publisher settings in the store dashboard. Configure a Workload Identity Provider for GitHub and grant the trusted GitHub principal `roles/iam.workloadIdentityUser` on that service account. Restrict the provider and binding to your owner/repository and approved release refs or environment; use immutable repository/owner IDs in the trust rules where possible.

Set Variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and `CWS_SERVICE_ACCOUNT`. The workflow obtains a service-account OAuth access token with the Chrome Web Store scope. It does not write a credential file or require a private-key Secret. Leave the provider variable unset when using OAuth instead.

The service account can manage the publisher's items, so GitHub repository configuration is not a server-side per-item security boundary. Configure the Environment's allowed branches/reviewers as appropriate for your maintainers. A fork must use its own publisher authorization; it does not inherit upstream Secrets.

## Run an update

Increment both `manifest.json` and `package.json` versions and merge the checked changes. Run **Publish to Chrome Web Store** from GitHub Actions. The workflow must exist on the repository's default branch to be offered as a manual workflow.

| Mode | Behavior |
| --- | --- |
| `status` (default) | Read current submission/publication state; does not upload or publish |
| `upload` | Build and upload a draft package only |
| `stage` | Upload and submit for review; hold the approved version for later publication |
| `publish` | Upload and submit for review; request release once approved |

The script waits for async upload completion before submitting. Existing pending reviews/staged versions and policy warnings stop new uploads. Finish, cancel, or publish those explicitly in the dashboard first. A failed request is not automatically retried because it may already have changed store state. The job summary reports the state returned by Google; `PENDING_REVIEW` is not a public release.

To release an already staged version, use the dashboard. To retry after an uncertain result, run `status` and inspect the dashboard first. For privacy, permission, visibility or listing changes, also update the dashboard fields; this workflow uploads code, not store metadata.

## Local commands

With credentials injected from your local credential manager (not committed files):

```sh
npm run store:status
npm run package
node scripts/chrome-webstore.mjs upload
```

A scoped short-lived `CWS_ACCESS_TOKEN` is also accepted for local use. Do not store an expiring access token as the permanent GitHub Secret.

## References

- [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api)
- [Service accounts](https://developer.chrome.com/docs/webstore/service-accounts)
- [Google GitHub authentication](https://github.com/google-github-actions/auth)
- [First publication](https://developer.chrome.com/docs/webstore/publish)

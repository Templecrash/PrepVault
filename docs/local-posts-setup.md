# Optional local posts from X

The Location page can load recent public X posts after the workspace owner signs in. This is optional; public police/city updates and source links do not require this connection. A normal X login or ChatGPT subscription does not supply API access.

## Setup and cost

1. Create or use an application in the [X Developer Console](https://console.x.com/) with recent-search access and an app bearer token.
2. Add `X_BEARER_TOKEN` only to the server environment. Never use a `VITE_` prefix, commit it, include it in browser storage, or put it into a query string. Restart/redeploy after changing server configuration.
3. Review credits and set an account spending limit in X before loading posts. No API credits are purchased and no X requests are made by setup or the test suite.

[X's current pricing documentation](https://docs.x.com/x-api/getting-started/pricing) lists prepaid, pay-per-use access: $0.005 per returned post and $0.010 per returned user. This integration requests author metadata, so user reads may also be charged. Rates can change; the Developer Console is authoritative. There is no guaranteed monthly cost cap in the application.

## Behavior and privacy

- The browser checks configuration without contacting X. A deliberate **Load posts** action requests up to ten results; there is no automatic paid polling, pagination, or retry.
- A server request uses [recent search](https://docs.x.com/x-api/posts/search/introduction) over the last 48 hours, newest first. It searches a quoted city plus a region/country disambiguator and selected warning, disruption and police terms; reposts and replies are excluded. This is keyword matching, not a verified geofence or a complete incident feed. Requiring the place disambiguator can omit posts that mention only the city.
- Only the selected coarse city, region and country go to X. No GPS coordinates, inventory, private plans or user credentials are sent. The bearer token travels only in the server Authorization header to the fixed official `api.x.com` endpoint, with redirects disabled.
- Results contain plain text, author name/handle, timestamp and a constructed X permalink. Render the text as text, never HTML. Posts can be unverified or outdated; they must not automatically become official alerts or establish that an area is safe/unsafe.
- [Official X embeds](https://help.x.com/en/using-x/embed-x-feed) support public profile/list timelines. They are an optional external display, not a substitute for filtered search data or a source for application-generated summaries.

## Access and operational limits

`GET /api/local-posts?action=status` returns `{configured:boolean}` only after same-origin workspace-owner authentication. The optional city/region/country tuple is validated if present. A missing token returns `configured:false`; it does not attempt an X request.

`GET /api/local-posts?action=search&city=Toronto&region=Ontario&countryCode=CA` requires the same owner authentication. Results have `{configured:true,fetchedAt,location,posts:[{id,text,createdAt,url,author:{username,name}}]}`. Authentication is checked again after results are available, including cached results. Private responses use `no-store` and have no cross-origin permission headers.

Successful results are cached for ten minutes per owner and normalized location; simultaneous identical requests share one upstream request. A warm process permits at most six new searches per owner and twenty total per ten minutes, with four simultaneous upstream requests, a 6.5-second timeout, a 256 KiB response limit, and no more than 32 cached locations. Failed calls count toward those process limits. These limits reset on restart and do not coordinate across deployed instances; **set the real spending limit in X**.

Errors are sanitized: `unauthorized` (401/403), `invalid_request` (400), `needs_connection` or `credits_required` (503), `rate_limited` (429), and `upstream_unavailable` (502). The client should keep official source links available and show a retry/setup state, not imply there are no incidents when a fetch fails. A successful empty result means no matching posts returned for this query, not an all-clear.

All local-post tests use synthetic responses and fake tokens. They verify authorization, input rejection, date bounds, result sanitation, request isolation and rate limits without making paid API calls.

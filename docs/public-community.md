# Public local reports

Location displays a short safety-focused list from public sources, separate from official police/city notices. No social account or paid API is needed. `GET /api/community-updates` accepts only a coarse city, region and country code; it never sends inventory, account credentials or precise coordinates to providers.

- X: public Google News RSS listings, with a Toronto Police Operations account search for Toronto and a city/region/country safety search. These are index snippets, not a live X API feed. The date is labeled **Google-listed**, not independently verified publication time; author identity is not inferred. Links open the indexed result.
- Reddit: the public r/toronto Atom feed supplies titles, canonical discussion links and original publication dates. No comments, usernames, private messages or popularity scores are collected. Other cities currently retain direct search links while their community feed is unsupported.
- Reddit announced that RSS support ends November 13, 2026. The reader falls back to public search-index listings when RSS is unavailable or retired. Index coverage can be sparse or empty; the UI exposes the source state and direct searches instead of inventing posts.

Selection uses explicit safety-topic matches and recency, with bounded candidates and a compact four-item preview. This is a reading priority, not a verified risk score or proof of danger. Retrospective trial/sentencing and entertainment headlines are excluded from Reddit matches. Duplicate links and equivalent long headlines are removed. Reports may describe incidents that are already resolved.

Public requests are cached for ten minutes per normalized city and coalesced while in progress. Each warm instance permits four simultaneous refreshes and sixteen new city refreshes per minute. Fetches have fixed hosts, no redirects, timeouts and byte limits. Provider failures remain distinguishable from successful empty feeds; neither means an all-clear.

The optional owner-only paid X endpoint remains unconfigured and is not used by this public-report view. See `local-posts-setup.md` only if paid API setup is resumed.

Sources: [X public embeds](https://help.x.com/en/using-x/embed-x-feed), [Reddit RSS retirement notice](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026).

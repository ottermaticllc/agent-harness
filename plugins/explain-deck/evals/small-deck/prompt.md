---
name: small-deck
runs: 1
max_turns: 30
---
Use the explain-deck skill. First save the text between the markers to notes/caching.md in the current folder. Then make an explainer deck on how the cache works from that file only, save it as explain-cache.html here, run the check script that ships with the skill on it, and tell me the result.

-----
# Acme site cache
The web app keeps a cache in front of its database. A page read takes about 120 ms from the database and 4 ms from the cache. The cache answers 92% of requests (one week, March).
Flow: the server looks up the key "product:42". On a hit it returns the stored page. On a miss it reads the database, stores the result, then returns it.
Each entry expires after 10 minutes (the TTL). Editing a product deletes that product's key at once. Editing a category does not clear the product pages in it, so they can be 10 minutes stale.
Web team owns keys and TTL. Data team owns the database. If the cache server restarts, the hit rate drops to 0% and the database carries the full load for about 5 minutes.
-----

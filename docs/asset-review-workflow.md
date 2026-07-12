# Asset Review Workflow

Use this workflow for every third-party asset, including anything discovered
through Sorcerers.

1. Place raw candidate files only in a local ignored quarantine folder, such as
   `assets-quarantine/sorcerers/raw/`.
2. Find the exact original source for the file. A repo credit list is not
   enough.
3. Verify the exact license on the original source page.
4. Reject the asset if the license is NonCommercial, personal-use-only,
   no-redistribution, unclear, GPL/AGPL/LGPL, CC-BY-SA, trademark/IP-derived,
   or otherwise incompatible with commercial mobile distribution.
5. If the license is allowed, add a complete entry to
   `legal/asset-manifest.json`, including the exact-file SHA-256.
6. Copy the reviewed asset into the correct `assets/` subfolder.
7. Update `legal/attribution.md` when attribution is required.
8. Run `npm run check:compliance`.

The first release should prefer CC0, public domain, owned, or paid commercial
assets. CC-BY is allowed only when the attribution surface is ready.

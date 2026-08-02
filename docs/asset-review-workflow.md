# Asset Review Workflow

Use this workflow for every third-party asset, including anything discovered
through Sorcerers.

Generated candidates follow the same exact-file gate, with additional evidence.
Before generation, the tool, bridge, model, VAE, LoRA, embedding, upscaler, and
custom nodes must be recorded and approved in
`legal/generation-component-manifest.json`. Preserve the untouched output in
ignored external quarantine and record its prompt, negative constraints,
inputs and hashes, workflow JSON and hash, seed, settings, service/job ID, and
output SHA-256. A pipeline smoke, generator success, or MCP `publish_asset`
result is not product approval and must not write into `assets/` or
`legal/asset-manifest.json`.

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

For a generated file, steps 2-4 review both the generation-component chain and
the output's visual/IP similarity. Steps 5-7 apply only after the exact output
passes that review. Rejected masters and all intermediate files remain outside
the runtime tree.

The first release should prefer CC0, public domain, owned, or paid commercial
assets. CC-BY is allowed only when the attribution surface is ready.

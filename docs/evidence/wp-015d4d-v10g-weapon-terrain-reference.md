# Frozen V10G weapon and terrain observations

Extracted from the owner-approved preparation contract at d11449d.
This carrier is frozen separately so the implementation contract can evolve.

### Reference observations and implementation boundary

Owner-authorized source inspection used the existing ignored Sorcerers checkout
at [`0f45c4920321c0a3a14de30fe5cf44131a38da89`](https://github.com/lorgan3/sorcerers/tree/0f45c4920321c0a3a14de30fe5cf44131a38da89).
The source remains GPL-3.0 quarantine/reference only. These are code-observed
behaviors, not evidence from playing or benchmarking Sorcerers:

| Inspected path under `src/data/` | Observation | V10G disposition |
| --- | --- | --- |
| `spells/fireball.ts`, `collision/simpleBody.ts` | Gravity, terrain bounces and intermediate/final explosions. | Distinct terrain responses inform the design; bouncing is deferred. |
| `spells/magicMissile.ts` | Steering changes direction and suppresses gravity while controlled; collision detonates. | Guided flight is deferred. |
| `spells/zoltraak.ts` | Straight beam cuts terrain; shields can stop it. Ordinary terrain is not its simple blocking boundary. | Do not cite it as proof of terrain-blocked precision fire. Needlepoint's blocking rule is a Worms product decision. |
| `damage/explosiveDamage.ts`, `map/terrain.ts` | Explosions remove collision material and apply radial damage/force; inspected target selection has no terrain-occlusion test. | Separate excavation and damage; choose Worms shielding from its cover requirements rather than inheriting this behavior. Knockback remains deferred. |
| `spells/iceWall.ts`, `spells/windBlast.ts`, `spells/bomb.ts` | Temporary collision obstacles, directional pushes and physical proximity-triggered explosives provide additional positional interactions. | All deferred from the first V10G implementation. |
| `damage/fallDamage.ts` (partial read); `spells/rock.ts`, `spells/pebble.ts`, `spells/hairpin.ts` (keyword inspection) | Ancillary observation only; no general falling-damage claim was established from the file name. | No adopted behavior. |

No source code, algorithm implementation, constants, identifiers, artwork, map,
or asset is admitted by this research. Runtime work must use this distilled
contract and local Worms code. The new observation is documented here instead
of changing the hash-bound V10F reference pack. Register this bounded reference
with WP-015D4D at implementation entry; no independent clean-room review is
claimed or required to reactivate retired agents.


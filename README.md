# PF2e Potion Effects

Apply a potion's native PF2e effect to the character drinking it, directly from inventory or the native chat Use button. A focused module with no toolbox dependency.

## Install

In Foundry Setup → Add-on Modules → Install Module, paste this manifest URL, install, then enable **PF2e Potion Effects** in the world:

```
https://github.com/jjthibau/pf2e-potion-effects/releases/latest/download/module.json
```

Tested on **Foundry VTT 14.369 / PF2e 8.6.0**. Foundry's normal module update workflow follows this repository's latest release.

## Supported effects

- Potion of Quickness applies native Haste.
- Explicit native effect UUID links in potion descriptions are resolved automatically. Multiple linked effects ask which one to apply.
- A **Potion effect UUID** field on the native potion sheet lets you choose an explicit effect. Leave it blank for automatic detection.
- The recipient is the character consuming its own inventory item, regardless of selected tokens or enemy targets. Effects survive consumption of the last potion and use PF2e's native duration, rules and expiry.

Healing-only potions keep native behavior. Unknown descriptions that link only spells are consumed normally; their effects are not guessed from prose. Repeated drinks create separate native effect instances and follow native stacking rules rather than merging durations.

## Scope

This does not automate every potion, oils, elixirs, poisons, general actions or spells. Complex effects requiring further choices have not all been validated. Avoid another module applying effects for the same consumption, which could duplicate them. Item Spellcasting is a separate optional module.

See [testing](docs/testing.md), [architecture](docs/architecture.md), [changelog](CHANGELOG.md) and [contributing](CONTRIBUTING.md). Original implementation under [MIT](LICENSE). Not affiliated with Paizo or Foundry Gaming; no licensed game content is bundled.

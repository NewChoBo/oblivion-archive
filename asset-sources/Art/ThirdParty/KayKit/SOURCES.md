# KayKit Adventurers 1.0

Kay Lousberg supplied the hooded character, embedded texture, rig and animation clips under CC0. The game uses its own wand and rune bow.

`scribe-palette.png` is the project adaptation of the embedded color atlas. Green cloth swatches are remapped to slate blue. The original GLB retains its embedded atlas.

- [Original character and animations](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/672074b73ba276876a19e8816ecdc5241817ab47/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue_Hooded.glb)
- [License at the same revision](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/672074b73ba276876a19e8816ecdc5241817ab47/LICENSE.txt)
- GLB SHA-256 `93e6e25213009952276d9cf34f5d96a243767334c66f280db0433ddfabb91545`

## Run & Raid

The four runners use Knight, Mage, Rogue and Rogue_Hooded from [the same pinned character directory](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/tree/672074b73ba276876a19e8816ecdc5241817ab47/addons/kaykit_character_pack_adventures/Characters/gltf). [Artist and usage terms](https://kaylousberg.itch.io/kaykit-adventurers).

Run `npm run assets` in `babylon/` to equip the characters and export nine named gameplay motions per rig, including the original textures. The raid renderer adds Hammer's warhammer and Jade's crystal branch at their animated hand sockets. The output paths, source files and hashes are registered in `public/assets/manifest.json`.

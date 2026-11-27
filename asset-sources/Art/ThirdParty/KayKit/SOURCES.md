# KayKit Adventurers 1.0

Kay Lousberg supplied the hooded character, embedded texture, rig and animation clips under CC0. The game uses its own wand and rune bow.

`scribe-palette.png` is the project adaptation of the embedded color atlas. Green cloth swatches are remapped to slate blue. The original GLB retains its embedded atlas.

- [Original character and animations](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/672074b73ba276876a19e8816ecdc5241817ab47/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue_Hooded.glb)
- [License at the same revision](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/blob/672074b73ba276876a19e8816ecdc5241817ab47/LICENSE.txt)
- GLB SHA-256 `93e6e25213009952276d9cf34f5d96a243767334c66f280db0433ddfabb91545`

## Run & Raid

Hammer, Abyss, Longshot, Jade and Rend use Knight, Mage, Rogue, Rogue_Hooded and Barbarian from [the same pinned character directory](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/tree/672074b73ba276876a19e8816ecdc5241817ab47/addons/kaykit_character_pack_adventures/Characters/gltf). [Artist and usage terms](https://kaylousberg.itch.io/kaykit-adventurers).

Run `npm run assets` in `babylon/` to equip the characters and export nine named gameplay motions per rig, including the original textures. The raid renderer adds Hammer's warhammer and Jade's crystal branch at their animated hand sockets. Bastion and Rime use Skeleton_Warrior and Skeleton_Mage from [KayKit Skeletons, pinned revision](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0/tree/15b62b9bad122f72926c10fb14d622c73819fa54/addons/kaykit_character_pack_skeletons/Characters/gltf). The original GLBs and the upstream CC0 notice `Skeletons-LICENSE.txt` are in this directory. The renderer equips their hand sockets. [Artist and usage terms](https://kaylousberg.com/game-assets/characters-skeletons)

Rildin equips the Knight's two-handed sword and wears a red cape. Kaiken uses the hooded Rogue with a pale cloak and a single-edged blade. Swift uses the unhooded Rogue with a teal cape and a cup-hilt rapier. Both custom blades attach to the animated right hand.

Kali equips the hooded Rogue's Knife and Knife_Offhand. Her stab, slice and overhead chop use the original dual-wield animations. The alternate texture `kali-palette.png` derives from the embedded Rogue_Hooded atlas. In the green cloth rectangles (0,256)–(256,512) and (128,512)–(256,768), its normalized HSV is (0.757, 0.62, 0.11 + 0.88 × original value). The model exporter embeds this palette and the renderer supplies the matching cape and blade sweeps.

The lobby portraits are renders of the equipped gameplay models. After rebuilding the GLBs, run the Babylon dev server and open `/tools/raid-portraits.html`. Save the rendered WebPs under `asset-sources/Art/RunAndRaid/portraits/`, then run `npm run assets` to publish them. The output paths, source files and hashes are registered in `public/assets/manifest.json`.

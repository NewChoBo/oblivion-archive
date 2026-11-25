# Stair clearance, camera aim and surface impacts

Base: `be31dcf2bb8cc2732b7def9d7166c652f2b823ba`. Branch: `NewChoBo/chapter1-motion`.

Code commits: `e6c61bc` (stair/headroom/view clearance), `5e8d738` (aim and retained impacts).
`main.js` is unchanged; the only `weapons.js` change is its clearance-helper import. No ammunition, inventory, save logic or ROOM_OF_DARK files were edited.

## Reproductions and fixes

Both authored stair flights share large sloped collider meshes. Their axis-aligned bounds include empty space above the lower steps. The old posture check filled those bounds and rejected standing under the open sky. The old torch sweep also filled them, contracted the whole camera-relative rig to `0.001`, and made the hands disappear. The wand remained visible on the same route: its first-person rig does not use that torch contraction.

`collider-contact.js` now checks the actual world-space triangles. Posture expansion tests only the additional upper volume of the taller ellipsoid; foot contact with the slope remains valid. View clearance sweeps the camera/torch radius against triangle faces and edges, including growth of the flame as the rig expands. Thin walls, genuine low ceilings and moving geometry remain obstructive. `player-view.js` uses the same surface-aware clearance for the shoulder camera and torch hand.

Two aiming failures were reproduced before the fix: a 9m narrow target could be hit in first person but missed from a shoulder camera 2.85m behind the player, and a same-frame camera turn reused the old cached target. The aim query now reaches 30m from the camera and refreshes on camera pose changes and on firing. The wand still travels at most 10m from its real muzzle; arrows keep their existing draw-dependent speed, gravity and 26m swept path. Every shot retains eye-to-tip obstruction and muzzle-to-first-surface checks. Shot telemetry records camera origin/direction, intended world point, actual muzzle, launch direction and actual impact.

Arrows lodged in stone/wood remain 18 seconds and wand seals remain 6 seconds; their last 2/1 seconds fade. Up to 24 retained impacts live independently of the 10 reusable flight/burst slots, evicting the oldest if full. Each retained visual follows the struck mesh's translation, rotation and scale. Metal/ink arrow hits preserve their transient response. Existing projectile trails, glows, rings, surface chips, impact callbacks and sounds remain. Disabled/disposed surfaces and reset dispose their retained visuals without destroying reusable burst meshes.

## Official references and design decisions

- Epic's original [ShooterGame sample](https://dev.epicgames.com/documentation/en-us/unreal-engine/shooter-game?application_version=4.27) traces from the camera to the first crosshair hit and adjusts projectile launch direction toward that point. This supports a world-space camera aim point; the game's actual projectile still determines impact.
- Unity's official [Third Person Aim documentation](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineThirdPersonAim.html) describes camera/firing-origin parallax and a separate obstruction check from the player. Applied here as camera target selection followed by physical muzzle-path collision, including low cover. This is an implementation choice for this game, not a claim that every referenced game uses identical ballistics.

No gravity compensation or aim magnetism was added: the bow's drop remains intentional. A target visible above low cover can still be blocked from the weapon.

## Automated evidence

- `npm test`: final suite 88/88 passed.
- `npm run build`: game and gallery succeeded; existing large-bundle warnings remain.
- After the final world-matrix adjustment, movement/clearance checks passed 8/8 and both builds passed again.
- New regressions cover both real stair flights and postures, both shoulder offsets, growing flame and thin-wall/edge clearance, moving colliders, world-coordinate target convergence, same-frame camera turns, low cover, eye-to-tip obstruction, impact lifetime/fading, transformed moving surfaces, bounded allocation, disposal and reset.
- Existing bow tests retain per-shot draw strength, gravity drop, moving-target sweep and release animation checks.

## Orca browser evidence

Browser: Orca embedded browser only, 1280 x 720. Movement used routed native key/mouse events and the normal player controller; no teleportation or gameplay-state injection. The before build was the unmodified base served by Vite at port 5187. The after build is the production bundle recorded in [after/bundle.txt](after/bundle.txt), served at port 4187. Snapshot/recording instrumentation only observes state and captures the canvas/audio.

Before captures: [failed stand attempt](before/slope-stand-attempt.png), [torch recovered higher on the flight](before/torch-up.png), [collapsed torch returning](before/torch-down.png), [walk recording](before/movement.webm), [torch recording](before/torch-stairs.webm).

After captures: [standing on the slope](after/slope-stand-attempt.png), [torch up](after/torch-up.png), [torch down](after/torch-down.png), [crouched torch lower on the slope](after/torch-crouched-lower.png), [crouched torch higher on the slope](after/torch-crouched-upper.png), [retained arrows](after/retained-arrow.png), [quick arrow](after/arrow-tap.png).

Recordings: [complete after walk](after/movement.webm), [first/left/right aim and impacts](after/aim-impacts.webm), [crouched torch and native bow tap](after/crouch-torch-and-tap.webm). Machine-checked observations and source SHA-256 hashes are in [checks.json](checks.json); `node tools/motion-combat-receipt.mjs` regenerates that receipt.

| Observation | Before | After |
| --- | --- | --- |
| Same open first stair flight, C then C | Remained crouched; headroom warning visible | Returned to standing |
| Torch lower on the flight | Model contracted to 0.001 scale | Scale 1 throughout 179 sampled torch frames; standing and crouched captures visible |
| Wand camera target vs first impact | Regression tests reproduced range/cache misses | Native first/left/right shots matched the intended point within 4e-16m |
| Arrow lodged in stone | Transient, less than one second | Visible at ages 6.86s and 14.99s in a retained-arrow snapshot |
| Native bow tap and full draw | Existing ballistic behavior retained in tests | Actual measured power 0.000818 and 1, both hit the first terrain surface |

The attempted 120ms native hold in the main aim recording measured power 1 because command latency kept the button down longer. The separate single-click capture verified an actual quick release; requested sleep duration is not treated as draw evidence.

To reproduce the movement recording, start the dedicated production tab on the citadel arrival island with explicit free-look, then run `tools/motion-combat-acceptance.ps1 -PageId <id> -Version after`. The aim script runs at the resulting stair position. The extra crouched/tap recording used the same normal movement and mouse routes. The page is left paused at the stairs, and its preview/dev terminals remain available on ports 4187/5187.

Moving/rotating/scaling impact attachment, exact fade/expiry timing, all low-cover/eye-to-tip edge cases, and the complete draw-strength matrix were verified with real Babylon meshes in NullEngine tests. Those full matrices were not repeated visually in Orca. Left-handed combat and pointer lock were not tested in this run; all browser play used explicit free-look. The tests/build do not establish native-wrapper acceptance or performance benchmarking.

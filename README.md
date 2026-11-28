# Rift Ranger

A browser arcade battle. Raise your right hand above your shoulder to attack or your left hand to shield against the Riftbeast's eye lasers. A green flash is followed by yellow and red, a yellow flash only by red, and a red flash is the last warning before the shot. The starting colour varies by strike. Slashes have no cooldown. You can lower and re-raise your right hand to slash again, even straight out of a block. A successful block banks one Powerwave for the round. The count appears under Ranger HP. Raise both hands to spend one charge and send three ripples through the arena. Hum, whistle, or sing to charge Aura, then click your tongue or clap to fire a laser. After the mic picks up sustained sound, the three stages arrive at about 0.6, 1.7, and 4 seconds. Keyboard and touch charging reach them at 0.8, 2.4, and 5.6 seconds. They deal 1×, 2×, or 4× laser damage. Firing spends the meter.

The Riftbeast alternates eye lasers with a flamethrower. A slash knocks the fireball back one color. Stage 1, 2, and 3 lasers knock it back 2, 3, and 4 colors respectively. Cooling past red cancels the charge. White is the final cue to guard. The flamethrower hits for 10 HP and burns for 1 HP per second until you heal with aura. Blocking the burst banks a Powerwave.

Some flamethrower charges include a guard-breaking eye laser early in blue. After opening zero, one, two, or three locks, the chance is 15%, 40%, 75%, or 100% in camera mode, and 45%, 65%, 90%, or 100% in keyboard and mobile. Keyboard and mobile have shorter gaps between attacks and a 35% chance to open with a flamethrower. The full flamethrower tell still plays. The shield absorbs the guard-breaking laser, banks a Powerwave, and shatters. Lower and raise your left hand again, or release and re-press S, to block the fire. Interrupting the charge before the laser fires cancels both attacks.

The Riftbeast shouts after four regular attacks above 40 HP, or three at 40 HP or below. An interrupted flamethrower still counts. The boss pulls in air for 0.8 seconds, pauses, then sends a shockwave. It uses no other attacks during the wind-up. The shout deals no damage and cannot be blocked or interrupted. Gold Aura absorbs it and drops to purple. Otherwise, the Ranger drops to their right knee and cannot attack until they use Powerwave / Heal with Stage 1 Aura or higher. This works at full HP and preserves banked Powerwaves. You can still block and charge Aura while Shaken. The boss resumes its regular attacks after the shout and skips a shout if you are already Shaken.

Player lasers match the Aura they spend. Cyan, purple, and gold beams get progressively wider.

The Riftbeast has locks at 40, 20, and 10 HP that require 2, 4, and 6 slashes, power waves, or laser credits respectively. Each run shuffles the required moves between those locks. Progress starts when you first reach each lock. The health display shows which move is needed and how many hits or credits are left. A Stage 1, 2, or 3 laser earns 1, 2, or 4 laser credits respectively. As the boss loses HP, its eye lasers come sooner and the player's attacks do less damage. An unblocked boss laser deals 19 HP at any boss health. Recovery begins sooner and restores HP more often when the boss is low. It can heal while a lock is active, but the lock keeps its progress. Opened locks stay open.

Slash and aura beam damage scale down to a floor of 55% before rounding. Power waves taper more sharply and deal at most 9 damage at 20 boss HP or less. A slash or power counter that gets past the locks always deals at least 1 HP.

A win shows your Power Level, clear time, damage taken, and how the Power Level was calculated. Speed earns up to 6,000 points (6,000 × 60 ÷ (60 + elapsed seconds), rounded). Health earns up to 4,000 points, reduced by 40 points per HP of total damage taken and floored at zero. Keeping the camera active and clearing without keyboard combat inputs adds 20% to that subtotal, rounded to the nearest point. Microphone moves are allowed.

## Play locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` in this folder and open [the game](http://localhost:8765/) in a current desktop browser. Choose **Enable camera + mic** and grant permissions, or choose **Play with keyboard**. Keep your shoulders and any raised hand in view. Your resting hand can be out of frame. The keyboard works in both modes.

| Input | Move |
| --- | --- |
| Hold S | Block |
| Hold D briefly | Spend a banked Powerwave and heal with charged Aura if needed |
| Hold Space | Charge Aura |
| Hold J briefly | Fire a short laser |
| Hold K briefly | Slash |

Keyboard and touch actions begin with a visible wind-up. Hold Block, Slash, Laser, or Powerwave / Heal for **200 ms** to commit. Release early to feint. After Block commits, the shield stays up for up to **3 seconds**. Cracks spread before it shatters. Release at any time to reset it, then hold Block again to form a fresh shield. Aura starts charging immediately, and camera gestures and microphone cues use their existing timing.

Choose **Play on mobile** for five touch buttons in a 2–1–2 layout: Powerwave / Heal above Block on the left, Aura in the center, and Laser above Slash on the right. Multiple fingers can hold and attack at the same time. The keyboard start option also enables these controls on touch-first devices. Mobile mode works with **Start Tutorial**, with touch-specific instructions. Warnings sit below the arena so they cannot cover the boss. Lock requirements and progress always remain visible below the arena. Use **Hide warning / Show warning** in any mode to toggle the boss warning. Mobile reserves space for it so the controls stay in place. Aura changes colour as it charges: cyan for Stage 1, purple for Stage 2, and gold for Stage 3. The character glow and mobile Aura button share those colours, with a stage number and laser multiplier for clarity. Spending Aura clears the glow. The character shows successful moves; brief notices explain unavailable moves. Camera mode retains the recognized pose silhouette.

Raise both hands to spend one banked Powerwave. The same action also spends charged Aura if you are injured or burning, even when a Powerwave fires. Aura heals 5, 10, or 20 HP at stages 1, 2, or 3 and clears burning. You can heal with an empty Powerwave stock. Healing never erases damage already taken from the Power Level calculation.

Camera mode requests the camera and microphone together and can run without the mic if access fails. In keyboard mode, hold Space to charge Aura and hold J briefly to fire. Stay quiet briefly while the mic calibrates. The character glow and small stage label show Aura charge; the left panel shows mic input level and whether your sound is charging Aura. Pitch does not affect charging. A sustained new room sound above the calibrated level can also charge it. Mic charging pauses during a beam and briefly afterward. A browser connection is needed to download the pinned MediaPipe runtime and pose model. Camera frames and microphone samples are processed in the browser. The game stops device access when the round or session ends.

Choose **Start Tutorial**, then start with camera or keyboard. Complete each prompted move to advance, from slashing and blocking to charging and firing a laser. The final lessons teach all three lock types without health loss or a Power Level penalty. Sustain a sound to charge, then click your tongue or clap to fire. Space and J work too.

## Boss options and fight IDs

Open **Boss options** to pick a body or roll one at random. The roster includes the Riftbeast, Barkjaw, Iron Beetle, The Duelist, Rift Raccoon, Coilfang, Rift Slime, Tidewhale, and Moon Owl. All nine use the same prototype moves, while their body stats change the fight. The effects attach to each body's own eyes and mouth.

Open **Training Mode** to choose a boss and train with camera, keyboard, or touch. In the session, choose a **Boss move** and use **Add move** to queue up to three moves. **Run queue** plays them in order. Tap a queued move to remove it, or run the same queue again to practice another response. The boss waits when the queue is inactive, keeps the damage it takes, and has no locks or passive healing. The session ends when either fighter reaches zero HP. Eye Lasers, Flame Breath, and Shout are available. Flame Breath plays on its own for counter practice.

Set **Ranger colour** on the start screen. Your browser remembers the armour colour for the next session. Aura colours still show your current charge stage.

Copy the **Fight ID** below the battle and send it to a friend. They can paste it under **Boss options** or open a URL such as `?boss=RR1-T-LFS-SPL`. Attack rolls still vary within the same configuration.

| Piece | Meaning |
| --- | --- |
| `RR1` | Rift Ranger fight ID format, version 1. |
| `T` | The body. The letters are `R` Riftbeast, `T` tree, `B` beetle, `H` human, `D` raccoon, `S` serpent, `G` slime, `W` whale, and `O` owl. |
| `LFS` | Eye Lasers, Flame Breath, and Shout in the Regular, Special, and Status slots. |
| `SPL` | Slash, Powerwave, and Laser locks in order from highest HP to lowest. Iron Beetle adds its 65 HP lock at the front. Rift Slime skips the 20 HP lock. |

The parser checks the body, move set, and lock count. Iron Beetle requires four letters, such as `RR1-B-LFS-PSPL`. Rift Slime requires two distinct letters, such as `RR1-G-LFS-PL`. Other bodies require three distinct letters. Iron Beetle’s three standard locks must also be distinct.

| Body | Starting balance |
| --- | --- |
| The Riftbeast | Baseline. |
| Barkjaw | 30% shorter healing intervals and 25% weaker hits. |
| Iron Beetle | An extra lock at 65 HP, with 650 ms longer gaps before attacks. |
| The Duelist | 250 ms shorter gaps before Status moves and 20% weaker Specials. |
| Rift Raccoon | 85 HP and gaps up to 450 ms shorter. |
| Coilfang | 25% harder Regular hits and 35% longer healing intervals. |
| Rift Slime | 150 HP and two locks at 40 and 10 HP. |
| Tidewhale | Specials hit 35% harder, followed by 650 ms extra recovery. |
| Moon Owl | Up to 550 ms shorter recovery after Specials and 450 ms longer after Regulars. |

Gap modifiers never shorten a move's warning. Damage modifiers apply to direct hits. Burn uses the same tick damage.

## Reading the code

The [architecture guide](ARCHITECTURE.md) maps the modules and explains the round lifecycle.

- `index.html` defines the HUD, controls, and canvases. `style.css` lays them out and keeps the arena fixed during play.
- `game.mjs` connects events to the game modules and runs `tick()`. `game-menu.mjs` handles menus and `game-sessions.mjs` starts, finishes, and tears down rounds.
- `combat-round.mjs` owns combat state and outcomes. `round-drills.mjs` runs the scripted tutorial and training sequences.
- `boss-fights.mjs` encodes a fight configuration. `boss-bodies.mjs` defines the roster and effect attachment points. `boss-profiles.mjs` defines the stat tradeoffs. `boss-body-art.mjs` paints the modular sprites.
- `boss-attacks.mjs` owns the Riftbeast’s move slots, attack timing, and flame charge rules. `boss-locks.mjs` owns the shuffled health gates.
- `battle-view.mjs` presents combat state through the canvas and `battle-hud.mjs`.
- `camera-session.mjs` handles permissions, starts and stops streams, and samples the camera and mic.
- `mobile-controls.mjs` handles simultaneous touch and keyboard inputs, including cancellation and focus loss. Run its checks with `node --test tests/mobile-controls.test.mjs`.
- `controls.mjs` turns camera landmarks and microphone samples into pose, sustained sound, and Laser input.
- `beast.mjs` draws the boss sprite and defines its effect attachment points. `combat-art.mjs` composes the scene and player effects. `boss-effects.mjs` draws attacks using the boss’s eye and mouth anchors. `poses.svg` provides the small pose icons.

## Working on the game

Start at `tick()` in `game.mjs` for the frame flow, or at `start()` in `game-sessions.mjs` for setup. Touch and key input arrives as named actions. The camera session emits pose and audio samples. `combat-round.mjs` resolves those inputs with boss scheduling, locks, and status rules. The battle view presents that state through the HUD and the canvas.

To add a boss attack, add its timing, tell, and outcome to the move definitions in `boss-attacks.mjs`, then put its ID in a boss's Regular, Special, or Status slot. Reuse the guardable outcome for ordinary damage and choose a distinct resolver only for a new game rule. Put new canvas effects in `boss-effects.mjs`. Both tell and hit graphics should use the boss's anchors. Tutorial lessons can provide a separate `mobileHint` when a touch instruction differs.

Run the unit tests with Node 20 or newer:

```sh
npm test
```

For the Firefox smoke tests, install the pinned Playwright dependency and its browser once:

```sh
npm ci
npx playwright install firefox
npm run test:browser
```

The smoke tests load the local game directly and exercise desktop combat, the mobile tutorial, and fight ID replay. Set `RANGER_TEST_URL` to check a preview or deployed build instead.

## Publish on GitHub Pages

Push these files to a repository. Under **Settings → Pages**, choose **Deploy from a branch** and select your branch and **/(root)**. Open the HTTPS URL shown by Pages. No build or application server is needed. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

# Rift Ranger

A browser arcade battle. Raise your right hand above your shoulder to attack or your left hand to shield against the Riftbeast's eye lasers. A green flash is followed by yellow and red, a yellow flash only by red, and a red flash is the last warning before the shot. The starting colour varies by strike. Slashes have no cooldown. You can lower and re-raise your right hand to slash again, even straight out of a block. After a successful block, raise both hands to send three ripples through the arena. Hum to charge aura, then clap once to fire a short laser. The three stages take an additional 0.8, 1.6, and 3.2 seconds of humming and deal 1×, 2×, or 4× damage. Firing spends the meter.

The Riftbeast alternates eye lasers with a flamethrower. A slash knocks the fireball back one color. Stage 1, 2, and 3 lasers knock it back 2, 3, and 4 colors respectively. Cooling past red cancels the charge. White is the final cue to guard. The flamethrower hits for 10 HP and burns for 1 HP per second until you heal with aura. A guard blocks the burst and opens a power counter.

Some flamethrower charges include a guard-breaking eye laser early in blue. The chance is 15%, 40%, 75%, or 100% after opening zero, one, two, or three locks. The shield absorbs the laser and shatters. Lower and raise your left hand again, or release and re-press S, to block the fire. Interrupting the charge before the laser fires cancels both attacks.

The boss has locks at 40, 20, and 10 HP that require 2, 4, and 6 slashes, power waves, or laser credits respectively. Each run shuffles the required moves between those locks. Progress starts when you first reach each lock. The health display shows which move is needed and how many hits or credits are left. A Stage 1, 2, or 3 laser earns 1, 2, or 4 laser credits respectively. As the boss loses HP, its eye lasers come sooner and the player's attacks do less damage. An unblocked boss laser deals 19 HP at any boss health. Recovery begins sooner and restores HP more often when the boss is low. It can heal while a lock is active, but the lock keeps its progress. Opened locks stay open.

Slash and aura beam damage scale down to a floor of 55% before rounding. Power waves taper more sharply and deal at most 9 damage at 20 boss HP or less. A slash or power counter that gets past the locks always deals at least 1 HP.

A win shows your Power Level, clear time, damage taken, and how the Power Level was calculated. Speed earns up to 6,000 points (6,000 × 60 ÷ (60 + elapsed seconds), rounded). Health earns up to 4,000 points, reduced by 40 points per HP of total damage taken and floored at zero. Keeping the camera active and clearing without keyboard combat inputs adds 20% to that subtotal, rounded to the nearest point. Microphone moves are allowed.

## Play locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` in this folder and open [the game](http://localhost:8765/) in a current desktop browser. Choose **Enable camera + mic** and grant permissions, or choose **Play with keyboard**. Keep your shoulders and any raised hand in view. Your resting hand can be out of frame. The keyboard works in both modes.

| Input | Move |
| --- | --- |
| A | Basic attack |
| Hold S | Guard |
| D | Power counter if ready, otherwise heal with aura |
| F | Fire a short laser |
| Hold G | Build aura |

Choose **Play on mobile** for five touch buttons in a 2–1–2 layout: Powerwave / Heal above Block on the left, Aura in the center, and Laser above Slash on the right. Hold Block to guard and hold Aura to charge; tap the other three buttons. Multiple fingers can hold and attack at the same time. The keyboard start option also enables these controls on touch-first devices. Mobile mode works with **Start Tutorial**, with touch-specific instructions.

Raise both hands to power counter if one is ready. Otherwise, the same pose spends aura to heal 5, 10, or 20 HP at stages 1, 2, or 3. Healing never erases damage already taken from the Power Level calculation.

Camera mode requests the camera and microphone together and can run without the mic if access fails. In keyboard mode, hold G to charge aura and press F to fire. Stay quiet briefly while the mic calibrates. The left panel shows the aura meter, mic input level, and whether the game hears a steady hum. Humming is ignored during a beam and briefly afterward so steady background noise can settle. A browser connection is needed to download the pinned MediaPipe runtime and pose model. Camera frames and microphone samples are processed in the browser. The game stops device access when the round or session ends.

Choose **Start Tutorial**, then start with camera or keyboard. Complete each prompted move to advance, from slashing and blocking to charging and firing a laser. The final lessons teach all three lock types without health loss or a Power Level penalty. Hum and clap with the mic, or use G and F.

## Reading the code

- `index.html` defines the HUD, controls, and canvases. `style.css` lays them out and keeps the arena fixed during play.
- `game.mjs` owns the round and ties input, damage, healing, score, and display together. Start with `startRound()` and `tick()`.
- `mobile-controls.mjs` handles simultaneous touch and keyboard inputs, including cancellation and focus loss. Run its checks with `node --test tests/mobile-controls.test.mjs`.
- `controls.mjs` turns camera landmarks and microphone samples into pose, hum, and clap events.
- `boss-locks.mjs` owns the shuffled health gates and their persistent progress.
- `beast.mjs` draws the boss sprite. `combat-art.mjs` animates the ranger, shield, beams, and ripples. `poses.svg` provides the small pose icons.

## Publish on GitHub Pages

Push these files to a repository. Under **Settings → Pages**, choose **Deploy from a branch** and select your branch and **/(root)**. Open the HTTPS URL shown by Pages. No build or application server is needed. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

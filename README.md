# Rift Ranger

A browser arcade battle. Raise your right hand above your shoulder to attack or your left hand to shield against the Riftbeast's eye lasers. A green flash is followed by yellow and red, a yellow flash only by red, and a red flash is the last warning before the shot. The starting colour varies by strike. Slashes have no cooldown. You can lower and re-raise your right hand to slash again, even straight out of a block. After a successful block, raise both hands to send three ripples through the arena. Hum to build aura, then clap repeatedly to sustain an energy beam. Aura drains at the same rate it charges, and any unspent aura stays available when you stop.

The boss has locks at 40, 20, and 10 HP that require 2, 4, and 6 qualifying attacks respectively. Each run shuffles slashes, power waves, and lasers between those locks. Progress starts when you first reach each lock. The health display shows which move is needed and how many are left. Laser locks count short lasers. Any beam that spends aura without draining a full meter counts as one short laser. Drain a full meter in one uninterrupted beam to earn five short-laser credits. Beam damage still depends on the aura spent. As the boss loses HP, it fires more often and the player's attacks do less damage. An unblocked boss laser deals 19 HP at any boss health. Recovery begins sooner and restores HP more often when the boss is low. It can heal while a lock is active, but the lock keeps its progress. Opened locks stay open.

Slash and aura beam damage scale down to a floor of 55% before rounding. Power waves taper more sharply and deal at most 9 damage at 20 boss HP or less. A slash or power counter that gets past the locks always deals at least 1 HP.

A win shows your Power Level, clear time, damage taken, and how the Power Level was calculated. Speed earns up to 6,000 points (6,000 × 60 ÷ (60 + elapsed seconds), rounded). Remaining health earns up to 4,000 points (40 points per HP). Keeping the camera active and clearing without keyboard combat inputs adds 20% to that subtotal, rounded to the nearest point. Microphone moves are allowed.

## Play locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` in this folder and open [the game](http://localhost:8765/) in a current desktop browser. Choose **Enable camera + mic** and grant permissions, or choose **Play with keyboard**. Keep your shoulders and any raised hand in view. Your resting hand can be out of frame. The keyboard works in both modes.

| Input | Move |
| --- | --- |
| A | Basic attack |
| Hold S | Guard |
| D | Power counter after blocking |
| Hold F | Sustain the aura beam |
| Hold G | Build aura |

Camera mode requests the camera and microphone together and can run without the mic if access fails. In keyboard mode, hold G to charge aura and F to fire. Stay quiet briefly while the mic calibrates. The left panel shows the aura meter, mic input level, and whether the game hears a steady hum. Humming is ignored during a beam and briefly afterward so steady background noise can settle. A browser connection is needed to download the pinned MediaPipe runtime and pose model. Camera frames and microphone samples are processed in the browser. The game stops device access when the round or session ends.

Choose **Start Tutorial**, then start with camera or keyboard. Complete each prompted move to advance, from slashing and blocking to charging and firing a laser. The final lessons teach all three lock types without health loss or a Power Level penalty. Hum and clap with the mic, or use G and F.

## Reading the code

- `index.html` defines the HUD, controls, and canvases. `style.css` lays them out and keeps the arena fixed during play.
- `game.mjs` owns the round and ties input, damage, healing, score, and display together. Start with `startRound()` and `tick()`.
- `controls.mjs` turns camera landmarks and microphone samples into pose, hum, and clap events.
- `boss-locks.mjs` owns the shuffled health gates and their persistent progress.
- `beast.mjs` draws the boss sprite. `combat-art.mjs` animates the ranger, shield, beams, and ripples. `poses.svg` provides the small pose icons.

## Publish on GitHub Pages

Push these files to a repository. Under **Settings → Pages**, choose **Deploy from a branch** and select your branch and **/(root)**. Open the HTTPS URL shown by Pages. No build or application server is needed. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

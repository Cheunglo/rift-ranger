# Rift Ranger

A browser arcade battle. Raise your right hand above your shoulder to attack or your left hand to shield against the Riftbeast's eye lasers. After a successful block, raise both hands to send three ripples through the arena. Hum to build aura, then clap repeatedly to sustain an energy beam. Aura drains at the same rate it charges, and any unspent aura stays available when you stop.

The boss has locks at 40, 20, and 10 HP that require 2, 4, and 6 qualifying attacks respectively. Each run shuffles slashes, power waves, and lasers between those locks. Progress starts when you first reach each lock. The health display shows which move is needed and how many are left. A long laser spends one full aura meter in one uninterrupted beam. A short laser spends at least half a meter without emptying a full one, and two shorts count as one long. Smaller beams still damage unprotected HP. As the boss loses HP, it fires more often and the player's attacks do less damage. An unblocked boss laser deals 19 HP at any boss health. Recovery begins sooner and restores HP more often when the boss is low. It can heal while a lock is active, but the lock keeps its progress. Opened locks stay open.

Slash and aura beam damage scale down to a floor of 55% before rounding. Power waves taper more sharply and deal at most 9 damage at 20 boss HP or less. A slash or power counter that gets past the locks always deals at least 1 HP.

A win shows the score, clear time, and damage taken. The score adds up to 6,000 points for speed (6,000 × 60 ÷ (60 + elapsed seconds), rounded) and up to 4,000 for remaining health (40 points per HP).

## Play locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` in this folder and open [the game](http://localhost:8765/) in a current desktop browser. Choose **Enable camera** and grant permission, or choose **Play with keyboard**. Keep your shoulders and any raised hand in view. Your resting hand can be out of frame. The keyboard works in both modes.

| Input | Move |
| --- | --- |
| A | Basic attack |
| Hold S | Guard |
| D | Power counter after blocking |
| Hold F | Sustain the aura beam |
| Hold G | Build aura |

Choose **Enable microphone** on the start screen or below the boss warning and grant browser permission to use sound controls. Stay quiet briefly while the mic calibrates. The left panel shows the aura meter, mic input level, and whether the game hears a steady hum. Humming is ignored during a beam and briefly afterward so steady background noise can settle. A browser connection is needed to download the pinned MediaPipe runtime and pose model. Camera frames and microphone samples are processed in the browser. The game stops device access when the round or session ends.

Select **Practice mode** before starting a camera or keyboard session to try every move without health loss. Choose **Test a laser attack** to practice guarding, then follow a successful block with a power counter.

## Reading the code

- `index.html` defines the HUD, controls, and canvases. `style.css` lays them out and keeps the arena fixed during play.
- `game.mjs` owns the round and ties input, damage, healing, score, and display together. Start with `startRound()` and `tick()`.
- `controls.mjs` turns camera landmarks and microphone samples into pose, hum, and clap events.
- `boss-locks.mjs` owns the shuffled health gates and their persistent progress.
- `beast.mjs` draws the boss sprite. `combat-art.mjs` animates the ranger, shield, beams, and ripples. `poses.svg` provides the small pose icons.

## Publish on GitHub Pages

Push these files to a repository. Under **Settings → Pages**, choose **Deploy from a branch** and select your branch and **/(root)**. Open the HTTPS URL shown by Pages. No build or application server is needed. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

# Rift Ranger

A browser arcade battle. Raise your right hand above your shoulder to attack or your left hand to shield against the Riftbeast's eye lasers. A green flash is followed by yellow and red, a yellow flash only by red, and a red flash is the last warning before the shot. The starting colour varies by strike. Slashes have no cooldown. You can lower and re-raise your right hand to slash again, even straight out of a block. A successful block banks one Powerwave for the round. The count appears under Ranger HP. Raise both hands to spend one charge and send three ripples through the arena. Hum, whistle, or sing to charge Aura, then clap once to fire a short laser. After the mic picks up sustained sound, the three stages arrive at about 0.6, 1.7, and 4 seconds. Keyboard and touch charging reach them at 0.8, 2.4, and 5.6 seconds. They deal 1×, 2×, or 4× laser damage. Firing spends the meter.

The Riftbeast alternates eye lasers with a flamethrower. A slash knocks the fireball back one color. Stage 1, 2, and 3 lasers knock it back 2, 3, and 4 colors respectively. Cooling past red cancels the charge. White is the final cue to guard. The flamethrower hits for 10 HP and burns for 1 HP per second until you heal with aura. Blocking the burst banks a Powerwave.

Some flamethrower charges include a guard-breaking eye laser early in blue. After opening zero, one, two, or three locks, the chance is 15%, 40%, 75%, or 100% in camera mode, and 45%, 65%, 90%, or 100% in keyboard and mobile. Keyboard and mobile have shorter gaps between attacks and a 35% chance to open with a flamethrower. The full flamethrower tell still plays. The shield absorbs the guard-breaking laser, banks a Powerwave, and shatters. Lower and raise your left hand again, or release and re-press S, to block the fire. Interrupting the charge before the laser fires cancels both attacks.

The Riftbeast shouts after four regular attacks above 40 HP, or three at 40 HP or below. An interrupted flamethrower still counts. The boss pulls in air for 0.8 seconds, pauses, then sends a shockwave. It uses no other attacks during the wind-up. The shout deals no damage and cannot be blocked or interrupted. Gold Aura absorbs it and drops to purple. Otherwise, the Ranger drops to their right knee and cannot attack until they use Powerwave / Heal with Stage 1 Aura or higher. This works at full HP and preserves banked Powerwaves. You can still block and charge Aura while Shaken. The boss resumes its regular attacks after the shout and skips a shout if you are already Shaken.

Player lasers match the Aura they spend. Cyan, purple, and gold beams get progressively wider.

The boss has locks at 40, 20, and 10 HP that require 2, 4, and 6 slashes, power waves, or laser credits respectively. Each run shuffles the required moves between those locks. Progress starts when you first reach each lock. The health display shows which move is needed and how many hits or credits are left. A Stage 1, 2, or 3 laser earns 1, 2, or 4 laser credits respectively. As the boss loses HP, its eye lasers come sooner and the player's attacks do less damage. An unblocked boss laser deals 19 HP at any boss health. Recovery begins sooner and restores HP more often when the boss is low. It can heal while a lock is active, but the lock keeps its progress. Opened locks stay open.

Slash and aura beam damage scale down to a floor of 55% before rounding. Power waves taper more sharply and deal at most 9 damage at 20 boss HP or less. A slash or power counter that gets past the locks always deals at least 1 HP.

A win shows your Power Level, clear time, damage taken, and how the Power Level was calculated. Speed earns up to 6,000 points (6,000 × 60 ÷ (60 + elapsed seconds), rounded). Health earns up to 4,000 points, reduced by 40 points per HP of total damage taken and floored at zero. Keeping the camera active and clearing without keyboard combat inputs adds 20% to that subtotal, rounded to the nearest point. Microphone moves are allowed.

## Play locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` in this folder and open [the game](http://localhost:8765/) in a current desktop browser. Choose **Enable camera + mic** and grant permissions, or choose **Play with keyboard**. Keep your shoulders and any raised hand in view. Your resting hand can be out of frame. The keyboard works in both modes.

| Input | Move |
| --- | --- |
| A | Basic attack |
| Hold S | Guard |
| D | Spend a banked Powerwave and heal with charged Aura if needed |
| F | Fire a short laser |
| Hold G | Build aura |

Choose **Play on mobile** for five touch buttons in a 2–1–2 layout: Powerwave / Heal above Block on the left, Aura in the center, and Laser above Slash on the right. Hold Block to guard and hold Aura to charge; tap the other three buttons. Multiple fingers can hold and attack at the same time. The keyboard start option also enables these controls on touch-first devices. Mobile mode works with **Start Tutorial**, with touch-specific instructions. Warnings sit below the arena so they cannot cover the boss. Lock requirements and progress always remain visible below the arena. Use **Hide warning / Show warning** in any mode to toggle the boss warning. Mobile reserves space for it so the controls stay in place. Aura changes colour as it charges: cyan for Stage 1, purple for Stage 2, and gold for Stage 3. The character glow and mobile Aura button share those colours, with a stage number and laser multiplier for clarity. Spending Aura clears the glow. The character shows successful moves; brief notices explain unavailable moves. Camera mode retains the recognized pose silhouette.

Raise both hands to spend one banked Powerwave. The same action also spends charged Aura if you are injured or burning, even when a Powerwave fires. Aura heals 5, 10, or 20 HP at stages 1, 2, or 3 and clears burning. You can heal with an empty Powerwave stock. Healing never erases damage already taken from the Power Level calculation.

Camera mode requests the camera and microphone together and can run without the mic if access fails. In keyboard mode, hold G to charge aura and press F to fire. Stay quiet briefly while the mic calibrates. The character glow and small stage label show Aura charge; the left panel shows mic input level and whether your sound is charging Aura. Pitch does not affect charging. A sustained new room sound above the calibrated level can also charge it. Mic charging pauses during a beam and briefly afterward. A browser connection is needed to download the pinned MediaPipe runtime and pose model. Camera frames and microphone samples are processed in the browser. The game stops device access when the round or session ends.

Choose **Start Tutorial**, then start with camera or keyboard. Complete each prompted move to advance, from slashing and blocking to charging and firing a laser. The final lessons teach all three lock types without health loss or a Power Level penalty. Sustain a sound and clap with the mic, or use G and F.

## Reading the code

- `index.html` defines the HUD, controls, and canvases. `style.css` lays them out and keeps the arena fixed during play.
- `game.mjs` owns the round and resolves combat. Start with `startRound()` and `tick()`.
- `boss-attacks.mjs` owns the Riftbeast’s move slots, attack timing, and flame charge rules. `boss-locks.mjs` owns the shuffled health gates.
- `battle-hud.mjs` renders warnings, health, Aura, locks, and the score.
- `camera-session.mjs` handles permissions, starts and stops streams, and samples the camera and mic.
- `mobile-controls.mjs` handles simultaneous touch and keyboard inputs, including cancellation and focus loss. Run its checks with `node --test tests/mobile-controls.test.mjs`.
- `controls.mjs` turns camera landmarks and microphone samples into pose, hum, and clap events.
- `beast.mjs` draws the boss sprite and defines its effect attachment points. `combat-art.mjs` composes the scene and player effects. `boss-effects.mjs` draws attacks using the boss’s eye and mouth anchors. `poses.svg` provides the small pose icons.

## Publish on GitHub Pages

Push these files to a repository. Under **Settings → Pages**, choose **Deploy from a branch** and select your branch and **/(root)**. Open the HTTPS URL shown by Pages. No build or application server is needed. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

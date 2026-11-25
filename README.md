# Rift Ranger

A 75-second browser arcade battle. Raise your right hand above your shoulder to attack or your left hand to shield against the Riftbeast's eye lasers. After a successful block, raise both hands to send three ripples through the arena. Hum to build aura, then clap to spend it on an energy beam. A stronger charge deals more damage.

## Play locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` in this folder and open [the game](http://localhost:8765/) in a current desktop browser. Choose **Enable camera** and grant permission, or choose **Play with keyboard**. Keep your shoulders and any raised hand in view. Your resting hand can be out of frame. The keyboard works in both modes.

| Input | Move |
| --- | --- |
| A | Basic attack |
| Hold S | Guard |
| D | Power counter after blocking |
| F | Spend aura on a beam |
| Hold G | Build aura |

Choose **Enable microphone** on the start screen or in the action panel and grant browser permission to use sound controls. The action panel shows mic input level and whether the game hears a steady hum. A browser connection is needed to download the pinned MediaPipe runtime and pose model. Camera frames and microphone samples are processed in the browser. The game stops device access when the round or session ends.

Select **Practice mode** before starting a camera or keyboard session to try every move without a timer or health loss. Choose **Test a laser attack** to practice guarding, then follow a successful block with a power counter.

## Publish on GitHub Pages

Push these files to a repository. Under **Settings → Pages**, choose **Deploy from a branch** and select your branch and **/(root)**. Open the HTTPS URL shown by Pages. No build or application server is needed. [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

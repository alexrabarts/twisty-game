---
name: critic-panel
description: Judge game pictures (a model, a world view, a photo match, the hill ride) with fresh critics that see only the images and a written bar, then refute wrong findings and turn the rest into a ranked fix list. Use before the owner sees a visual result, at each milestone of a model or world job, and whenever an agent is about to report its own pictures as good.
---

# Critic panel

A builder rates its own work too high. The panel exists so that no agent grades its own pictures. The builder may write its own view in the ledger, marked self-scored; it never decides.

## Rules for every critic

- **Fresh context.** A new subagent with no history: no code, no ledger, no brief beyond the bar, no word of who made the work or what the builder thinks of it.
- **Images only.** The critic gets the picture files, never a description of them. Side by sides put the reference left and the game right at the same framing. Add full-size crops where detail matters. With no photo of the subject itself, give real photos of the same class as references for materials only, and say so in the image list.
- **Neutral paths.** A file name or folder can tell the realism critic which picture is the game: put that lens's pictures in a folder of their own with neutral names (`image-A.png`). Crop the game pictures to the size and framing of the photos, or the size alone is the tell.
- **Private references stay private.** A critic may see the owner's photos as images. Nothing a critic writes about them goes into the repo except numbers and neutral words. Never ask a critic to identify a person.
- **Two critics per lens at a milestone, three before the owner sees it.** If two differ by more than 10 points, add one more. The median decides.
- **A finding needs a place:** the picture, the region and the part. "The lighting could be better" is not a finding.
- **The bar carries the rules.** A critic asks for what a code-made model lacks: fins, lettering, a stand down. The bar's "must not" lines stop that; the verifier rejects a finding that breaks one.

## Lenses

Pick the lenses the job needs. The prompts are in `prompts/`; each is a template with bracketed slots. Fill every slot, hand the whole file to the critic, and send the images with it.

| Lens | Gets | Answers | Prompt |
|---|---|---|---|
| Art director | side by sides, the bar | 0 to 100 per dimension (outline, light, colour, materials, detail near, detail far) and the three biggest gaps per picture | `prompts/art-director.md` |
| Realism | the game picture and a real photo, unlabelled, in random order | which one is made in code, how sure, and each tell that gave it away | `prompts/realism.md` |
| Detail | full-size crops: near, middle, far, and the flattest tiles from `tools/model-stats.mjs` | bare or flat areas, repetition, scale errors, missing contact and wear | `prompts/detail.md` |
| Verifier | the merged findings and the same images | each finding kept, downgraded or rejected, with the reason | `prompts/verifier.md` |

## Severity

Each finding carries an id, a priority, its place, the fault, and the change to try.

- **P0:** seen at once in the game's normal view (the menu close-up, the chase camera), or it breaks a rule in AGENTS.md or the privacy rules.
- **P1:** seen at normal viewing, but not at first glance.
- **P2:** seen only when the picture is studied.

The verifier runs on every P0 and P1, and on every finding that only one critic made. Work P0s first.

## Caps

A cap holds a dimension down whatever the median says, until the fault is fixed and a fresh critic confirms it. Write the cap beside the score in the ledger.

- A verified P0 is open: the overall score is at most the bar minus 10.
- The realism lens names the game picture as made in code with confidence over 70: light and materials are at most 75.
- A large area is flat at full size (`tools/model-stats.mjs` flags it): materials and far detail are at most 70.
- A stand-in, a placeholder or a debug-looking part shows: near detail is at most 60.

## From scores to the next round

1. Merge findings that name the same place and fault. Keep the count of critics who made it.
2. Run the verifier. Drop the rejected findings.
3. Rank: the owner's notes first, then faults that two or more critics made, then the lowest dimension.
4. Write the top three in the ledger as the next round's focus, each with its region and the change to try. The realism lens's tells are the most useful list: a correct tell is the next round.

## Noise and stopping

- Critics vary from round to round: the same pictures scored about 5 points apart between two critics, and the means moved less than that over several kept changes. A change counts only when it holds over two rounds.
- A plain question per picture is steadier than a score: "At normal viewing, does this read as a real object in a good game?" Count the yes answers over the rounds.
- When the scores stop rising: at most two more rounds, each with a different method, then stop and write the faults that remain, honestly.
- Calibrate: have one critic score a real photo of the subject blind on the same prompt. If the game picture beats the photo while the owner says it is worse, the panel is too kind: raise the bar.

## What critics never decide

Taste belongs to the owner: which of two good looks, a direction, a colour the owner praised. A critic finds faults against the bar. It never pushes the look away from what the owner chose.

## Report

To the owner: the median per lens, before and after; the caps in force; the P0s and P1s left; the pictures to look at. Mark every score that was not from a fresh critic as self-scored.

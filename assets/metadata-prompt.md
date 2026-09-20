# Visual metadata analysis prompt

Analyze the source photo AND the final paper-cut sticker. The final sticker is the authority for search. Record only plainly visible features. Use everyday search words: colors of prominent clothes/objects, garments, glasses/sunglasses, phones, coffee, animals, food, sports, poses and readable expressions. Associate colors with their objects in the description (a red helmet, a blue coffee cup), not just a bag of colors. Include synonyms such as sunglasses/shades, laughing/happy, dog/fluffy. Identify multiple people as a couple/pair only descriptively; do not infer a relationship, identities, occupations, nationality, religion, precise age or other sensitive traits. Cultural garment names are visual descriptions, not evidence of beliefs or identity. Do not tag removed background scenery. Distinguish real objects from printed motifs (elephant-print pants are not a real elephant). Never turn an unknown beverage into a definite specific drink without evidence. Keep any generation deviations in QA notes, outside search metadata.

Return one object per stable sticker ID:
- title: short, evocative label
- description: 1–2 factual sentences, explicitly binding colors, objects, clothing and actions to the depicted subject
- subjects, colors, clothing, objects, actions, moods, tags: arrays of short lowercase strings

Prefer 8–16 useful tags over exhaustive guesses. Describe absent/uncertain attributes by omitting them. Preserve the source filename and generated batch/cell separately in manifest.json. Review the cutout after slicing; only then mark analysis reviewed.

# Why this shape works with Jev

Jev consumes text or structured state and returns typed judgments; it is not the image-analysis or text-generation step. The official TypeSafe SDK uses TypeSafeClient.systemOne and noul(instructions, criteria). Send the query and this compact catalog as state, then one independent Noul question per sticker. Include the sticker ID in each question's instructions because question keys are not part of inference. Define both true/false criteria, threshold probabilities in code, sort and cap at 10. Do not use a Choice question: that would force a single winner among stickers that may all be irrelevant.

Sources checked 2026-09-20:
- https://docs.typesafe.ai/introduction
- https://docs.typesafe.ai/sdk/javascript
- https://docs.typesafe.ai/sdk/javascript/api/functions/noul

Analysis in this project: agent visual inspection of all 51 source references and all generated sheets, with metadata aligned to the final visible illustrations.

# User-provided people names

The user identifies the woman as Sijie (alias CJ) and the man as David. Apply lowercase `sijie` and `cj` to stickers containing her, `david` to stickers containing him, and all three to shared stickers. This is user-provided context, not facial identification. The per-sticker assignments are stored in `assets/people.json`, including the silhouette and tandem image identified by the user. Keep these aliases in `people` and `tags`, alongside the visible metadata. Do not apply them to pet-only or object-only stickers. Run `npm run assets:metadata` after editing the mapping or metadata to update the public catalog without regenerating images.

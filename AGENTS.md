# Repository instructions

## Goal

The first and overriding goal is a faithful Windows port of the already-analyzed PC version of Kanon using KiriKiri/KAG, with TJS extensions only where KAG cannot reproduce observed behavior.

## Boundaries

- Do not turn this into a general VN engine before the Kanon port is substantially reproduced.
- Do not use KAG tags as the source-side or future common command model.
- Keep Kanon-specific decoding, commands, state, and asset references explicit.
- Preserve source file, byte offset, opcode, raw typed arguments, and decoded meaning.
- Preserve unknown commands as unknown; never silently skip or generalize them.
- Treat all original game data as read-only and local to `private/`.
- Write reproducible transformed data only under `cache/`.
- Never commit scenario text, images, music, sound effects, voices, or derived copyrighted assets from the original game.
- Request abstract format and behavior information instead of requesting original assets.

## Runtime

- Emit KAG only at the runtime adapter boundary.
- Add Kanon-specific TJS only after an observed behavior cannot be matched with KAG.
- Fail the build when a command cannot be reproduced; do not emit a plausible no-op.
- Keep runtime command tracing switchable.
- Keep expected Kanon state inspectable independently of KAG internals.

## Verification

- Add a regression test with every newly decoded command or fixed fidelity difference.
- Record known mismatches in `fidelity/known-differences.json`.
- Use synthetic fixtures in Git. Real extracted data remains local.
- Run `npm run verify` before publishing changes.

## Commonization

Only promote a meaning-level operation to a future common VN model after comparing at least two materially different source engines. Keep non-common behavior in work-specific adapters or extensions.


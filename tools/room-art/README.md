# Room art generator

Draws the furniture for the bookshelf's rooms (docs/app/ui/room-art.js) in the
room's own perspective: each piece is modelled in the room's coordinates and
projected through the same camera as the CSS room, shaded from the scene's
light, with its shadows.

One file per scene (library, fire, rain, cafe) plus the shared `lib.mjs`,
`furniture.mjs` and `tile.mjs` (the library wall tile). `emit.mjs` writes
room-art.js and the placement block in style.css. Run each scene script, then
`node tools/room-art/emit.mjs tools/room-art/{library,fire,rain,cafe}.json`. (The scene scripts write those JSON files next to them; they are not committed.)

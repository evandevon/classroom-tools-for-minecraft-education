# Future features

Ideas that have been discussed but not built yet. Nothing here is in the add-on.

## Limit what students can use near protected areas

**The problem:** Protected Areas and locks only control where students can stand. A student outside another build can still pour lava or water so it flows in, light a fire at the edge, or place TNT. Lava spreads about 3 blocks on flat ground and further downhill. Water spreads about 7 blocks and washes away torches, plants, redstone and crops. With **Fire Spreads** on, lava can also start fires that burn through a build.

**The idea:** Stop students using damaging items inside other students' builds and teacher-only areas, and within a buffer around them.

- **Items to block:** lava and water buckets, flint and steel, fire charges and TNT. Possibly also other liquids, and blocks such as magma that can damage builds.
- **Where:** inside other students' builds and teacher-only areas, plus about 8 blocks outside their edges. That covers how far students can reach and how far lava spreads on flat ground. The buffer could be a setting.
- **Who:** students who are kept out of other builds, plus everyone for teacher-only areas. Students can still use everything in their own build. Teachers are never limited.
- **What students see:** the action is cancelled, with a short message such as "You can't use lava near someone else's build."
- **Explosions:** blocks inside protected areas could be left undamaged by explosions that start outside them.
- **Records:** repeated attempts could alert the teacher and go in the Behaviour Log, as entering a protected area already does.

**How it could work:** The Script API's `playerInteractWithBlock` before-event can cancel an item being used on a block, and the `explosion` before-event can remove protected blocks from an explosion. Both are in the stable `@minecraft/server` 2.0.0 that the add-on already uses.

**Limits:**

- Liquids poured further away and flowing a long way downhill would still get through, because there's no event for liquid flowing.
- Dispensers could still place liquids or fire if students can build redstone.
- Needs testing in Minecraft Education, including how it interacts with Allow, Deny and Border blocks.

**In the meantime:** Turn **Fire Spreads** and **TNT Explodes** off in the world's settings, leave space between builds, use Deny blocks around important areas, and back up the world before lessons.

## Build tour

A guided tour that takes the class from build to build in order, so each student can present their work. It would build on Showcase and the build markers.

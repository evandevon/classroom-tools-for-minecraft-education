# Classroom Tools for Minecraft Education

A simple classroom management add-on for Minecraft Education. Warn, freeze or lock students, run a visible timer, mark and visit student builds, and hold a safe class showcase.

Classroom Tools is a modified version of [Educator Tools](https://github.com/ShapescapeMC/Educator-Tools) by Shapescape ApS. It is an independent project and is not made or endorsed by Shapescape.

> **Testing status:** Try this add-on in a copy of your world with a student account before using it in a lesson. Minecraft Education updates can change how add-ons behave.

## Contents

- [Install](#install)
- [Add it to a world](#add-it-to-a-world)
- [Using the toolbox](#using-the-toolbox)
- [Features](#features)
- [Exporting or sharing a world](#exporting-or-sharing-a-world)
- [Troubleshooting](#troubleshooting)
- [Building from source](#building-from-source)
- [What changed from Educator Tools](#what-changed-from-educator-tools)
- [Licence](#licence)

## Install

1. Open the [Releases](../../releases) page and download the latest `.mcaddon` file.
2. Double-click the file. If asked, open it with **Minecraft Education**.
3. Wait for the message saying the import was successful.

Students don't need to install anything. They download the pack when they join your world, if asked.

## Add it to a world

Make a copy of your world first, because some packs can't be cleanly removed later.

1. Go to **Play → View My Worlds**, then click the **pencil icon** next to the world.
2. Scroll to **Add-Ons**, click **Behavior Packs**, then open **My Packs**.
3. Select **Classroom Tools** and click **Activate**.
4. Check that it's also active under **Resource Packs**.
5. If the world uses Educator Tools, deactivate that under both lists. The two add-ons share item IDs and shouldn't run together.
6. **Open the world yourself first.** The first person to open it with the pack on becomes the teacher.

To update, install the new file and check that the world lists the new version. If it still uses the old one, remove that and activate the new version. Students should then rejoin.

## Using the toolbox

You get an **Classroom Toolbox** item. Select it and right-click on a computer to open the menu. If it's missing, leave and rejoin the world, or search for it in your Creative inventory.

Only teachers can open the menu. Most actions start with a list of online students, where you tick individual students or **Everybody**. Everybody never includes teachers, and for Warnings, Teleport and Gamemode it covers only students who are online.

## Features

### Give a Warning

A reminder before any consequence. Choose students and send the default message, edit it, or clear it.

- The student's screen flashes red, a sound plays, and they see **Warning 1** with your message.
- Angry particles appear above their head for about 5 seconds, which other students can see.
- Your list shows each student's warning count. Counts reset when the world is reopened.

### Focus Mode

Freezes students where they are. They can't move or build, can't be hurt, and their screen dims.

1. Choose **Focus Mode**, then tick students or **Everybody**.
2. Choose a time limit or **Until I release them**.
3. Add an optional message, and choose whether to stop them using chat.

Everybody also covers students who join later. When someone is in Focus Mode, the menu offers **Add Students** and **Release Students**, and **End Focus Mode for Everybody** appears at the top of the main menu.

### Lock to an Area

Keeps students within a set distance. They can still build inside the area. Students near the edge are pushed back, and students further out are teleported to the centre.

Choose students, then set:

- **How long:** a time limit or until you release them.
- **Where:** around each student, around where you're standing, or following you.
- **How far:** 5 to 150 blocks.
- **Show the edge:** whether students see the boundary.

**Unlock Students** releases some students, and **Unlock Everybody** appears on the main menu when anyone is locked. Your settings are remembered for next time.

### Timer

Create, start, pause, edit or remove a countdown. Everybody sees it above their hotbar, and only teachers can control it.

**When time is up** can do nothing, or put the class in Focus Mode for a set time or until you release them.

### Build Markers

Everybody gets a **Build Marker**, a red flag item. Using it places a flag labelled with their name, and using it again moves it, so each person has one.

In your **Build Markers** menu, you can:

- see which online students don't have a marker yet
- use **Take Me There** or **Send Students There**
- remove one marker or all of them

### Start Showcase

For a class tour of each other's work.

While a showcase runs:

- Students switch to Adventure mode, so they can't place or break blocks. You stay in your current mode.
- Fighting, fall damage and TNT explosions are turned off.
- Using the Build Marker opens a list of builds to teleport to, for you and students. Flags can't be placed or moved.

**End Showcase** restores each student's game mode and the world rules.

Adventure mode doesn't stop everything. Students can still open chests and use doors, buttons and levers. Only marked builds are listed, so check Build Markers first.

### Teleport

- **Just Me:** go to a student, a marker or typed coordinates, such as `100 64 -20`.
- **Students:** send students to you, another student or a marker.
- **Set World Spawn Point Here:** sets the Overworld spawn to where you're standing. Returning students normally appear where they left off, so this mainly affects first-time joiners and respawning players.

### Gamemode

Change game mode for selected students or Everybody. Students in Focus Mode are skipped, and this option is unavailable during a showcase.

### Weather and Time

Change the weather and time of day for the world.

### Teachers and Helpers

Any teacher can open this menu.

- **Assign as Teacher:** Gives someone full control, including this menu. The person who first opened the world can't be removed here.
- **Add Helpers:** Gives students a **Helper Badge**. Helpers are still students, so class-wide tools apply to them, and they can't open the toolbox.

Removing either role also takes the matching item, including from someone who's offline when they return.

### Help Flags

Every student gets a **Help Flag** item.

1. A student uses it, and a flag saying "Ann needs help" appears. Using it again takes it down.
2. Helpers and teachers hear a sound and get a chat message, and see the number waiting on screen.
3. A helper uses their **Helper Badge**, or a teacher opens **Help Requests**, then chooses a student to teleport to them. The longest wait is listed first.
4. When finished, they choose **Finished: Return to My Build** or **Finished: Stay Here**.

Each helper handles one student at a time. A request goes back in the list if the helper leaves, loses the role, or hasn't finished after 5 minutes. Waiting students are reminded to helpers every minute. Helpers in Focus Mode aren't pinged, and locked helpers can't go. Help visits are added to the Behaviour Log.

Helpers can only teleport to students with a help flag up. Teach them to explain or show, rather than change another student's build.

### Teleport Requests

**Allow Teleport Requests** turns this on for students, and **Stop Teleport Requests** turns it off.

While it's on, a student's Build Marker opens a menu:

- **Place or Move My Marker**
- **Ask to Visit Someone:** Choose another student's character or build. Nothing happens unless that student chooses **Yes, Allow**. Closing the question counts as no.
- **Return to My Build**

Students can ask once every 20 seconds. Students in Focus Mode or locked to an area can't visit, and teachers can't be requested. Approved visits are added to the Behaviour Log.

### Behaviour Log

Records warnings, Focus Mode, locks, releases and time limits ending, with the student's name and time. It keeps the newest 200 events until you clear it.

To copy it, choose **Copy Log**, click the box, then press **Ctrl+A** and **Ctrl+C**. Each page holds 25 events, and **Submit** opens the next page.

The log contains information about students. Treat it as a prompt for your school's official records, check that it fits your school's policies, and clear it before sharing a world.

## Exporting or sharing a world

Exporting a world as a `.mcworld` file normally includes its active packs. Test the import before relying on this.

Before sharing a copy, end any Focus Mode, locks, showcase and timer, then clear the behaviour log and remove markers if they aren't needed.

The copy still treats the original account as the teacher. To take over, another operator can type:

```
/scriptevent edu_tools:claim_teacher
```

## Troubleshooting

| Problem | What to try |
|---|---|
| The toolbox won't open | Check you opened the world first, or use the command above |
| No toolbox or Build Marker | Leave and rejoin the world |
| Icons or the flag are missing | Check the pack is active under Resource Packs |
| The old version is still running | Remove it from the world, activate the new one, and have students rejoin |
| A flag lingers after it's moved | It should disappear within a few seconds once someone is near it |
| Students can't be muted | The add-on tells you if this fails, and Focus Mode still applies |
| Log times look wrong | Minecraft may be using a different time zone |

Chat can't be recorded, because Minecraft only offers that to add-ons through a beta feature. The Classroom Mode app can show chat live.

## Building from source

You need [Node.js](https://nodejs.org/), Bash and `zip`.

```bash
cd simple_build
npm install
npm run build
```

This creates `simple_build/Classroom_Tools.mcaddon`.

- **Code:** `regolith/filters_data/modular_mc/educator_tools/logic`
- **Pack files, text and icons:** `simple_build/pack`

Use `simple_build`, not the upstream Regolith setup or GitHub release workflows, which haven't been updated for this version. The `docs` folder and other leftover upstream files also still describe the original Educator Tools.

## What changed from Educator Tools

**Removed:** teams, nicknames, assignments, inventory tools, health tools, classroom limitations, world settings, feedback prompts, letter blocks and translations other than English.

**Added:** a single teacher, a student picker with Everybody, time limits for Focus Mode and locks, chat muting, warnings, build markers, Showcase, a behaviour log, an on-screen timer for everyone and a world spawn button.

## Licence

Licensed under the GNU Lesser General Public License v3.0. See [`LICENSE`](LICENSE) and [`COPYING`](COPYING).

Based on [Educator Tools](https://github.com/ShapescapeMC/Educator-Tools) by Shapescape ApS, used under the same licence.

# Classroom Tools for Minecraft Education

A simple classroom management add-on for Minecraft Education. Warn, freeze or lock students, run a visible timer, mark and visit student builds, handle help requests, and hold a safe class showcase.

## Why it exists

In a shared world, small problems grow quickly: one student wanders off, another breaks a build, and the class stops listening while you type commands. Minecraft Education's built-in tools can do much of this, but they usually need typed commands, exact player names and switching between screens mid-lesson.

Classroom Tools puts the common jobs into one menu, so you can:

- **act in seconds** by ticking names or **Everybody**, with no commands to type
- **respond in steps**, from a warning to Focus Mode to a lock, rather than jumping to the strongest consequence
- **run routines** such as pack-up time, showcases and help requests, so students know what to expect
- **keep a record** that you can copy into your school's own system

Classroom Tools is a modified version of [Educator Tools](https://github.com/ShapescapeMC/Educator-Tools) by Shapescape ApS. It is an independent project and is not made or endorsed by Shapescape.

> **Testing status:** Try this add-on in a copy of your world with a student account before using it in a lesson. Minecraft Education updates can change how add-ons behave.

## Contents

- [Install](#install)
- [Add it to a world](#add-it-to-a-world)
- [Using the toolbox](#using-the-toolbox)
- [Features](#features)
- [Stopping students getting around it](#stopping-students-getting-around-it)
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

You get a **Classroom Toolbox** item. Select it and right-click on a computer to open the menu. If it's missing, leave and rejoin the world, or search for it in your Creative inventory.

Only teachers can open the menu. Most actions start with a list of online students, where you tick individual students or **Everybody**. Everybody never includes teachers, and for Warnings, Teleport and Gamemode it covers only students who are online.

## Features

### Give a Warning

**Why:** Most behaviour needs a nudge, not a consequence. A warning gives a clear first step that the student can't miss, even when they're absorbed in the game, and it's private to that student apart from the particles.

Choose students and send the default message, edit it, or clear it.

- The student's screen flashes red, a sound plays, and they see **Warning 1** with your message.
- Angry particles appear above their head for about 5 seconds, which other students can see.
- Your list shows each student's warning count. Counts reset when the world is reopened.

### Focus Mode

**Why:** Students rarely look up from the screen while they can still play. Focus Mode gets everyone's attention for instructions or a class discussion, and can also give one student a short reset. Muting chat stops messages being sent while you talk.

Freezes students where they are. They can't move or build, can't be hurt, and their screen dims.

1. Choose **Focus Mode**, then tick students or **Everybody**.
2. Choose a time limit or **Until I release them**.
3. Add an optional message, and choose whether to stop them using chat.

Everybody also covers students who join later. When someone is in Focus Mode, the menu offers **Add Students** and **Release Students**, and **End Focus Mode for Everybody** appears at the top of the main menu.

### Lock to an Area

**Why:** Sometimes students should keep working but stay in one place, for example a student who keeps visiting other builds, or a group task in one spot. A lock is less disruptive than Focus Mode, because they can still build. Following you is useful for a guided walk.

Keeps students within a set distance. They can still build inside the area.

The edge works like a wall: anyone who goes past it, however they got there, is put straight back at their last spot inside. Students riding a boat, minecart or animal are taken off it first. Anyone who keeps pushing against the edge is sent to the centre, and teachers get a message and a Behaviour Log entry.

Choose students, then set:

- **How long:** a time limit or until you release them.
- **Where:** around each student, around where you're standing, or following you. If you briefly drop out while students are following you, their area stays where you were last.
- **How far:** 5 to 150 blocks.
- **Show the edge:** whether students see the boundary.

**Unlock Students** releases some students, and **Unlock Everybody** appears on the main menu when anyone is locked. Your settings are remembered for next time.

### Timer

**Why:** A visible countdown helps students manage their own time and reduces "how long left?" questions. The end actions turn routines into something that happens automatically, so pack-up time or the showcase starts on time even when you're busy helping someone.

Create, start, pause, edit or remove a countdown. Everybody sees it above their hotbar, and only teachers can control it.

**When time is up** can do one of these:

- Do nothing
- Focus Mode for everybody, with its own time limit and optional message
- End Focus Mode
- Start Showcase or End Showcase
- Unlock Everybody
- Allow or Stop Teleport Requests (stopping sends visitors back to their builds)
- Place a marker for anyone without one, where they're standing at that moment
- Show a message on everyone's screen
- Set everybody to Adventure (no building) or Creative

Teachers aren't affected. Students in Focus Mode skip game mode changes, and a running showcase keeps students in Adventure.

### Student Tools

**Why:** Students can do common jobs themselves, such as asking for help or getting back to their build, without calling out or needing you to teleport them. Everything is in one item, so there's only one thing to teach. Teachers get it too, so you can demonstrate on the board.

Everybody, including teachers, gets one **Student Tools** item. Using it opens a menu, so teachers can show the class exactly what students see.

- **I Need Help** or **Take Down My Help Flag**
- **Return to My Help Flag**, while their flag is up, in case they've wandered off
- **Place or Move My Marker** (or **Visit a Build** during a showcase)
- **Return to My Build**
- **Ask to Visit Someone**, when teleport requests are on
- **Help Requests**, for helpers and teachers

It can't be opened in Focus Mode, and locked students can't use it to leave their area.

### Build Markers

**Why:** In a large world, finding a student's build takes time, and students often get lost. Markers let anyone return to their build and let you visit, check or gather students at a build. They also power the showcase list, and the **without a marker** list shows who hasn't started yet.

**Place or Move My Marker** places a flag labelled with the person's name. Choosing it again moves the flag, so each person has one.

In your **Build Markers** menu, you can:

- see which online students don't have a marker yet
- use **Take Me There** or **Send Students There**
- remove one marker or all of them

### Start Showcase

**Why:** Sharing work is valuable, but visitors can break builds, start fights or set off TNT. Showcase makes the world safe to visit with one button, then puts everything back afterwards.

For a class tour of each other's work.

While a showcase runs:

- Students switch to Adventure mode, so they can't place or break blocks. You stay in your current mode.
- Fighting, fall damage and TNT explosions are turned off.
- **Student Tools** offers **Visit a Build**, a list of builds to teleport to, for you and students. Flags can't be placed or moved.

**End Showcase** restores each student's game mode and the world rules.

Adventure mode doesn't stop everything. Students can still open chests and use doors, buttons and levers. Only marked builds are listed, so check Build Markers first.

### Teleport

**Why:** Gather the class, rescue a stuck student, or go and check work without typing coordinates or names.

- **Just Me:** go to a student, a marker or typed coordinates, such as `100 64 -20`.
- **Students:** send students to you, another student or a marker.
- **Set World Spawn Point Here:** sets the Overworld spawn to where you're standing. Returning students normally appear where they left off, so this mainly affects first-time joiners and respawning players.

### Gamemode

**Why:** Switching modes is useful in different parts of a lesson: Adventure stops building during a discussion or quiz, Creative for building time, and Survival for gathering challenges.

Change game mode for selected students or Everybody. Students in Focus Mode are skipped, and this option is unavailable during a showcase.

### Weather and Time

**Why:** Night and storms make building and screenshots harder, and mobs can distract students. This keeps conditions clear, for example before students take journal screenshots.

Change the weather and time of day for the world.

### Teachers and Helpers

**Why:** A second teacher or support staff member may need full control, and confident students can help classmates so you're not the only person who can answer questions.

Any teacher can open this menu.

The menu has two pages, **Teachers** and **Helpers**. Each lists every student with an on/off switch: on means they have that role, off means they don't. People who have the role but are offline are listed too, so you can switch them off.

- **Teachers:** Full control, including this menu. The person who first opened the world isn't listed and can't be removed.
- **Helpers:** Get **Help Requests** in Student Tools. Helpers are still students, so class-wide tools apply to them, and they can't open the toolbox. Making a helper a teacher removes their helper role.

Removing the teacher role also takes the toolbox, including from someone who's offline when they return.

### Help Flags

**Why:** Students waiting with a hand up stop working, and calling out disrupts others. A help flag marks exactly where the student is, keeps a fair queue, and lets trusted helpers take some of the load.

1. Someone chooses **I Need Help** in Student Tools, and a flag saying "Ann needs help" appears. **Take Down My Help Flag** removes it.
2. Helpers and teachers hear a sound and get a chat message, and see the number waiting on screen.
3. A helper or teacher opens **Help Requests**, in Student Tools or the teacher menu, then chooses a student to teleport to them. The longest wait is listed first.
4. When finished, they choose **Finished: Return to My Build** or **Finished: Stay Here**.

Teachers can use I Need Help to demonstrate it to the class.

Each helper handles one student at a time. A request goes back in the list if the helper leaves, loses the role, or hasn't finished after 5 minutes. Waiting students are reminded to helpers every minute. Helpers in Focus Mode aren't pinged. A locked helper can still go: while helping, they share the student's locked area, or stay within 20 blocks of the flag if the student isn't locked. When they finish, they're put back in their own area. Only make someone a helper if you trust them with this. Help visits are added to the Behaviour Log.

Helpers can only teleport to students with a help flag up. Teach them to explain or show, rather than change another student's build.

### Teleport Requests

**Why:** Collaboration often means visiting a partner, but free teleporting leads to students turning up uninvited. Requests need the other student's permission, and you can turn them off at any time.

**Allow Teleport Requests** turns this on for students, and **Stop Teleport Requests** turns it off.

While it's on, **Student Tools** includes **Ask to Visit Someone**. Students choose **Go to Ben** to teleport to the person, or **Visit Ben's build** to go to their marker. A build only appears once its owner has placed a marker and is online, because they have to say yes. Nothing happens unless that student chooses **Yes, Allow**. Closing the question counts as no.

When you choose **Stop Teleport Requests**, or a timer does it, every student who visited someone is sent back to their own build. Anyone without a marker stays put, and you're told who.

Students can ask once every 20 seconds. Students in Focus Mode or locked to an area can't visit, and teachers can't be requested. Approved visits are added to the Behaviour Log.

### Behaviour Log

**Why:** It's hard to remember who was warned or locked, and when, by the end of a busy lesson. The log gives you notes for follow-up and your school's records.

Records warnings, Focus Mode, locks, releases and time limits ending, with the student's name and time. It keeps the newest 200 events until you clear it.

To copy it, choose **Copy Log**, click the box, then press **Ctrl+A** and **Ctrl+C**. Each page holds 25 events, and **Submit** opens the next page.

The log contains information about students. Treat it as a prompt for your school's official records, check that it fits your school's policies, and clear it before sharing a world.

## Stopping students getting around it

The add-on's limits only work if students don't have more power than it does. Students with **operator** permissions can change their own game mode, teleport, remove their own mute, or make themselves the teacher.

- **Keep students as Members.** Check each student in the player list, and set the world's default **Player Permissions** to **Member**, so students who join later don't get operator access.
- **Test on a student account.** Members should get an error for `/gamemode creative`, `/tp @s ~ ~10 ~` and `/scriptevent edu_tools:claim_teacher`. Press **C** to check whether Code Builder opens.
- **Open new worlds first,** because the first person to open a world with the pack becomes the teacher.
- **Lock your screen** when you step away, because teacher access follows your account.
- **Back up the world** before lessons. Locks limit where students can go, not what they can affect, so lava, water, TNT and redstone can still reach nearby builds. Space builds apart, or use Minecraft Education's Allow, Deny and Border blocks.

Focus Mode and locks reapply if a student leaves and rejoins, but they only affect Minecraft, not other apps on the computer.

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
| No toolbox or Student Tools | Leave and rejoin the world |
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

**Added:** a main teacher with optional extra teachers and student helpers, a student picker with Everybody, time limits for Focus Mode and locks, chat muting, warnings, a Student Tools item for everybody, build markers, help flags, teleport requests, Showcase, a behaviour log, an on-screen timer with actions when time is up, and a world spawn button.

## Licence

Licensed under the GNU Lesser General Public License v3.0. See [`LICENSE`](LICENSE) and [`COPYING`](COPYING).

Based on [Educator Tools](https://github.com/ShapescapeMC/Educator-Tools) by Shapescape ApS, used under the same licence.

# PING — Individual Exploration Prototype 1

A one-room stealth puzzle built with native WebGL. Press **Space** to reveal the maze briefly. The pursuer travels to the location of each scan, so the same action can reveal a route or create a decoy.

## Controls

- WASD or arrow keys: move
- Space: scan
- Enter: start or restart from the title and result screens

## Design hypothesis

Will players discover that a scan can lure the pursuer away, and use it as a decoy rather than only as a way to see the maze?

## Playtest

Give a new player only the on-screen controls. Watch where they scan and which route they take. Afterward ask, “What did you think made the pursuer change direction?” and “Why did you scan at that spot?” A successful escape by itself does not show intentional decoy use.

## Technical notes

- The maze and all moving game objects are rendered through a WebGL canvas. The page uses no game engine or external assets.
- `game.js` contains a fixed tile map, keyboard movement, breadth-first search for the pursuer, scan visibility, and win/loss states.
- No analytics, accounts, or network requests are made by the game.
- For local testing: `python3 -m http.server 8765` in this directory, then open `http://localhost:8765/`.

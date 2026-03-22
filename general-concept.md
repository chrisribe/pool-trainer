## Pool Table Projector Training App — Feasibility & Approach

### Why your existing stack works perfectly

| You already have | Pool table equivalent |
|---|---|
| **Paper.js** canvas with precise vector rendering | Render table felt, rails, pockets, balls, shot lines, ghost balls |
| **Figma-style transform handles** (move/rotate/scale) | Reposition balls, adjust shot angles, drag cue lines |
| **Scene Creator architecture** (items on canvas) | Each ball, aiming line, ghost position = a "scene item" |
| **SVG export** | Export drills as printable diagrams too |
| **Undo/redo command pattern** | Undo ball placements while building drills |
| **Icon library browser** | Drill library browser (categories: safety, kick shots, position play, etc.) |
| **Tablet-friendly HTML** | Runs on any tablet browser → HDMI/wireless to projector |

### Core concept

```
Tablet (browser app) → HDMI/Miracast/AirPlay → Projector above table
                                                    ↓
                                              Pool table surface
```

The app renders a top-down view of the table at the projector's native resolution. The projector is calibrated once so the rendered table edges align with the physical rails.

### Key features to build

**1. Table canvas (base layer)**
- Accurate 9-foot or 7-foot table proportions (configurable)
- Rail cushions, diamonds/sights, pocket openings
- **Pure black background** — black = no light from projector = invisible on felt. Only balls, lines, and UI elements are visible. This is how the pro systems work and it's the correct approach for any lit pool room.
- Calibration mode: project corner markers to align with physical table

**2. Ball placement**
- Drag-and-drop numbered balls (1-15 + cue ball)
- Snap-to-grid option for precision
- Ball rack templates (triangle, 9-ball diamond)
- "Ghost ball" rendering (semi-transparent target position)

**3. Shot visualization**
- Aim line from cue ball to object ball (with angle indicators)
- Projected path of object ball to pocket
- Projected path of cue ball after contact (position play)
- English/spin indicator (top/bottom/left/right dot on cue ball)
- Speed indicator (line thickness or color)

**4. Drill library**
- Pre-built drill sets (JSON files, like your icon catalogs)
- Categories: straight shots, cut shots, bank shots, kick shots, safety, position play, break patterns
- Drill sequences: "Step 1 of 8" with next/prev navigation
- Difficulty ratings

**5. Projector calibration**
- 4-corner alignment mode (drag corners to match physical table)
- Perspective correction (keystoning)
- Brightness/contrast controls (projector on green felt needs high contrast colors)
- Color palette optimized for projection (bright cyan, magenta, yellow — not dark colors)

### Architecture mapping

```
pool-trainer/
├── index.html              # Single page app (tablet-optimized)
├── styles.css              # Black background, bright elements, large touch targets
├── app-core.js             # Core init + shared state
├── shots.js                # Aim/ghost ball logic
├── balls.js                # Ball creation + racks
├── drills.js               # Drill library + menus
├── input.js                # Pointer + keyboard input
├── remote.js               # QR + remote control
├── calibration.js          # Homography + calibration UI
├── init.js                 # Startup sequence
├── lib/
│   ├── paper.min.js        # Reuse directly
│   ├── FileSaver.min.js    # Export drills as SVG/JSON
│   └── shared-controllers.js  # Reuse command pattern, transforms
├── drills/
│   ├── straight-shots.json
│   ├── cut-shots.json
│   ├── position-play.json
│   ├── safety.json
│   └── custom/             # User-created drills
└── table/
    └── table-config.js     # Table dimensions, pocket positions
```

### What to reuse vs. build new

| Reuse from stencil editor | Build new |
|---|---|
| Paper.js canvas setup | Table renderer (rails, pockets, diamonds) |
| Transform handles (move/rotate) | Ball objects with number labels |
| Command pattern (undo/redo) | Shot line renderer (aim + deflection angles) |
| Item selection system | Drill sequencer (step through shots) |
| Export to SVG | Calibration overlay mode |
| Search/browse UI pattern | Drill library with categories |
| Color picker | English/spin indicator widget |
| Scene serialization (JSON) | Physics preview (optional: show predicted paths) |

### Projection-specific considerations

**Black background principle:**
- Background is **always pure black** (`#000000`)
- Black = projector emits no light = invisible on felt
- Only bright elements (balls, lines, text, UI) are visible on the table
- This works in any lighting — no need for a darkened room
- All UI elements must be bright/high-contrast against black

**Colors that work on black-over-felt:**
- **White** — best visibility, use for aiming lines and primary UI text
- **Bright yellow** — good for cue ball path, highlighted elements
- **Bright cyan/magenta** — good for object ball paths, secondary info
- **Red** — danger zones, "don't hit here"
- **Avoid:** dark colors, subtle shades, gradients — anything dim disappears

**UI approach: everything renders on the table**

The pro systems don't bother with separate tablet-vs-projector layouts. The UI is projected directly onto the table surface alongside the drill. The tablet simply mirrors/drives what the projector shows.

**Two app states:**

```
STATE 1: MENU (projected on table)
┌─────────────────────────────────────────────────┐
│                                                 │
│           POOL TRAINER                          │
│                                                 │
│     ┌─────────────────────┐                     │
│     │ 🎯 Straight Shots   │                     │
│     │ 📐 Cut Shots        │                     │
│     │ 🔄 Position Play    │                     │
│     │ 🛡️ Safety           │                     │
│     │ ⚙️ Settings          │                     │
│     └─────────────────────┘                     │
│                                                 │
│         (all projected on felt)                 │
└─────────────────────────────────────────────────┘

STATE 2: DRILL (projected on table)
┌─────────────────────────────────────────────────┐
│                                                 │
│    ○ ──────→ ● ─────→ [pocket]                  │
│         (aim)    (ball path)                    │
│                          ○ ← ghost cue position │
│                                                 │
│   "Drill 3 of 8"              "45° cut shot"   │
│                                                 │
│    Tap anywhere = next drill                    │
│    Tap & hold / two-finger tap = back to menu   │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Navigation model (touch on tablet):**
- **Tap** → next drill in sequence
- **Tap & hold** or **two-finger tap** → prompt "Exit to menu?" (projected on table)
- **Swipe left/right** → prev/next drill (optional)
- No hidden controls, no split-screen tricks — what you see on tablet = what's on the table

### Display & Scaling Strategy

**Chosen approach: Mirror mode**
- Tablet/PC mirrors display to projector via HDMI/Miracast/AirPlay
- Browser enters **fullscreen** via Fullscreen API (`document.documentElement.requestFullscreen()`)
- Single keypress or tap enters fullscreen — removes address bar and OS chrome
- Projector handles final output scaling from the mirrored display

**Aspect-ratio-locked canvas:**
- Table has fixed aspect ratio (9-foot = 50"×100" = 1:2, 7-foot = 38"×76" ≈ 1:2)
- Canvas fills viewport, maintains table aspect ratio, letterboxes with black bars
- Black letterboxing is invisible on felt — it just works
- Scale factor: `Math.min(viewWidth / tableWidth, viewHeight / tableHeight)`
- All coordinates are in "table units" (inches), one transform handles all scaling

**Resolution independence:**
- Works on any resolution: 1080p projector, 4K monitor, tablet
- Uses `devicePixelRatio` for crisp lines on high-DPI displays
- Ball sizes, line widths, text all scale relative to table, not pixels

**Input:**
- Unified `pointer` events (covers mouse, touch, and pen)
- Works identically on PC and tablet

### Mobile remote control (phone-as-controller)

When practicing at the table, the player needs to advance drills without walking to the rendering device. A phone in your pocket solves this.

**Architecture:**
```
Phone browser ←→ WebSocket ←→ server.js ←→ Main browser (projector)
```

**How it works:**
- `server.js` (already exists, Express) adds a WebSocket endpoint
- Main app connects as a WS client, listens for commands
- Phone opens `http://<local-ip>:3000/remote` — a minimal page with large touch buttons
- QR code projected on the table at startup for instant phone pairing (encodes the `/remote` URL)

**Remote page UI (phone):**
```
┌─────────────────┐
│                 │
│   ◀  PREV      │
│                 │
│   ▶  NEXT      │   ← big fat touch targets, full-width
│                 │
│   ☰  MENU      │
│                 │
│  ⚙  CALIBRATE  │   ← optional: nudge corners from phone
│                 │
└─────────────────┘
```

**Commands:** `next`, `prev`, `menu`, `rack9`, `rack8`, `clear`

**Complexity:** Low — ~50 lines server (ws/socket.io), ~30 lines main app listener, ~80 lines remote page. No auth needed on local network.

**Why not Bluetooth keyboard?** Works, but phone is always in your pocket. The remote page can also show drill info (name, step count) that isn't visible on the projected table from all angles.

### Optional: physics simulation

You already have **Matter.js** in your lib folder. You could add an optional "simulate shot" feature:
- User sets cue ball position + aim direction + speed
- Matter.js simulates the collision and ball paths
- Show predicted ball positions after the shot
- This is a "wow" feature but not required for MVP

### MVP timeline estimate

The core is much simpler than the SVG editor because:
- Fixed set of objects (16 balls, not thousands of icons)
- Table is always the same shape
- No complex path editing needed
- Shot lines are simple geometry (line segments + angles)

### Suggested build order

1. **Table renderer** — accurate proportions, pockets, diamonds on Paper.js canvas, black background ✅
2. **Ball placement** — draggable numbered balls with snapping ✅
3. **Shot lines** — click cue ball, drag to set aim, show projected paths ✅
4. **Drill save/load** — serialize ball positions + shot lines to JSON ✅
5. **Drill library** — menu projected on table, browse/load drills with tap navigation ✅
6. **Projection mode + Calibration** — P=toggle projection overlay, K=4-corner homography calibration ✅
7. **Mobile remote** — WebSocket phone controller (next/prev/menu via big touch buttons, QR code pairing)
8. **Touch navigation** — tap = next, hold/two-finger = exit to menu, large touch targets
9. **Polish** — English indicators, speed markers, difficulty tags


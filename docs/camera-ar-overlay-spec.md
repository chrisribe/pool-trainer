# Camera AR Overlay — Feature Spec

## Summary

Mount a phone/tablet above or beside the pool table with a fixed camera. Display the live camera feed with ghost-ball overlays on an external screen (TV, monitor, tablet via AirPlay/Chromecast/HDMI). The player uses the visual guide to place real balls on ghost positions, executes the shot, and the app automatically tracks success/failure and records stats.

No projector required. No extra hardware beyond a phone stand and any screen.

---

## Goals

- Live camera feed underlaid beneath the existing canvas overlay
- Ghost ball positions rendered on top of the feed, aligned to physical table via homography calibration
- Automatic ball detection to confirm placement and detect pocketed balls
- Shot outcome recorded automatically (no manual input)
- Success rate, streaks, and session stats tracked per drill and per player
- All data stored locally, shareable peer-to-peer via Pear/Hypercore

## Non-Goals

- No projector support (out of scope for this branch)
- No cloud backend
- No native app (browser-only via getUserMedia)

---

## Architecture

### New module: `camera.js`

Responsibilities:
- Request getUserMedia with rear/environment camera
- Render camera feed to a background video element sized to the canvas
- Expose PT.camera.start(), PT.camera.stop(), PT.camera.snapshot()

### New module: `ball-detector.js`

Responsibilities:
- Run color blob detection on a downsampled canvas snapshot (no OpenCV — pure canvas pixel ops)
- Detect circular regions matching expected ball colors/sizes
- Return array of { x, y, radius, confidence } in canvas coordinates
- Apply inverse homography to get table coordinates
- Expose PT.ballDetector.detect() => Promise<DetectedBall[]>

Detection approach (v1 — no ML):
1. Snapshot video frame to offscreen canvas
2. Downsample to 320x160 for performance
3. HSV threshold per ball color (white cue ball, solid/stripe colors)
4. Connected component bounding boxes as circle approximation
5. Filter by radius range based on calibration scale

### New module: `tracker.js`

Responsibilities:
- Compare detected ball positions to expected drill positions
- Determine placement readiness (all balls within tolerance)
- Detect ball disappearance (pocketed) after shot
- Record shot outcome: { drillId, shotId, success, timestamp, sessionId }
- Compute per-drill stats: attempts, successes, rate, best streak
- Compute per-session stats: drills completed, total shots, duration, score
- Persist to localStorage (key: poolTrainer_stats)
- Expose PT.tracker.recordShot(outcome), PT.tracker.getStats(drillId), PT.tracker.getSession()

### Updates to `app-core.js`

- Add cameraMode flag
- When cameraMode is on: start camera, run detector loop (10fps detection, 60fps render)
- Placement readiness: ghost balls turn green when real ball is within tolerance
- Post-shot: run detector to confirm pocketed balls => auto-record outcome

### Updates to `views/`

- New: StatsView — per-drill chart (success rate over last N sessions), streak, session summary
- New: CameraSetupView — permission request, feed preview, calibration trigger
- Update: DrillHUD — ghost color feedback, shot outcome flash

---

## UI / UX Flow

[Menu] => [Drill List] => [Drill Detail]
                               |
                    [Camera Setup View]  <- first time only
                    - grant permission
                    - preview feed
                    - trigger calibration if needed
                               |
                    [Drill HUD - AR mode]
                    - live feed background
                    - ghost balls overlay
                    - ghosts turn green as balls placed
                    - "Shoot!" when all confirmed
                               |
                    [Shot Result]
                    - success/fail auto-detected
                    - streak counter update
                    - tap to retry or next drill
                               |
                    [Session Summary]
                    - drills completed, success rate, personal best deltas

---

## Stats Data Model

```
// localStorage: poolTrainer_stats
{
  sessions: [
    {
      id: "sess_<timestamp>",
      startedAt: "<ISO>",
      endedAt: "<ISO>",
      shots: [
        {
          drillId: "drill_9ball_break",
          shotId: "shot_01",
          success: true,
          timestamp: "<ISO>"
        }
      ]
    }
  ]
}

// Derived (computed on read):
// successRate(drillId) = successes / attempts
// streak(drillId)     = current consecutive successes
// bestStreak(drillId) = max consecutive successes ever
```

---

## Pear / P2P Integration (future — not this branch)

- Each player stats feed => Hypercore append-only log
- Shareable by Hypercore public key
- Leaderboard = aggregate of subscribed peer feeds
- Daily challenge drill = publisher Hypercore replicated to all peers
- No central server, no auth

---

## Implementation Phases

### Phase 1 — Camera feed + calibration (spike)
- camera.js: getUserMedia, background video render
- Wire into calibration: camera on during calibration for easier corner alignment
- Deliverable: real table visible with ghost overlay aligned

### Phase 2 — Ball detection
- ball-detector.js: blob detection on snapshots
- Start with white cue ball (highest contrast)
- Deliverable: cue ball position detected and shown on overlay

### Phase 3 — Placement confirmation
- Wire detector into drill HUD
- Ghost turns green when real ball within 1.5x ball radius of ghost position
- Deliverable: "Ready" fires when all balls confirmed

### Phase 4 — Shot outcome detection
- Detect ball count drop post-shot (pocketed = disappeared from frame)
- Auto-record success/failure
- Deliverable: shots recorded without manual input

### Phase 5 — Stats UI
- StatsView: per-drill chart, streaks, session summary
- Deliverable: full stats screen from menu

---

## Open Questions

1. Camera angle: top-down ideal, side angle acceptable? Affects homography accuracy.
2. Lighting: pool table lights create harsh shadows — HSV tuning needed per environment.
3. Placement tolerance: what threshold in cm is acceptable for ball confirmation?
4. Screen mirroring latency: AirPlay/Chromecast adds 200-500ms — acceptable?
5. Multi-ball detection: complexity increases with 9+ balls. Phase 2 targets cue ball only.

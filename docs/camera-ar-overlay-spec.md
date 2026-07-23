# Camera AR Overlay - Feature Spec
_Revised after Claude Opus review - v2_

## Summary

Mount a phone/tablet **fixed** above the pool table. Display the live camera feed with ghost-ball overlays on an external screen. Player places real balls on ghost positions, shoots, app auto-records result.

No projector. No ML/TensorFlow. No extra hardware beyond a phone stand and any screen.

**Fixed camera = background subtraction = simple detection. No ML needed.**

---

## Why Fixed Camera Simplifies Everything

With a fixed camera, the background (green felt) is constant.
Pixel diff finds blobs reliably. Ball = bright circle on uniform green.
Detectable in ~15 lines of canvas code. No TensorFlow. No OpenCV.

---

## New Modules

### camera.js
- getUserMedia (rear camera, 1280x720)
- Background video element under canvas
- PT.camera.start() / stop() / snapshot() => ImageData

### ball-detector.js (background subtraction)
1. captureReference() - snapshot empty table
2. detect() - diff current frame vs reference
3. Pixels with high luminance delta = foreground blobs
4. Connected components => bounding circles
5. Filter by expected ball radius (from calibration scale)
6. Inverse homography => table coordinates
- Runs in Web Worker at 5fps
- Falls back to main thread at 2fps if no Worker support

### tracker.js
- Compare detected positions to drill ghost positions
- Placement tolerance: 1.5x ball diameter
- Post-shot: detect() 2s after Done tap => missing ball = pocketed = success
- Record: { drillId, shotId, success, timestamp, sessionId }
- Stats: successRate, streak, bestStreak per drill
- Persist: localStorage key poolTrainer_stats

---

## UX Flow

[Drill Detail]
  |
[Camera Setup] <- first time only
  1. Grant permission
  2. Clear table => capture reference frame
  3. Drag 4 corners to calibrate
  |
[Drill HUD]
  - Gray ghost  => not placed
  - Yellow ghost => ball nearby
  - Green ghost  => confirmed
  - Shoot! when all green
  |
[Done tap] => 2s delay => auto-detect => record result
  |
[Result + streak] => retry or next drill
  |
[Session Summary]

---

## Stats Data Model

sessionStorage key: poolTrainer_stats
{
  sessions: [{
    id: "sess_<ts>", startedAt, endedAt,
    shots: [{ drillId, shotId, success, timestamp }]
  }]
}
Derived: successRate(drillId), streak(drillId), bestStreak(drillId)

---

## Key Risks

Risk                         | Mitigation
Phone bumped                 | Recalibrate shortcut always visible
Lens distortion              | Homography absorbs most; flat top-mount recommended
Variable lighting            | Reference captured under actual conditions
Arm over table = false blob  | Detection paused during shot; large blobs filtered
Screen mirroring 200-500ms   | Acceptable for placement; documented constraint

---

## Phases

1. Camera + calibration - video feed + corner alignment
2. Cue ball detection - background subtraction, white ball first
3. Placement confirmation - ghost color feedback, Shoot! state
4. Auto shot recording - detect after Done tap, zero manual input
5. Stats UI - per-drill chart, streaks, session summary

---

## Pear / P2P (future)

- Stats feed => Hypercore log, shareable by key
- Leaderboard = P2P aggregate of peer feeds
- Daily challenge = publisher Hypercore to all peers

# Camera AR Overlay - Feature Spec
_Revised after Claude Opus review - v3_

## Hardware Setup (reference)

This setup already exists in the pool community - teams film games with phones on tripods.

```
  [Phone on tripod]
       above
  [Pool Table]
       +
  [Tablet on rail / beside table]
```

- **Phone on tripod** = fixed overhead camera
- **Tablet** = interactive display showing live feed + ghost overlay
  - Placed flat on the rail or propped beside the table
  - Player looks down at tablet to see ghost positions
  - Touch to confirm shot
- No TV, no HDMI, no projector needed
- Both devices players already own

---

## Summary

Phone on tripod captures the table. Tablet displays the live camera feed with ghost-ball overlay. Player places real balls matching the ghosts, taps the tablet to confirm, shoots. App auto-records success/failure.

No projector. No ML/TensorFlow. No extra hardware beyond tripod + tablet.

---

## Why Fixed Camera Simplifies Detection

With a fixed camera on tripod:
- Background (green felt) is constant => pixel diff finds blobs reliably
- Ball = bright circle on uniform green => ~15 lines of canvas code
- No TensorFlow. No OpenCV (revisit only if real-world accuracy < 80%).
- Background subtraction + connected components is sufficient for v1.

---

## Architecture - New Modules

### camera.js
- getUserMedia (rear camera, 1280x720)
- Background video element under canvas
- PT.camera.start() / stop() / snapshot() => ImageData
- Camera selection: prefer environment-facing (phone), accept any (tablet preview)

### ball-detector.js (background subtraction)
1. captureReference() - snapshot empty table
2. detect() - diff current frame vs reference
3. Pixels with high luminance delta = foreground blobs
4. Connected components => bounding circles
5. Filter by expected ball radius (from calibration scale)
6. Inverse homography => table coordinates
- Runs in Web Worker at 5fps
- Falls back to main thread at 2fps if no Worker support
- OpenCV.js upgrade path if accuracy < 80% in real conditions

### tracker.js
- Compare detected positions to drill ghost positions
- Placement tolerance: 1.5x ball diameter
- Post-shot: detect() 2s after tap => missing ball = pocketed = success
- Record: { drillId, shotId, success, timestamp, sessionId }
- Stats: successRate, streak, bestStreak per drill
- Persist: localStorage key poolTrainer_stats

---

## UX Flow (tablet as interactive display)

[Drill Detail]
  |
[Camera Setup] <- first time only
  1. Enter camera URL or scan QR (phone stream => tablet)
  2. Preview feed on tablet - confirm table fully visible
  3. Clear table => tap to capture reference frame
  4. Drag 4 corners to align ghost overlay to table
  |
[Drill HUD on tablet]
  - Live feed background (phone camera via WebRTC or local network)
  - Ghost balls overlay aligned to table
  - Gray ghost  => not placed
  - Yellow ghost => ball nearby
  - Green ghost  => confirmed in position
  - Shoot! badge when all green
  |
[Player shoots]
  => Tap tablet "Done" (or auto-detect 2s after all ghosts go gray = balls moved)
  => Auto-detect result
  |
[Result flash + streak update]
  => Retry or next drill
  |
[Session Summary]

---

## Camera Streaming (phone => tablet)

Two options:

**Option A - Same device (tablet only)**
- Tablet is both camera and display
- Simpler, works immediately
- Less ideal camera angle (tablet not overhead)

**Option B - Phone camera + tablet display (preferred)**
- Phone streams via existing WebSocket/WebRTC on local network
- Tablet connects to phone IP to receive feed
- Pool trainer already has WebSocket remote control - reuse this channel
- QR code on tablet => phone scans => starts streaming

---

## Stats Data Model

localStorage key: poolTrainer_stats
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
Phone bumped on tripod       | Recalibrate shortcut always visible; visible drift is obvious
Lens distortion              | Homography absorbs most; vertical top-mount works best
Variable lighting            | Reference captured under actual conditions
Arm over table = false blob  | Detection paused during shot; large blobs filtered by radius
Network latency phone=>tablet| Local WiFi only, <50ms; no internet required
Detection accuracy < 80%     | OpenCV.js upgrade path documented, easy to swap in

---

## Phases

1. Camera + calibration - video feed + 4-corner alignment (tablet solo first)
2. Phone => tablet streaming - reuse WebSocket channel + QR pairing
3. Cue ball detection - background subtraction, white ball first
4. Placement confirmation - ghost color feedback (gray/yellow/green), Shoot! state
5. Auto shot recording - detect after Done tap, zero manual input
6. Stats UI - per-drill chart, streaks, session summary

---

## Pear / P2P (future)

- Stats feed => Hypercore log, shareable by key
- Watch active players, see rankings, daily challenge drill
- No central server, no auth

---

## Phase 6 - Video Recording (shot clips)

- MediaRecorder API on getUserMedia stream - ~20 lines, no library
- Record 15s window per shot (5s before Shoot! tap + 10s after)
- Clip reference stored in shot record: { drillId, shotId, success, clipUrl, timestamp }
- Clips stored in IndexedDB (localStorage too small for video)
- Replay from stats: tap any shot => plays clip
- Share via Pear: clip blobs streamable as Hypercore entries

## Phase 7 - Motion Capture (ball trajectory replay)

- Track all balls in motion frame-by-frame during shot
- Each ball = trajectory array [{ x, y, t }] at 30fps
- Challenge: motion blur => use last known position + velocity estimation
- Stored alongside shot record
- Replay: animate ghost balls along captured trajectories on canvas
- Use cases: see exactly where cue ball deflected, identify pattern errors
- Coach mode: review trajectories with overlay annotations

Note: Phase 7 is the natural trigger to revisit OpenCV.js (motion blur handling).

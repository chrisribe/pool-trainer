# Pool Physics Rewrite Plan

Reference: Alberta University pool simulator (p5.js)  
- https://sites.ualberta.ca/~dnobes/Teaching_Section/NOBES_SIM_Pool.html  
- Source: `Simulations/Pool/js/pool.js`, `poolFBD.js`, `poolInput.js`

## Current State Summary

### What works
- `cueBallLaunch()` — power→speed mapping, squirt model, spin from tip offset
- `applyCBSpin()` — post-collision topspin/draw/sidespin effect on CB path
- `solveShotForPocket()` — iterative aim solver (depends on simulation accuracy)
- `physics-tests.js` — 3 test suites + calibration tool, visual + console

### What's broken or weak

| Issue | Location | Severity |
|---|---|---|
| Collision assumes OB stationary, ad-hoc formula instead of general CoR | `ballCollision()` | Critical |
| No overlap separation — balls can stick/tunnel | `ballCollision()` | Moderate |
| Cushion bounce applies `E_RAIL` to BOTH axes (double energy loss) | `simulateRoll()` | Bug |
| Decel skipped on bounce frames | `simulateRoll()` | Minor |
| Only simulates 1 CB + 1 OB — no cascading collisions | `simulateShot()` | Critical (future) |
| `E_RAIL=0.82` too high, `E_BALL=0.96` slightly high | constants | Tuning |

### Alberta's approach (what to adopt)
- **Rotated-axis collision**: compute φ (line-of-centers angle), rotate velocities into collision frame, apply 1D CoR formula `vtfx = (m1*v1x + m2*v2x + m2*e*(v2x-v1x))/(m1+m2)`, preserve tangential, rotate back
- **Overlap separation**: push apart by `0.51 × overlap` after collision
- **Component decel with sign-flip guard**: no overshoot through zero
- **Full N-ball loop**: all balls stepped together, all pairs checked each frame

### What we have that Alberta lacks (keep)
- Spin system (topspin/draw, english/sidespin, squirt, throw)
- Cue overlay (tip position + power visualization)
- Auto-solver
- Test infrastructure

---

## Phases

### Phase 1: Replace collision kernel
- [x] **File:** `pool-physics.js` — rewrite `ballCollision()`
- [x] New signature: `ballCollision(b1vx, b1vy, b2vx, b2vy, b1x, b1y, b2x, b2y, sidespin)`
- [x] Use rotated-axis method:
  1. `phi = atan2(dy, dx)` — angle of line of centers
  2. Rotate both velocity vectors into collision frame
  3. Apply 1D CoR: `v1fx = (m1*v1x + m2*v2x + m2*e*(v2x - v1x)) / (m1 + m2)`
  4. Tangential components unchanged: `v1fy = v1y'`, `v2fy = v2y'`
  5. Rotate back to world frame
- [x] Layer throw model on top (rotate OB exit direction by throw angle)
- [x] Add overlap separation: push each ball back `0.51 × overlap` along line-of-centers
- [x] Backward-compat wrapper: old callers pass `b2vx=0, b2vy=0` for stationary OB
- [x] **Tests:** existing `runCollisionTransferTests` must still pass
- [x] **New test:** both-balls-moving collision case

### Phase 2: Fix `simulateRoll()` deceleration + cushion model
- [x] **File:** `pool-physics.js` — edit `simulateRoll()`
- [x] Cushion bounce: only reverse+scale the perpendicular component; leave parallel component untouched
  - Left/right rail: `vx = -vx * E_RAIL` (vy unchanged)
  - Top/bottom rail: `vy = -vy * E_RAIL` (vx unchanged)
- [x] Apply deceleration on EVERY frame (including bounce frames — currently skipped)
- [x] Use sign-flip guard per component to prevent oscillation at near-zero speeds
- [x] **Tests:** roll distance + bounce count tests (adjust bounds if needed)

### Phase 3: Retune constants
- [x] **File:** `pool-physics.js` — constant values

| Constant | Current | New | Reason |
|---|---|---|---|
| `E_RAIL` | 0.82 | 0.70 | Real cushions: 0.60–0.75 |
| `E_BALL` | 0.96 | 0.93 | Standard: 0.92–0.95 |
| `DECEL` | 8 | 8 | Keep (fast cloth range 7–15) |

- [x] Run `PT.calibrate()` to verify
- [x] Adjust test bounds in `physics-tests.js` if needed

### Phase 4: Multi-ball simulation engine
- [x] **File:** `pool-physics.js` — add `simulateBalls(states[], opts)`
- [ ] Input: array of `{ x, y, vx, vy, spin, id }` per ball
- [x] Shared step loop:
  1. Move all balls by `v * dt`
  2. Check all ball-ball pairs (N*(N-1)/2) for overlap → `ballCollision()`
  3. Check cushion bounces per ball
  4. Apply deceleration per ball
  5. Check pockets per ball
  6. Record path samples per ball
- [x] Returns: `{ paths: { [id]: [{x,y}] }, pocketed: { [id]: pocketName }, balls: [...] }`
- [x] Rewrite `simulateShot()` to build states from CB launch + all OBs and call `simulateBalls()`
- [x] Keep old `simulateRoll()` for single-ball-only callers (tests, calibration)
- [x] **Tests:** combo shot test (CB → OB1 → OB2), existing single-OB tests as regression

### Phase 5: Update `shots.js` integration
- [x] **File:** `shots.js`
- [x] Add dedicated Physics Tests menu entry and submenu for phased test runs
- [x] Add menu navigation aliases (`next`/`prev`, `N`/`P`) in menu contexts
- [x] Update `autoSolve()` to pass all table balls into multi-ball simulation
- [x] Update simulation preview (S key) to draw paths for all affected balls
- [x] Draw pocketed indicators for multiple balls
- [x] Update result text to report all pocketed balls

---

## Dependency Order

```
Phase 1 ──→ Phase 2 ──→ Phase 3
                              │
                              ▼
                         Phase 4 ──→ Phase 5
```

Phases 1–3: incremental fixes, no API shape changes, safe to ship individually.  
Phases 4–5: structural change, ship together.

## Validation Checkpoints

After each phase, run:
```js
PT.runPhysicsTests()           // roll + boundary + pocket tests
PT.runCueBallPhysicsTests()    // power ladder + decel estimation
PT.runCollisionTransferTests() // collision speed transfer + energy
PT.calibrate()                 // distance table vs real-world reference
```

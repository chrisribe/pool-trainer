/* ================================================================
   Pool Trainer — pool-physics.js
   Forward simulation & auto-solver for cue overlay values.
   All coordinates in table inches (same as table-config.js).
   ================================================================ */

(function () {
    'use strict';

    var cfg = PT.cfg;

    // ── Physics constants ──
    var BALL_RADIUS  = cfg.ballRadius;           // 1.125"
    var BALL_MASS    = 6.0;                      // oz (standard pool ball)
    var RAIL_LEFT    = cfg.railWidth;
    var RAIL_TOP     = cfg.railWidth;
    var RAIL_RIGHT   = cfg.railWidth + cfg.playWidth;
    var RAIL_BOTTOM  = cfg.railWidth + cfg.playHeight;

    // Friction & restitution
    // Real cloth deceleration: ~7 in/s² (fast cloth) to ~15 in/s² (slow cloth)
    var DECEL        = 8;       // deceleration in inches/sec² (cloth friction)
    var MU_SLIDE     = 0.2;     // sliding friction (ball on cloth while spinning)
    var MU_BALL      = 0.05;    // ball-ball contact friction (causes throw)
    var E_BALL       = 0.93;    // ball-ball coefficient of restitution
    var E_RAIL       = 0.70;    // ball-cushion coefficient of restitution

    // Spin constants
    var SQUIRT_K     = 2.0;     // degrees of squirt per unit of english at medium speed
    var SPIN_DECAY   = 0.015;   // spin decay per inch traveled

    // Simulation
    var DT           = 0.005;   // time step in seconds (200 Hz)
    var MAX_TIME     = 15;      // max simulation time in seconds
    var MAX_DISTANCE = 600;     // max travel before giving up (inches)
    var POCKET_CATCH = 2.5;     // radius from pocket center to count as sunk (≈ pocket radius)

    // ── Pocket centers — must match table-draw.js drawPockets() ──
    function getPockets() {
        var cDiag   = cfg.cornerPocketShelf * 0.7;          // same as table-draw.js
        var sOffset = cfg.sidePocketShelf + cfg.sidePocketRadius;

        return [
            { x: RAIL_LEFT  - cDiag,   y: RAIL_TOP    - cDiag,             name: 'TL' },
            { x: RAIL_RIGHT + cDiag,   y: RAIL_TOP    - cDiag,             name: 'TR' },
            { x: RAIL_LEFT  - cDiag,   y: RAIL_BOTTOM + cDiag,             name: 'BL' },
            { x: RAIL_RIGHT + cDiag,   y: RAIL_BOTTOM + cDiag,             name: 'BR' },
            { x: RAIL_LEFT  - sOffset, y: RAIL_TOP + cfg.playHeight / 2,   name: 'ML' },
            { x: RAIL_RIGHT + sOffset, y: RAIL_TOP + cfg.playHeight / 2,   name: 'MR' }
        ];
    }

    // Check if a position is near any pocket (suppress cushion bounce there).
    // Uses a slightly larger radius than POCKET_CATCH so balls heading toward
    // a pocket don't bounce off the rail just before reaching the catchment.
    var POCKET_ZONE = 4.0;  // cushion-suppression zone radius around pocket centers

    function nearPocket(px, py, pockets) {
        for (var i = 0; i < pockets.length; i++) {
            if (dist(px, py, pockets[i].x, pockets[i].y) < POCKET_ZONE) return true;
        }
        return false;
    }

    // ── Vector helpers ──
    function len(vx, vy) { return Math.sqrt(vx * vx + vy * vy); }
    function dist(ax, ay, bx, by) { return len(bx - ax, by - ay); }
    function dot(ax, ay, bx, by) { return ax * bx + ay * by; }
    function normalize(vx, vy) {
        var l = len(vx, vy);
        return l > 1e-9 ? { x: vx / l, y: vy / l } : { x: 0, y: 0 };
    }

    // ── 1. Cue ball launch ──
    // Given tip offset (normalized -0.8..0.8) and power (0..1),
    // compute initial velocity vector and spin.
    //
    // tipX >0 = right english, tipY >0 = below center (topspin),
    // tipY <0 = above center (backspin/draw)
    //
    // Note: tip coordinates follow the cue-overlay convention where
    // positive-Y is downward on the overlay (toward bottom of cue ball),
    // which means topspin. This matches the visual: hitting low = draw.

    function cueBallLaunch(tipX, tipY, power, aimAngle) {
        // Speed mapping:
        // - power <= 0 => 0 speed (no shot)
        // - power 0..1 => ~20..100 inches/sec for normal-play calibration
        var p = Math.max(0, Math.min(1, (typeof power === 'number') ? power : 0));
        var speed = (p <= 0) ? 0 : (20 + p * 80);

        // Squirt — english deflects the cue ball initially.
        // More english + less speed = more squirt.
        var squirtDeg = SQUIRT_K * tipX * (1 / (0.3 + speed / 60));
        var squirtRad = squirtDeg * Math.PI / 180;

        var launchAngle = aimAngle + squirtRad;

        var vx = Math.cos(launchAngle) * speed;
        var vy = Math.sin(launchAngle) * speed;

        // Spin from tip offset
        // tipY < 0 (above center) → backspin, tipY > 0 → topspin
        // tipX → sidespin (english)
        var topspin  = tipY * speed * 0.6;   // positive = topspin
        var sidespin = tipX * speed * 0.5;   // positive = right english

        return {
            vx: vx,
            vy: vy,
            speed: speed,
            topspin: topspin,
            sidespin: sidespin,
            squirtDeg: squirtDeg
        };
    }

    // ── 2. Ball-ball collision kernel + throw ──
    // Uses a rotated-axis CoR solve (works for both balls moving).
    // Signature:
    //   ballCollision(b1Vx, b1Vy, b2Vx, b2Vy, b1X, b1Y, b2X, b2Y, sidespin)

    function ballCollision(b1Vx, b1Vy, b2Vx, b2Vy, b1X, b1Y, b2X, b2Y, cueSidespin) {
        cueSidespin = cueSidespin || 0;

        var dx = b2X - b1X;
        var dy = b2Y - b1Y;
        var d = len(dx, dy);
        if (d < 1e-6) return null;

        // Ball centers line; require approach on this axis.
        var nx = dx / d;
        var ny = dy / d;
        var relNormal = dot(b1Vx - b2Vx, b1Vy - b2Vy, nx, ny);
        if (relNormal <= 0) return null;

        // Rotate into collision frame where +x is line-of-centers.
        var phi = Math.atan2(dy, dx);
        var c = Math.cos(phi);
        var s = Math.sin(phi);

        // World -> collision frame
        var b1x = b1Vx * c + b1Vy * s;
        var b1y = -b1Vx * s + b1Vy * c;
        var b2x = b2Vx * c + b2Vy * s;
        var b2y = -b2Vx * s + b2Vy * c;

        // 1D CoR solve on normal axis; tangential remains unchanged.
        var m1 = BALL_MASS;
        var m2 = BALL_MASS;
        var b1fx = (m1 * b1x + m2 * b2x + m2 * E_BALL * (b2x - b1x)) / (m1 + m2);
        var b2fx = (m1 * b1x + m2 * b2x + m1 * E_BALL * (b1x - b2x)) / (m1 + m2);
        var b1fy = b1y;
        var b2fy = b2y;

        // Collision frame -> world
        var cbVx = b1fx * c - b1fy * s;
        var cbVy = b1fx * s + b1fy * c;
        var obVx = b2fx * c - b2fy * s;
        var obVy = b2fx * s + b2fy * c;

        // Throw based on relative cut + english; preserve OB speed magnitude.
        var relTan = b1y - b2y;
        var cutAngle = Math.atan2(Math.abs(relTan), Math.max(1e-6, relNormal));
        var throwAngle = MU_BALL * Math.sin(cutAngle * 2) * 0.5;
        throwAngle += cueSidespin * 0.003;
        throwAngle = Math.max(-3 * Math.PI / 180, Math.min(3 * Math.PI / 180, throwAngle));

        var obSpeed = len(obVx, obVy);
        if (obSpeed > 1e-6 && Math.abs(throwAngle) > 1e-8) {
            var obDirX = obVx / obSpeed;
            var obDirY = obVy / obSpeed;
            var rotObX = obDirX * Math.cos(throwAngle) - obDirY * Math.sin(throwAngle);
            var rotObY = obDirX * Math.sin(throwAngle) + obDirY * Math.cos(throwAngle);
            obVx = rotObX * obSpeed;
            obVy = rotObY * obSpeed;
        }

        // Resolve overlap to avoid sticking/tunneling on the next frame.
        var correctedB1X = b1X;
        var correctedB1Y = b1Y;
        var correctedB2X = b2X;
        var correctedB2Y = b2Y;
        var overlap = BALL_RADIUS * 2 - d;
        if (overlap > 0) {
            var push = overlap * 0.51;
            correctedB1X -= nx * push;
            correctedB1Y -= ny * push;
            correctedB2X += nx * push;
            correctedB2Y += ny * push;
        }

        return {
            obVx: obVx,
            obVy: obVy,
            obSpeed: len(obVx, obVy),
            cbVx: cbVx,
            cbVy: cbVy,
            cutAngleDeg: cutAngle * 180 / Math.PI,
            throwAngleDeg: throwAngle * 180 / Math.PI,
            cbX: correctedB1X,
            cbY: correctedB1Y,
            obX: correctedB2X,
            obY: correctedB2Y
        };
    }

    // ── 3. Apply spin to cue ball post-collision ──
    // Topspin/backspin changes the cue ball path vs. the pure tangent line.
    // Stun (no spin) → 90° deflection. Follow → less. Draw → more / reverse.

    function applyCBSpin(cbVx, cbVy, topspin, sidespin, nx, ny) {
        // nx,ny = line-of-centers direction (toward where OB was)
        // Topspin pushes CB forward (along nx,ny), backspin pulls back
        var spinForward = topspin * 0.015;
        cbVx += nx * spinForward;
        cbVy += ny * spinForward;

        // Sidespin curves the path (modeled as lateral velocity component)
        var tx = -ny;
        var ty = nx;
        cbVx += tx * sidespin * 0.005;
        cbVy += ty * sidespin * 0.005;

        return { vx: cbVx, vy: cbVy };
    }

    // ── 4. Roll simulation (decelerate to stop) ──
    // Returns array of {x, y} points along the path, plus final position.

    function simulateRoll(startX, startY, vx, vy, sidespin, opts) {
        opts = opts || {};
        var ignorePockets = !!opts.ignorePockets;
        var x = startX;
        var y = startY;
        var totalDist = 0;
        var totalTime = 0;
        var path = [{ x: x, y: y }];
        var speed = len(vx, vy);
        var spin = sidespin || 0;

        // Sample path every N steps to control output size
        var sampleInterval = 4;
        var stepCount = 0;

        while (speed > 0.3 && totalDist < MAX_DISTANCE && totalTime < MAX_TIME) {
            // Move by velocity * dt
            var stepDist = speed * DT;
            var nx = vx / speed;
            var ny = vy / speed;

            x += vx * DT;
            y += vy * DT;
            totalDist += stepDist;
            totalTime += DT;

            // Sidespin curves the path (gradual lateral deflection)
            if (Math.abs(spin) > 0.01) {
                var curve = spin * 0.0002 * DT;
                x += (-ny) * curve;
                y += nx * curve;
                spin *= (1 - SPIN_DECAY * stepDist);
            }

            // Check pockets BEFORE cushion bounces — pockets are holes in the rail.
            // Tests can disable this for pure distance/bounce validation.
            if (!ignorePockets) {
                var pockets = getPockets();
                for (var pi = 0; pi < pockets.length; pi++) {
                    if (dist(x, y, pockets[pi].x, pockets[pi].y) < POCKET_CATCH) {
                        path.push({ x: x, y: y });
                        return { path: path, finalX: x, finalY: y, pocketed: pockets[pi].name, distance: totalDist };
                    }
                }
            }

            // Cushion bounces — suppress near pockets so balls can fall in.
            // Use abs() to guarantee velocity always points away from wall,
            // even if a ball-ball overlap correction pushed the ball into the
            // rail while its velocity was already pointing away.
            var bounced = false;
            var _nearPocket = !ignorePockets && nearPocket(x, y, getPockets());
            if (!_nearPocket) {
                if (x - BALL_RADIUS < RAIL_LEFT) {
                    x = RAIL_LEFT + BALL_RADIUS;
                    vx = Math.abs(vx) * E_RAIL;
                    spin *= -0.6;
                    bounced = true;
                } else if (x + BALL_RADIUS > RAIL_RIGHT) {
                    x = RAIL_RIGHT - BALL_RADIUS;
                    vx = -Math.abs(vx) * E_RAIL;
                    spin *= -0.6;
                    bounced = true;
                }
                if (y - BALL_RADIUS < RAIL_TOP) {
                    y = RAIL_TOP + BALL_RADIUS;
                    vy = Math.abs(vy) * E_RAIL;
                    spin *= -0.6;
                    bounced = true;
                } else if (y + BALL_RADIUS > RAIL_BOTTOM) {
                    y = RAIL_BOTTOM - BALL_RADIUS;
                    vy = -Math.abs(vy) * E_RAIL;
                    spin *= -0.6;
                    bounced = true;
                }
            }

            // Cloth deceleration every frame, including bounce frames.
            speed = len(vx, vy);
            if (speed > 1e-9) {
                var oldVx = vx;
                var oldVy = vy;
                var ax = -DECEL * (vx / speed);
                var ay = -DECEL * (vy / speed);

                vx += ax * DT;
                vy += ay * DT;

                if (oldVx !== 0 && Math.sign(oldVx) !== Math.sign(vx)) vx = 0;
                if (oldVy !== 0 && Math.sign(oldVy) !== Math.sign(vy)) vy = 0;

                speed = len(vx, vy);
            }

            stepCount++;
            if (stepCount % sampleInterval === 0 || bounced) {
                path.push({ x: x, y: y });
            }
        }

        // Final point
        if (path.length === 0 || path[path.length - 1].x !== x || path[path.length - 1].y !== y) {
            path.push({ x: x, y: y });
        }

        return { path: path, finalX: x, finalY: y, pocketed: null, distance: totalDist };
    }

    // ── 5. Multi-ball simulation ──
    // Simulates all balls in a shared timestep loop.

    function simulateBalls(states, opts) {
        opts = opts || {};
        var ignorePockets = !!opts.ignorePockets;
        var sampleInterval = 4;
        var pockets = getPockets();
        var collisionCount = 0;
        var totalTime = 0;
        var stepCount = 0;

        var balls = (states || []).map(function (s, idx) {
            var id = (s && s.id !== undefined) ? s.id : idx;
            return {
                id: id,
                x: s.x,
                y: s.y,
                vx: s.vx || 0,
                vy: s.vy || 0,
                sidespin: s.sidespin || 0,
                pocketed: null,
                distance: 0,
                path: [{ x: s.x, y: s.y }],
                event: false
            };
        });

        function runCollisionPass() {
            // Resolve ALL overlapping pairs in one pass so simultaneous
            // contacts (e.g. apex ball hitting two row-1 balls) are handled
            // in a single timestep. Returns true if any collision occurred.
            var hit = false;
            for (var a = 0; a < balls.length; a++) {
                var b1 = balls[a];
                if (b1.pocketed) continue;
                for (var c = a + 1; c < balls.length; c++) {
                    var b2 = balls[c];
                    if (b2.pocketed) continue;

                    var d = dist(b1.x, b1.y, b2.x, b2.y);
                    if (d > BALL_RADIUS * 2 + 1e-6) continue;

                    var collision = ballCollision(
                        b1.vx, b1.vy,
                        b2.vx, b2.vy,
                        b1.x, b1.y,
                        b2.x, b2.y,
                        (b1.sidespin || 0) - (b2.sidespin || 0)
                    );
                    if (!collision) continue;

                    b1.vx = collision.cbVx;
                    b1.vy = collision.cbVy;
                    b2.vx = collision.obVx;
                    b2.vy = collision.obVy;
                    b1.x = collision.cbX;
                    b1.y = collision.cbY;
                    b2.x = collision.obX;
                    b2.y = collision.obY;
                    b1.event = true;
                    b2.event = true;
                    collisionCount++;
                    hit = true;
                }
            }
            return hit;
        }

        while (totalTime < MAX_TIME) {
            var anyMoving = false;

            for (var mi = 0; mi < balls.length; mi++) {
                var bm = balls[mi];
                bm.event = false;
                if (!bm.pocketed && len(bm.vx, bm.vy) > 0.3) anyMoving = true;
            }

            if (!anyMoving) break;

            // Move balls by current velocities.
            for (var i = 0; i < balls.length; i++) {
                var b = balls[i];
                if (b.pocketed) continue;

                var speed = len(b.vx, b.vy);
                if (speed <= 1e-9) continue;

                var nx = b.vx / speed;
                var ny = b.vy / speed;
                var stepDist = speed * DT;

                b.x += b.vx * DT;
                b.y += b.vy * DT;
                b.distance += stepDist;

                // Mild sideways curve from remaining sidespin.
                if (Math.abs(b.sidespin) > 0.01) {
                    var curve = b.sidespin * 0.0002 * DT;
                    b.x += (-ny) * curve;
                    b.y += nx * curve;
                    b.sidespin *= (1 - SPIN_DECAY * stepDist);
                }
            }

            // Ball-ball collisions — loop until no overlaps remain
            // so energy propagates through packed clusters in one timestep.
            for (var _cp = 0; _cp < 5; _cp++) {
                if (!runCollisionPass()) break;
            }

            // Pocket / cushion / cloth friction.
            for (var j = 0; j < balls.length; j++) {
                var bj = balls[j];
                if (bj.pocketed) continue;

                if (!ignorePockets) {
                    for (var pi = 0; pi < pockets.length; pi++) {
                        if (dist(bj.x, bj.y, pockets[pi].x, pockets[pi].y) < POCKET_CATCH) {
                            bj.pocketed = pockets[pi].name;
                            bj.vx = 0;
                            bj.vy = 0;
                            bj.event = true;
                            break;
                        }
                    }
                    if (bj.pocketed) {
                        bj.path.push({ x: bj.x, y: bj.y });
                        continue;
                    }
                }

                // Cushion bounces — suppress near pockets.
                var _npZone = !ignorePockets && nearPocket(bj.x, bj.y, pockets);
                if (!_npZone) {
                    if (bj.x - BALL_RADIUS < RAIL_LEFT) {
                        bj.x = RAIL_LEFT + BALL_RADIUS;
                        bj.vx = Math.abs(bj.vx) * E_RAIL;
                        bj.sidespin *= -0.6;
                        bj.event = true;
                    } else if (bj.x + BALL_RADIUS > RAIL_RIGHT) {
                        bj.x = RAIL_RIGHT - BALL_RADIUS;
                        bj.vx = -Math.abs(bj.vx) * E_RAIL;
                        bj.sidespin *= -0.6;
                        bj.event = true;
                    }

                    if (bj.y - BALL_RADIUS < RAIL_TOP) {
                        bj.y = RAIL_TOP + BALL_RADIUS;
                        bj.vy = Math.abs(bj.vy) * E_RAIL;
                        bj.sidespin *= -0.6;
                        bj.event = true;
                    } else if (bj.y + BALL_RADIUS > RAIL_BOTTOM) {
                        bj.y = RAIL_BOTTOM - BALL_RADIUS;
                        bj.vy = -Math.abs(bj.vy) * E_RAIL;
                        bj.sidespin *= -0.6;
                        bj.event = true;
                    }
                }

                var sp = len(bj.vx, bj.vy);
                if (sp > 1e-9) {
                    var oldVx = bj.vx;
                    var oldVy = bj.vy;
                    var ax = -DECEL * (bj.vx / sp);
                    var ay = -DECEL * (bj.vy / sp);

                    bj.vx += ax * DT;
                    bj.vy += ay * DT;

                    if (oldVx !== 0 && Math.sign(oldVx) !== Math.sign(bj.vx)) bj.vx = 0;
                    if (oldVy !== 0 && Math.sign(oldVy) !== Math.sign(bj.vy)) bj.vy = 0;
                }

                if (bj.distance >= MAX_DISTANCE) {
                    bj.vx = 0;
                    bj.vy = 0;
                    bj.event = true;
                }
            }

            stepCount++;
            totalTime += DT;

            for (var k = 0; k < balls.length; k++) {
                var bk = balls[k];
                if (stepCount % sampleInterval === 0 || bk.event) {
                    bk.path.push({ x: bk.x, y: bk.y });
                }
            }
        }

        var paths = {};
        var pocketed = {};

        for (var bi = 0; bi < balls.length; bi++) {
            var bb = balls[bi];
            var key = String(bb.id);
            if (bb.path.length === 0 || bb.path[bb.path.length - 1].x !== bb.x || bb.path[bb.path.length - 1].y !== bb.y) {
                bb.path.push({ x: bb.x, y: bb.y });
            }
            paths[key] = bb.path;
            if (bb.pocketed) pocketed[key] = bb.pocketed;
        }

        return {
            balls: balls,
            paths: paths,
            pocketed: pocketed,
            collisionCount: collisionCount
        };
    }

    // ── 6. Full shot simulation ──
    // Given cue ball pos, aim angle, tip offset, power → simulate everything.

    function simulateShot(cueX, cueY, obX, obY, aimAngle, tipX, tipY, power) {
        var launch = cueBallLaunch(tipX, tipY, power, aimAngle);

        function findNearestBallIdByPos(tx, ty) {
            if (!PT || !PT.balls) return null;
            var bestId = null;
            var bestDist = Infinity;
            Object.keys(PT.balls).forEach(function (k) {
                var b = PT.balls[+k];
                if (!b || b.num === 0) return;
                var d = dist(b.tableX, b.tableY, tx, ty);
                if (d < bestDist) {
                    bestDist = d;
                    bestId = b.num;
                }
            });
            return (bestDist <= BALL_RADIUS * 1.2) ? bestId : null;
        }

        // Dense rack / break path: use full-table dynamics from cue launch.
        // This avoids single-impact approximations that can look wrong in clusters.
        if (PT && PT.balls) {
            var liveNums = Object.keys(PT.balls);
            var liveCount = liveNums.length;
            var useFullTable = (liveCount >= 7) && (power >= 0.6);
            if (useFullTable) {
                var targetId = findNearestBallIdByPos(obX, obY);
                var statesFromStart = [];
                liveNums.forEach(function (k) {
                    var b = PT.balls[+k];
                    if (!b) return;
                    if (b.num === 0) {
                        statesFromStart.push({
                            id: 0,
                            x: cueX,
                            y: cueY,
                            vx: launch.vx,
                            vy: launch.vy,
                            sidespin: launch.sidespin
                        });
                    } else {
                        statesFromStart.push({
                            id: b.num,
                            x: b.tableX,
                            y: b.tableY,
                            vx: 0,
                            vy: 0,
                            sidespin: 0
                        });
                    }
                });

                var full = simulateBalls(statesFromStart);

                function findBallById(id) {
                    for (var i = 0; i < full.balls.length; i++) {
                        if (full.balls[i].id === id) return full.balls[i];
                    }
                    return null;
                }

                function toResult(ball) {
                    if (!ball) return null;
                    return {
                        path: ball.path,
                        finalX: ball.x,
                        finalY: ball.y,
                        pocketed: ball.pocketed,
                        distance: ball.distance
                    };
                }

                var cbFull = toResult(findBallById(0));
                var obFull = toResult(findBallById(targetId));

                // Keep metadata approximate for rack/break mode.
                var launchDir = normalize(launch.vx, launch.vy);
                var targetDir = normalize(obX - cueX, obY - cueY);
                var cutDot = dot(launchDir.x, launchDir.y, targetDir.x, targetDir.y);
                var cutDegApprox = Math.acos(Math.max(-1, Math.min(1, cutDot))) * 180 / Math.PI;

                return {
                    hit: !!obFull,
                    ghostX: cueX,
                    ghostY: cueY,
                    cutAngleDeg: cutDegApprox,
                    throwAngleDeg: 0,
                    squirtDeg: launch.squirtDeg,
                    ob: obFull,
                    cb: cbFull,
                    balls: full
                };
            }
        }

        // Find where cue ball contacts OB (ray-circle intersection)
        var contactDist = BALL_RADIUS * 2;
        var dx = obX - cueX;
        var dy = obY - cueY;
        // Actually use the launch velocity direction (includes squirt)
        var launchDir = normalize(launch.vx, launch.vy);
        var proj = dot(dx, dy, launchDir.x, launchDir.y);
        if (proj <= 0) return { hit: false };

        var perpX = dx - proj * launchDir.x;
        var perpY = dy - proj * launchDir.y;
        var perp = len(perpX, perpY);
        if (perp > contactDist) return { hit: false };

        var offset = Math.sqrt(contactDist * contactDist - perp * perp);
        var hitDist = proj - offset;
        if (hitDist < 0) return { hit: false };

        // Ghost ball position at contact
        var ghostX = cueX + launchDir.x * hitDist;
        var ghostY = cueY + launchDir.y * hitDist;

        // Velocity at contact (reduced by deceleration over travel distance)
        // v² = v₀² - 2*a*d  →  v = v₀ * sqrt(1 - 2*a*d/v₀²)
        var v0sq = launch.speed * launch.speed;
        var frictionFactor = Math.sqrt(Math.max(0.01, 1 - 2 * DECEL * hitDist / v0sq));
        var contactVx = launch.vx * frictionFactor;
        var contactVy = launch.vy * frictionFactor;

        // Spin at contact (spin decays over distance)
        var spinDecay = Math.max(0, 1 - hitDist * SPIN_DECAY * 0.3);
        var contactTopspin = launch.topspin * spinDecay;
        var contactSidespin = launch.sidespin * spinDecay;

        // Ball-ball collision
        var collision = ballCollision(
            contactVx, contactVy,
            0, 0,
            ghostX, ghostY,
            obX, obY,
            contactSidespin
        );
        if (!collision) return { hit: false };

        // CB post-collision with spin applied
        var lineNx = (obX - ghostX);
        var lineNy = (obY - ghostY);
        var lineLen = len(lineNx, lineNy);
        if (lineLen > 1e-6) { lineNx /= lineLen; lineNy /= lineLen; }

        var cbPost = applyCBSpin(
            collision.cbVx, collision.cbVy,
            contactTopspin, contactSidespin,
            lineNx, lineNy
        );

        var cbStartX = (typeof collision.cbX === 'number') ? collision.cbX : ghostX;
        var cbStartY = (typeof collision.cbY === 'number') ? collision.cbY : ghostY;

        var obStartX = (typeof collision.obX === 'number') ? collision.obX : obX;
        var obStartY = (typeof collision.obY === 'number') ? collision.obY : obY;

        // Build simulation states: cue, impacted OB, and any other live table balls.
        var states = [
            { id: 0, x: cbStartX, y: cbStartY, vx: cbPost.vx, vy: cbPost.vy, sidespin: contactSidespin * 0.5 },
            { id: 'target', x: obStartX, y: obStartY, vx: collision.obVx, vy: collision.obVy, sidespin: 0 }
        ];

        if (PT && PT.balls) {
            Object.keys(PT.balls).forEach(function (k) {
                var num = +k;
                if (num === 0) return;
                var b = PT.balls[num];
                if (!b) return;

                // Skip the target already seeded above.
                if (dist(b.tableX, b.tableY, obX, obY) < 0.05) return;

                states.push({ id: num, x: b.tableX, y: b.tableY, vx: 0, vy: 0, sidespin: 0 });
            });
        }

        var multi = simulateBalls(states);

        function findBall(id) {
            for (var ii = 0; ii < multi.balls.length; ii++) {
                if (multi.balls[ii].id === id) return multi.balls[ii];
            }
            return null;
        }

        function toLegacyResult(ball) {
            if (!ball) return null;
            return {
                path: ball.path,
                finalX: ball.x,
                finalY: ball.y,
                pocketed: ball.pocketed,
                distance: ball.distance
            };
        }

        var cbResult = toLegacyResult(findBall(0));
        var obResult = toLegacyResult(findBall('target'));

        return {
            hit: true,
            ghostX: ghostX,
            ghostY: ghostY,
            cutAngleDeg: collision.cutAngleDeg,
            throwAngleDeg: collision.throwAngleDeg,
            squirtDeg: launch.squirtDeg,
            ob: obResult,
            cb: cbResult,
            balls: multi
        };
    }

    // ── 7. Auto-solver ──
    // Given cue ball, object ball, and target pocket,
    // find the aim angle + tip offset + power that pockets the OB.
    //
    // Strategy: geometric aim first, then iterate to compensate for throw & squirt.

    function solveShotForPocket(cueX, cueY, obX, obY, pocket) {
        var pockets = getPockets();
        var target = null;
        if (typeof pocket === 'string') {
            for (var i = 0; i < pockets.length; i++) {
                if (pockets[i].name === pocket) { target = pockets[i]; break; }
            }
        } else if (pocket && pocket.x !== undefined) {
            target = pocket;
        }
        if (!target) {
            // Auto-pick best pocket
            target = findBestPocketForSolve(obX, obY, cueX, cueY);
        }
        if (!target) return null;

        // 1. Ideal OB direction → pocket
        var obToPocketX = target.x - obX;
        var obToPocketY = target.y - obY;
        var obToPocketLen = len(obToPocketX, obToPocketY);
        if (obToPocketLen < 0.5) return null;
        var obDirX = obToPocketX / obToPocketLen;
        var obDirY = obToPocketY / obToPocketLen;

        // 2. Ghost ball position (where CB must be at contact)
        var ghostX = obX - obDirX * BALL_RADIUS * 2;
        var ghostY = obY - obDirY * BALL_RADIUS * 2;

        // 3. Base aim angle (CB center → ghost ball)
        var baseAimX = ghostX - cueX;
        var baseAimY = ghostY - cueY;
        var baseAimAngle = Math.atan2(baseAimY, baseAimX);

        // 4. Cut angle
        var cueToOb = normalize(obX - cueX, obY - cueY);
        var cutAngle = Math.acos(Math.max(-1, Math.min(1,
            dot(cueToOb.x, cueToOb.y, obDirX, obDirY)
        )));
        var cutDeg = cutAngle * 180 / Math.PI;

        // 5. Determine power based on distance
        var shotDist = dist(cueX, cueY, obX, obY) + obToPocketLen;
        var power = Math.min(1, Math.max(0.1, shotDist / 120));

        // 6. Determine tip: default center ball (stun)
        // For position play we'd compute desired CB destination, but for now
        // just center for clean potting.
        var tipX = 0;
        var tipY = 0;

        // 7. Iterative refinement — compensate for throw and squirt
        var bestAngle = baseAimAngle;
        var bestTipX = tipX;
        var bestPower = power;
        var bestDist = Infinity;

        // Iterative refinement: adjust aim angle to compensate for throw & squirt
        var prevAngle = bestAngle;
        for (var iter = 0; iter < 16; iter++) {
            var result = simulateShot(cueX, cueY, obX, obY, bestAngle, bestTipX, tipY, bestPower);

            if (!result.hit || !result.ob) break;

            // How close did the OB path get to the pocket?
            var obPath = result.ob.path;
            var minDist = Infinity;
            for (var pi = 0; pi < obPath.length; pi++) {
                var d = dist(obPath[pi].x, obPath[pi].y, target.x, target.y);
                if (d < minDist) minDist = d;
            }

            if (result.ob.pocketed === target.name) {
                bestDist = 0;
                break;
            }

            // Stability guard: only keep improvements
            if (minDist < bestDist) {
                bestDist = minDist;
                prevAngle = bestAngle;
            } else {
                // Correction made things worse — revert and halve the step
                bestAngle = prevAngle;
            }

            // Adjust aim based on where OB ended up vs target
            var obFinalX = result.ob.finalX;
            var obFinalY = result.ob.finalY;
            var errorX = target.x - obFinalX;
            var errorY = target.y - obFinalY;

            // Convert positional error to angular correction.
            // Perpendicular of aim direction (cos θ, sin θ) is (-sin θ, cos θ).
            // Project error onto that perpendicular to get angular offset.
            var aimDist = dist(cueX, cueY, ghostX, ghostY);
            if (aimDist < 1) break;
            var perpError = -errorX * Math.sin(bestAngle) + errorY * Math.cos(bestAngle);
            var correction = Math.atan2(perpError, aimDist) * 0.4;

            bestAngle += correction;

            if (Math.abs(correction) < 0.0003) break; // converged
        }

        // 8. Verify final result
        var finalResult = simulateShot(cueX, cueY, obX, obY, bestAngle, bestTipX, tipY, bestPower);
        var pocketed = finalResult.hit && finalResult.ob && finalResult.ob.pocketed === target.name;

        return {
            aimAngle: bestAngle,
            tipX: bestTipX,
            tipY: tipY,
            power: bestPower,
            pocket: target,
            pocketed: pocketed,
            cutAngleDeg: cutDeg,
            simulation: finalResult
        };
    }

    // Find the pocket with the most favorable angle from the OB
    function findBestPocketForSolve(obX, obY, cueX, cueY) {
        var pockets = getPockets();
        var best = null;
        var bestScore = -Infinity;

        // Direction from cue to OB
        var cueToOb = normalize(obX - cueX, obY - cueY);

        pockets.forEach(function (p) {
            var obToPocket = normalize(p.x - obX, p.y - obY);
            var pocketDist = dist(obX, obY, p.x, p.y);

            // Cut angle (angle between cue→OB and OB→pocket)
            var cutDot = dot(cueToOb.x, cueToOb.y, obToPocket.x, obToPocket.y);
            var cutAngle = Math.acos(Math.max(-1, Math.min(1, cutDot)));

            // Score: prefer smaller cut angles and shorter distances
            // Reject impossible cuts (> 70°)
            if (cutAngle > 70 * Math.PI / 180) return;

            var score = (1 - cutAngle / (Math.PI / 2)) * 100 - pocketDist * 0.5;

            if (score > bestScore) {
                bestScore = score;
                best = p;
            }
        });

        return best;
    }

    // ── Public API ──
    // ── Live constant setters (for calibration) ──
    function setDecel(v)       { DECEL = v; phys.constants.DECEL = v; }
    function setERail(v)       { E_RAIL = v; phys.constants.E_RAIL = v; }
    function setEBall(v)       { E_BALL = v; phys.constants.E_BALL = v; }
    function setPocketCatch(v) { POCKET_CATCH = v; phys.constants.POCKET_CATCH = v; }

    var phys = {
        // Core simulation
        cueBallLaunch: cueBallLaunch,
        ballCollision: ballCollision,
        simulateRoll: simulateRoll,
        simulateBalls: simulateBalls,
        simulateShot: simulateShot,

        // Solver
        solveShotForPocket: solveShotForPocket,
        findBestPocketForSolve: findBestPocketForSolve,

        // Utilities
        getPockets: getPockets,

        // Live setters
        setDecel: setDecel,
        setERail: setERail,
        setEBall: setEBall,
        setPocketCatch: setPocketCatch,

        // Constants (readable for tuning)
        constants: {
            DECEL: DECEL,
            MU_SLIDE: MU_SLIDE,
            MU_BALL: MU_BALL,
            E_BALL: E_BALL,
            E_RAIL: E_RAIL,
            SQUIRT_K: SQUIRT_K,
            POCKET_CATCH: POCKET_CATCH
        }
    };

    PT.physics = phys;

})();

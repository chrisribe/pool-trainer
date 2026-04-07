/* ================================================================
    Pool Trainer — physics-tests.js
    Test harness for pool-physics.js tuning.
    Run in browser console:
    - PT.runPhysicsTests()
    - PT.runCueBallPhysicsTests()
    ================================================================ */

(function () {
    'use strict';

    var cfg = PT.cfg;
    var physics = PT.physics;
    var tableW = cfg.playWidth;   // 50" for 9-foot
    var tableH = cfg.playHeight;  // 100"
    var rail = cfg.railWidth;     // 5"
    var r = cfg.ballRadius;       // 1.125"

    // Center of table
    var cx = rail + tableW / 2;   // 30"
    var cy = rail + tableH / 2;   // 55"

    // ── Expected real-world benchmarks ──
    // Source: Dr. Dave billiards physics (drdavebilliards.com)
    //
    // Soft shot (~3 mph):  rolls ~30-40" then stops
    // Medium shot (~5 mph): rolls ~80-120"
    // Hard shot (~8 mph):  rolls ~200-300", bounces 2-3 times
    // Full power (~12 mph): rolls 400+", bounces 4-6+ times
    //
    // Rolling friction: ball decelerates ~7 in/s² on fast cloth, ~15 in/s² on slow cloth

    function countBounces(path) {
        var bounces = 0;
        var minX = rail + r;
        var maxX = rail + tableW - r;
        var minY = rail + r;
        var maxY = rail + tableH - r;
        for (var i = 1; i < path.length; i++) {
            var p = path[i];
            // Near rail edge = bounce
            if (p.x <= minX + 0.5 || p.x >= maxX - 0.5 ||
                p.y <= minY + 0.5 || p.y >= maxY - 0.5) {
                // Only count if previous point wasn't also at rail (avoid double-count)
                var prev = path[i - 1];
                var prevAtRail = (prev.x <= minX + 0.5 || prev.x >= maxX - 0.5 ||
                                  prev.y <= minY + 0.5 || prev.y >= maxY - 0.5);
                if (!prevAtRail) bounces++;
            }
        }
        return bounces;
    }

    var visualRunner = null;

    function drawVisualStatus(text) {
        if (!PT.uiLayer) return;
        PT.uiLayer.removeChildren();
        PT.uiLayer.activate();
        var title = new paper.PointText({
            point: new paper.Point(paper.view.size.width / 2, 36),
            content: text,
            fillColor: 'rgba(0,255,180,0.9)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: 22,
            justification: 'center'
        });
        title.data = { testOverlay: true };
    }

    function moveCueTo(tx, ty) {
        var cue = PT.balls[0];
        if (!cue) {
            PT.placeBall(0, tx, ty);
            cue = PT.balls[0];
        }
        cue.tableX = tx;
        cue.tableY = ty;
        if (cue.group) cue.group.position = PT.T(tx, ty);
        else PT.placeBall(0, tx, ty);
    }

    function moveBallTo(num, tx, ty) {
        var b = PT.balls[num];
        if (!b) {
            PT.placeBall(num, tx, ty);
            b = PT.balls[num];
        }
        b.tableX = tx;
        b.tableY = ty;
        if (b.group) b.group.position = PT.T(tx, ty);
        else PT.placeBall(num, tx, ty);
    }

    function sleep(ms) {
        return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function stopPhysicsVisualTests() {
        if (!visualRunner) return;
        visualRunner.cancelled = true;
        visualRunner = null;
        if (PT.uiLayer) PT.uiLayer.removeChildren();
    }

    async function runPhysicsTestsVisualAsync() {
        stopPhysicsVisualTests();
        visualRunner = { cancelled: false };
        var runner = visualRunner;

        PT.clearShotLines();
        PT.clearBalls();
        PT.selectedBall = null;
        PT.aimState = null;

        var cases = [
            { name: 'POWER 0% (NO MOTION)', power: 0.00, angle: 0.35, startX: cx, startY: cy, ignorePockets: true },
            { name: 'POWER 10% (SOFT ROLL)', power: 0.10, angle: 0.35, startX: cx, startY: cy, ignorePockets: true },
            { name: 'POWER 40% (MEDIUM)', power: 0.40, angle: 0.35, startX: cx, startY: cy, ignorePockets: true },
            { name: 'POWER 100% (BOUNCE TEST)', power: 1.00, angle: Math.PI / 2, startX: cx, startY: rail + 10, ignorePockets: true },
            { name: 'POCKET CHECK (CORNER)', power: 0.30, angle: Math.atan2(rail - (rail + 10), rail - (rail + 10)), startX: rail + 10, startY: rail + 10, ignorePockets: false }
        ];

        for (var i = 0; i < cases.length; i++) {
            if (!visualRunner || runner.cancelled) return;
            var tc = cases[i];

            drawVisualStatus('TEST ' + (i + 1) + '/' + cases.length + ': ' + tc.name);
            moveCueTo(tc.startX, tc.startY);

            var launch = physics.cueBallLaunch(0, 0, tc.power, tc.angle);
            var roll = physics.simulateRoll(tc.startX, tc.startY, launch.vx, launch.vy, launch.sidespin, {
                ignorePockets: tc.ignorePockets
            });

            for (var p = 0; p < roll.path.length; p++) {
                if (!visualRunner || runner.cancelled) return;
                moveCueTo(roll.path[p].x, roll.path[p].y);
                await sleep(20); // sync to physics sample cadence (0.02s)
            }

            await sleep(650);
        }

        if (!visualRunner || runner.cancelled) return { ok: false, cancelled: true };
        drawVisualStatus('VISUAL TESTS COMPLETE');
        moveCueTo(cx, cy);
        return { ok: true, cancelled: false };
    }

    function runPhysicsTestsVisual() {
        // Fire-and-forget wrapper so callers don't get unhandled promise noise.
        runPhysicsTestsVisualAsync().catch(function (err) {
            console.error('Visual physics tests failed:', err);
            stopPhysicsVisualTests();
            return { ok: false, error: String(err) };
        });
        return { started: true };
    }

    function runTests(options) {
        options = options || {};
        var results = [];
        var allPass = true;

        function test(name, actual, min, max, unit) {
            var pass = actual >= min && actual <= max;
            if (!pass) allPass = false;
            var status = pass ? 'PASS' : 'FAIL';
            var msg = status + ' | ' + name + ': ' + actual.toFixed(1) + unit +
                      ' (expected ' + min + '-' + max + unit + ')';
            results.push({ name: name, actual: actual, min: min, max: max, pass: pass, msg: msg });
            console.log('%c' + msg, pass ? 'color:green' : 'color:red;font-weight:bold');
        }

        console.log('');
        console.log('%c═══ POOL PHYSICS TEST SUITE ═══', 'font-weight:bold;font-size:14px');
        console.log('Table: ' + tableW + '" x ' + tableH + '" (9-foot)');
        console.log('');

        // ── TEST 1: Soft shot roll distance ──
        // Power 0.1, center ball, straight along table
        console.log('%c── Roll Distance Tests ──', 'font-weight:bold');
        var launch1 = physics.cueBallLaunch(0, 0, 0.1, 0);
        var roll1 = physics.simulateRoll(cx, cy, launch1.vx, launch1.vy, 0, { ignorePockets: true });
        test('Soft shot (10%) distance', roll1.distance, 20, 60, '"');

        // Power 0.3 — medium-soft
        var launch2 = physics.cueBallLaunch(0, 0, 0.3, 0);
        var roll2 = physics.simulateRoll(cx, cy, launch2.vx, launch2.vy, 0, { ignorePockets: true });
        test('Medium-soft shot (30%) distance', roll2.distance, 50, 140, '"');

        // Power 0.5 — medium
        var launch3 = physics.cueBallLaunch(0, 0, 0.5, 0);
        var roll3 = physics.simulateRoll(cx, cy, launch3.vx, launch3.vy, 0, { ignorePockets: true });
        test('Medium shot (50%) distance', roll3.distance, 80, 200, '"');

        // Power 1.0 — full power
        var launch4 = physics.cueBallLaunch(0, 0, 1.0, 0);
        var roll4 = physics.simulateRoll(cx, cy, launch4.vx, launch4.vy, 0, { ignorePockets: true });
        test('Full power shot (100%) distance', roll4.distance, 180, 600, '"');

        console.log('');
        console.log('%c── Cushion Bounce Tests ──', 'font-weight:bold');

        // ── TEST 2: Bounce counts ──
        // Full power shot along the table from one end
        var startY = rail + 10; // near the top
        var launch5 = physics.cueBallLaunch(0, 0, 1.0, Math.PI / 2); // straight down
        var roll5 = physics.simulateRoll(cx, startY, launch5.vx, launch5.vy, 0, { ignorePockets: true });
        var bounces5 = countBounces(roll5.path);
        test('Full power straight bounce count', bounces5, 3, 8, 'x');

        // Medium power diagonal
        var angle6 = Math.PI / 4; // 45 degrees
        var launch6 = physics.cueBallLaunch(0, 0, 0.5, angle6);
        var roll6 = physics.simulateRoll(cx, cy, launch6.vx, launch6.vy, 0, { ignorePockets: true });
        var bounces6 = countBounces(roll6.path);
        test('Medium 45° diagonal bounce count', bounces6, 1, 4, 'x');

        // From center on a cross-table line, even a soft shot can clip one rail.
        test('Soft shot from center bounces', countBounces(roll1.path), 0, 1, 'x');

        console.log('');
        console.log('%c── Speed / Launch Tests ──', 'font-weight:bold');

        // ── TEST 3: Launch speed range ──
        test('Soft launch speed', launch1.speed, 20, 35, ' in/s');
        test('Medium launch speed', launch3.speed, 55, 70, ' in/s');
        test('Full launch speed', launch4.speed, 90, 110, ' in/s');

        console.log('');
        console.log('%c── 45° Cut Shot Distance ──', 'font-weight:bold');

        // ── TEST 4: After ball-ball collision, OB should travel reasonable distance ──
        // True cut setup: OB is straight ahead; cue line is offset to create a ~45° cut.
        var obX = cx + 20;
        var obY = cy;
        var desiredCutDeg = 45;
        var contactDist = cfg.ballRadius * 2;
        var perpOffset = contactDist * Math.sin(desiredCutDeg * Math.PI / 180);
        // For OB at +20" on x-axis, this small aim angle creates the needed line offset.
        var aimAngle = Math.asin(perpOffset / (obX - cx));
        var simResult = physics.simulateShot(cx, cy, obX, obY, aimAngle, 0, 0, 0.2);
        if (simResult.hit) {
            test('45° cut OB roll distance (20%)', simResult.ob.distance, 5, 40, '"');
            test('45° cut CB deflection distance', simResult.cb.distance, 3, 30, '"');
            test('45° cut angle', simResult.cutAngleDeg, 35, 55, '°');
        } else {
            console.log('%cFAIL | 45° cut shot did not hit', 'color:red;font-weight:bold');
            allPass = false;
        }

        // ── TEST 5: Straight shot at medium power ──
        console.log('');
        console.log('%c── Straight Shot Tests ──', 'font-weight:bold');
        var obStraight = { x: cx, y: cy - 20 };
        var straightAngle = Math.atan2(-20, 0);
        var straightSim = physics.simulateShot(cx, cy, obStraight.x, obStraight.y, straightAngle, 0, 0, 0.4);
        if (straightSim.hit) {
            test('Straight shot OB distance (40%)', straightSim.ob.distance, 30, 120, '"');
            test('Straight shot CB stop distance', straightSim.cb.distance, 0, 15, '"');
        } else {
            console.log('%cFAIL | Straight shot did not hit', 'color:red;font-weight:bold');
            allPass = false;
        }

        // ── TEST 6: Ball should not pass through rail ──
        console.log('');
        console.log('%c── Boundary Tests ──', 'font-weight:bold');
        var minBound = rail + r;
        var maxBoundX = rail + tableW - r;
        var maxBoundY = rail + tableH - r;
        var boundViolations = 0;
        // Use full power diagonal from corner
        var launch7 = physics.cueBallLaunch(0, 0, 1.0, 0.7);
        var roll7 = physics.simulateRoll(rail + 10, rail + 10, launch7.vx, launch7.vy, 0, { ignorePockets: true });
        for (var i = 0; i < roll7.path.length; i++) {
            var p = roll7.path[i];
            if (p.x < minBound - 0.5 || p.x > maxBoundX + 0.5 ||
                p.y < minBound - 0.5 || p.y > maxBoundY + 0.5) {
                boundViolations++;
            }
        }
        test('Boundary violations (full power diagonal)', boundViolations, 0, 0, '');

        // ── TEST 7: Pocket detection from nearby ──
        console.log('');
        console.log('%c── Pocket Detection Tests ──', 'font-weight:bold');
        // Roll ball straight at a corner pocket from 10" away
        var pocketTarget = { x: rail, y: rail }; // TL pocket
        var pAngle = Math.atan2(pocketTarget.y - (rail + 10), pocketTarget.x - (rail + 10));
        var pLaunch = physics.cueBallLaunch(0, 0, 0.3, pAngle);
        var pRoll = physics.simulateRoll(rail + 10, rail + 10, pLaunch.vx, pLaunch.vy, 0);
        var wasPocketed = pRoll.pocketed === 'TL';
        test('Corner pocket from 10" away', wasPocketed ? 1 : 0, 1, 1, ' (1=pocketed)');

        // Side pocket
        var sideTarget = { x: rail, y: rail + tableH / 2 }; // ML pocket
        var sAngle = Math.atan2(sideTarget.y - cy, sideTarget.x - cx);
        var sLaunch = physics.cueBallLaunch(0, 0, 0.3, sAngle);
        var sRoll = physics.simulateRoll(cx, cy, sLaunch.vx, sLaunch.vy, 0);
        var sidePocketed = sRoll.pocketed === 'ML';
        test('Side pocket from center', sidePocketed ? 1 : 0, 1, 1, ' (1=pocketed)');

        // ── Summary ──
        console.log('');
        var passCount = results.filter(function (r) { return r.pass; }).length;
        console.log('%c═══ RESULTS: ' + passCount + '/' + results.length + ' passed ═══',
            allPass ? 'color:green;font-weight:bold;font-size:14px' : 'color:red;font-weight:bold;font-size:14px');

        var summary = { pass: allPass, total: results.length, passed: passCount, results: results };

        // By default also run a real-time visual sequence with cue ball only.
        if (options.visual !== false) {
            runPhysicsTestsVisual();
        }

        return summary;
    }

    function runCueBallPhysicsTests() {
        var results = [];
        var allPass = true;

        function test(name, actual, min, max, unit) {
            var pass = actual >= min && actual <= max;
            if (!pass) allPass = false;
            var status = pass ? 'PASS' : 'FAIL';
            var msg = status + ' | ' + name + ': ' + actual.toFixed(2) + unit +
                      ' (expected ' + min + '-' + max + unit + ')';
            results.push({ name: name, actual: actual, min: min, max: max, pass: pass, msg: msg });
            console.log('%c' + msg, pass ? 'color:green' : 'color:red;font-weight:bold');
        }

        console.log('');
        console.log('%c═══ CUE BALL PHYSICS SUITE ═══', 'font-weight:bold;font-size:14px');
        console.log('Focus: power ladder, bounces, cloth friction realism');
        console.log('');

        var angle = 0.35; // diagonal line to exercise rail interactions
        var powers = [0, 0.02, 0.04, 0.06, 0.08, 0.10, 0.20, 0.40, 0.60, 0.80, 1.00];
        var rows = [];

        // Run ladder with pockets ignored to isolate cue/cloth/rail behavior.
        for (var i = 0; i < powers.length; i++) {
            var p = powers[i];
            var launch = physics.cueBallLaunch(0, 0, p, angle);
            var roll = physics.simulateRoll(cx, cy, launch.vx, launch.vy, launch.sidespin, { ignorePockets: true });
            var bounces = countBounces(roll.path);
            rows.push({
                power: p,
                speed: launch.speed,
                distance: roll.distance,
                bounces: bounces
            });
        }

        console.table(rows);

        // 1) Zero power must not move.
        test('Zero power launch speed', rows[0].speed, 0, 0.001, ' in/s');
        test('Zero power roll distance', rows[0].distance, 0, 0.02, '"');

        // 2) Distance should increase monotonically with power.
        var monotonicDist = 1;
        for (var md = 1; md < rows.length; md++) {
            if (rows[md].distance + 0.5 < rows[md - 1].distance) {
                monotonicDist = 0;
                break;
            }
        }
        test('Power ladder distance monotonic', monotonicDist, 1, 1, ' (1=yes)');

        // 3) Hard shot should bounce multiple rails.
        var full = rows[rows.length - 1];
        test('Full power bounce count', full.bounces, 2, 8, 'x');

        // 4) Friction check via low-power no-bounce shots:
        // a_est = v^2 / (2d). Should be near DECEL in model.
        var decelModel = (physics.constants && physics.constants.DECEL) ? physics.constants.DECEL : 8;
        var decelSamples = [];
        for (var j = 1; j < rows.length; j++) {
            var row = rows[j];
            if (row.bounces === 0 && row.speed > 0.1 && row.distance > 0.1) {
                decelSamples.push((row.speed * row.speed) / (2 * row.distance));
            }
        }

        if (decelSamples.length) {
            var sum = 0;
            for (var k = 0; k < decelSamples.length; k++) sum += decelSamples[k];
            var decelEstimated = sum / decelSamples.length;
            var minDecel = decelModel * 0.60;
            var maxDecel = decelModel * 1.40;
            test('Estimated cloth decel', decelEstimated, minDecel, maxDecel, ' in/s²');
        } else {
            console.log('%cWARN | No no-bounce samples for decel estimate', 'color:orange');
        }

        // 5) Mid-power sanity check for practical gameplay feel.
        var mid = rows[7]; // power 0.40
        test('Mid power distance (40%)', mid.distance, 60, 170, '"');

        console.log('');
        var passCount = results.filter(function (r) { return r.pass; }).length;
        console.log('%c═══ CUE BALL RESULTS: ' + passCount + '/' + results.length + ' passed ═══',
            allPass ? 'color:green;font-weight:bold;font-size:14px' : 'color:red;font-weight:bold;font-size:14px');

        return {
            pass: allPass,
            total: results.length,
            passed: passCount,
            ladder: rows,
            results: results
        };
    }

    async function runCollisionTransferTestsVisualAsync() {
        stopPhysicsVisualTests();
        visualRunner = { cancelled: false };
        var runner = visualRunner;

        PT.clearShotLines();
        PT.clearBalls();
        PT.selectedBall = null;
        PT.aimState = null;

        var scenarios = [
            { name: 'HEAD-ON @ 40%', power: 0.40, cutDeg: 0 },
            { name: '30° CUT @ 40%', power: 0.40, cutDeg: 30 },
            { name: 'HEAD-ON @ 10%', power: 0.10, cutDeg: 0 },
            { name: 'HEAD-ON @ 100%', power: 1.00, cutDeg: 0 }
        ];

        var cueStartX = cx - 12;
        var cueStartY = cy;
        var obX = cx + 8;
        var obY = cy;

        for (var i = 0; i < scenarios.length; i++) {
            if (!visualRunner || runner.cancelled) return { ok: false, cancelled: true };
            var sc = scenarios[i];

            PT.clearBalls();
            moveCueTo(cueStartX, cueStartY);
            moveBallTo(1, obX, obY);

            var aimAngle = 0;
            if (sc.cutDeg !== 0) {
                // Build aim that creates the requested cut angle at contact.
                var cutRad = sc.cutDeg * Math.PI / 180;
                var contactDist = cfg.ballRadius * 2;
                var perpOffset = contactDist * Math.sin(cutRad);
                aimAngle = Math.asin(perpOffset / (obX - cueStartX));
            }

            drawVisualStatus('COLLISION TEST ' + (i + 1) + '/' + scenarios.length + ': ' + sc.name);

            var sim = physics.simulateShot(cueStartX, cueStartY, obX, obY, aimAngle, 0, 0, sc.power);
            if (!sim) {
                await sleep(700);
                continue;
            }

            var cbPath = [];
            var contactIdx = -1;
            if (sim.hit) {
                var preSteps = 20;
                for (var s = 0; s <= preSteps; s++) {
                    var t = s / preSteps;
                    cbPath.push({
                        x: cueStartX + (sim.ghostX - cueStartX) * t,
                        y: cueStartY + (sim.ghostY - cueStartY) * t
                    });
                }
                contactIdx = cbPath.length - 1;
                if (sim.cb && sim.cb.path) {
                    for (var ci = 0; ci < sim.cb.path.length; ci++) cbPath.push(sim.cb.path[ci]);
                }
            } else if (sim.cb && sim.cb.path) {
                for (var cj = 0; cj < sim.cb.path.length; cj++) cbPath.push(sim.cb.path[cj]);
            }

            var obPath = [];
            if (sim.hit) {
                for (var p = 0; p <= contactIdx; p++) obPath.push({ x: obX, y: obY });
                if (sim.ob && sim.ob.path) {
                    for (var oi = 0; oi < sim.ob.path.length; oi++) obPath.push(sim.ob.path[oi]);
                }
            }

            var maxLen = Math.max(cbPath.length, obPath.length || 1);
            var cbLast = cbPath.length ? cbPath[cbPath.length - 1] : { x: cueStartX, y: cueStartY };
            var obLast = obPath.length ? obPath[obPath.length - 1] : { x: obX, y: obY };
            while (cbPath.length < maxLen) cbPath.push(cbLast);
            while (obPath.length < maxLen) obPath.push(obLast);

            for (var fi = 0; fi < maxLen; fi++) {
                if (!visualRunner || runner.cancelled) return { ok: false, cancelled: true };
                moveCueTo(cbPath[fi].x, cbPath[fi].y);
                if (sim.hit && fi >= contactIdx && obPath[fi]) {
                    moveBallTo(1, obPath[fi].x, obPath[fi].y);
                }
                await sleep(20);
            }

            await sleep(650);
        }

        if (!visualRunner || runner.cancelled) return { ok: false, cancelled: true };
        drawVisualStatus('COLLISION VISUALS COMPLETE');
        return { ok: true, cancelled: false };
    }

    function runCollisionTransferTestsVisual() {
        runCollisionTransferTestsVisualAsync().catch(function (err) {
            console.error('Collision visual tests failed:', err);
            stopPhysicsVisualTests();
            return { ok: false, error: String(err) };
        });
        return { started: true };
    }

    function runCollisionTransferTests(options) {
        options = options || {};
        var results = [];
        var allPass = true;

        function test(name, actual, min, max, unit) {
            var pass = actual >= min && actual <= max;
            if (!pass) allPass = false;
            var status = pass ? 'PASS' : 'FAIL';
            var msg = status + ' | ' + name + ': ' + actual.toFixed(2) + unit +
                      ' (expected ' + min + '-' + max + unit + ')';
            results.push({ name: name, actual: actual, min: min, max: max, pass: pass, msg: msg });
            console.log('%c' + msg, pass ? 'color:green' : 'color:red;font-weight:bold');
        }

        function vlen(vx, vy) { return Math.sqrt(vx * vx + vy * vy); }

        console.log('');
        console.log('%c═══ COLLISION TRANSFER SUITE ═══', 'font-weight:bold;font-size:14px');
        console.log('Focus: cue speed -> impacted ball speed, cut transfer behavior');
        console.log('');

        var R = cfg.ballRadius * 2;
        var V = 60;

        // 1) Head-on collision transfer
        var head = physics.ballCollision(V, 0, 0, 0, 0, 0, R, 0, 0);
        if (!head) {
            console.log('%cFAIL | Head-on collision produced null', 'color:red;font-weight:bold');
            allPass = false;
        } else {
            var headObSpeed = vlen(head.obVx, head.obVy);
            var headCbSpeed = vlen(head.cbVx, head.cbVy);
            var expectedHeadOb = V * (physics.constants.E_BALL || 0.96);

            test('Head-on OB speed', headObSpeed, expectedHeadOb * 0.90, expectedHeadOb * 1.05, ' in/s');
            test('Head-on CB residual speed', headCbSpeed, 0, 2.5, ' in/s');
            test('Head-on cut angle', head.cutAngleDeg, 0, 1, '°');
        }

        // 2) 30° cut transfer (collision-only)
        var a30 = 30 * Math.PI / 180;
        var cut = physics.ballCollision(V * Math.cos(a30), V * Math.sin(a30), 0, 0, 0, 0, R, 0, 0);
        if (!cut) {
            console.log('%cFAIL | 30° cut collision produced null', 'color:red;font-weight:bold');
            allPass = false;
        } else {
            var cutObSpeed = vlen(cut.obVx, cut.obVy);
            var cutCbSpeed = vlen(cut.cbVx, cut.cbVy);
            var expectedCutOb = V * Math.cos(a30) * (physics.constants.E_BALL || 0.96);

            test('30° cut OB speed', cutObSpeed, expectedCutOb * 0.85, expectedCutOb * 1.10, ' in/s');
            test('30° cut CB speed', cutCbSpeed, 22, 36, ' in/s');
            test('30° cut reported angle', cut.cutAngleDeg, 27, 33, '°');

            // Energy sanity (allow small tolerance for numeric/model simplification)
            var preE = V * V;
            var postE = cutObSpeed * cutObSpeed + cutCbSpeed * cutCbSpeed;
            var ratio = postE / preE;
            test('30° cut energy ratio', ratio, 0.70, 1.02, '');
        }

        // 2b) Both balls moving: verify relative-normal CoR handling remains stable.
        var moving = physics.ballCollision(45, 6, 12, -4, 0, 0, R, 0, 0);
        if (!moving) {
            console.log('%cFAIL | Moving-ball collision produced null', 'color:red;font-weight:bold');
            allPass = false;
        } else {
            var movingCbSpeed = vlen(moving.cbVx, moving.cbVy);
            var movingObSpeed = vlen(moving.obVx, moving.obVy);
            var movingPreSpeed = vlen(45, 6) + vlen(12, -4);
            var movingPostSpeed = movingCbSpeed + movingObSpeed;

            test('Moving collision CB speed', movingCbSpeed, 8, 55, ' in/s');
            test('Moving collision OB speed', movingObSpeed, 8, 60, ' in/s');
            test('Moving collision speed sanity', movingPostSpeed, movingPreSpeed * 0.70, movingPreSpeed * 1.10, ' in/s');
        }

        // 3) Power ladder transfer using simulateShot (includes pre-impact cloth loss)
        var powers = [0.10, 0.20, 0.40, 0.60, 0.80, 1.00];
        var obSpeeds = [];
        var cueX = cx;
        var cueY = cy;
        var obX = cx + 8;  // short distance reduces friction-before-impact noise
        var obY = cy;
        var aimAngle = 0;

        for (var i = 0; i < powers.length; i++) {
            var sim = physics.simulateShot(cueX, cueY, obX, obY, aimAngle, 0, 0, powers[i]);
            if (!sim || !sim.hit || !sim.ob || !sim.ob.path || sim.ob.path.length < 2) {
                obSpeeds.push(0);
                continue;
            }
            // Path points are sampled at 0.02s cadence in simulateRoll
            var p0 = sim.ob.path[0];
            var p1 = sim.ob.path[1];
            var ds = Math.sqrt((p1.x - p0.x) * (p1.x - p0.x) + (p1.y - p0.y) * (p1.y - p0.y));
            var v0 = ds / 0.02;
            obSpeeds.push(v0);
        }

        var monotonic = 1;
        for (var j = 1; j < obSpeeds.length; j++) {
            if (obSpeeds[j] + 0.4 < obSpeeds[j - 1]) {
                monotonic = 0;
                break;
            }
        }
        console.table(powers.map(function (p, idx) {
            return { power: p, obInitialSpeed: obSpeeds[idx] };
        }));
        test('OB impact speed monotonic vs power', monotonic, 1, 1, ' (1=yes)');
        test('OB speed at 10% power', obSpeeds[0], 18, 40, ' in/s');
        test('OB speed at 100% power', obSpeeds[obSpeeds.length - 1], 65, 120, ' in/s');

        // 4) Multi-ball cascade: CB -> OB1 -> OB2 should transfer down the chain.
        console.log('');
        console.log('%c── Multi-ball Cascade Test ──', 'font-weight:bold');

        var chainStartX = rail + 12;
        var chainY = cy;
        var diameter = cfg.ballRadius * 2;
        var chainStates = [
            { id: 0, x: chainStartX, y: chainY, vx: 85, vy: 0, sidespin: 0 },
            { id: 1, x: chainStartX + diameter + 0.35, y: chainY, vx: 0, vy: 0, sidespin: 0 },
            { id: 2, x: chainStartX + 2 * (diameter + 0.35), y: chainY, vx: 0, vy: 0, sidespin: 0 }
        ];

        var chain = physics.simulateBalls(chainStates, { ignorePockets: true });
        var chainBall2 = null;
        for (var ci = 0; ci < chain.balls.length; ci++) {
            if (chain.balls[ci].id === 2) {
                chainBall2 = chain.balls[ci];
                break;
            }
        }

        test('Cascade collision count', chain.collisionCount, 2, 12, 'x');
        if (chainBall2) {
            test('Cascade OB2 travel distance', chainBall2.distance, 2, 120, ' in');
            test('Cascade OB2 path samples', chainBall2.path.length, 3, 2000, ' pts');
        } else {
            console.log('%cFAIL | Cascade test missing ball id=2', 'color:red;font-weight:bold');
            allPass = false;
        }

        console.log('');
        var passCount = results.filter(function (r) { return r.pass; }).length;
        console.log('%c═══ COLLISION RESULTS: ' + passCount + '/' + results.length + ' passed ═══',
            allPass ? 'color:green;font-weight:bold;font-size:14px' : 'color:red;font-weight:bold;font-size:14px');

        var summary = {
            pass: allPass,
            total: results.length,
            passed: passCount,
            results: results,
            obImpactSpeeds: obSpeeds
        };

        if (options.visual !== false) {
            runCollisionTransferTestsVisual();
        }

        return summary;
    }

    // ── Calibration: sweep DECEL, print distance table ──
    // Run in console: PT.calibrate()
    // Then set with:  PT.physics.setDecel(value)

    function calibrate() {
        var speeds = [20, 30, 40, 50, 60, 80, 100];
        var decels = [4, 5, 6, 7, 8, 10, 12, 15];

        console.log('=== DECEL CALIBRATION (9-foot table, 100" playing surface) ===');
        console.log('Current DECEL = ' + physics.constants.DECEL + ' in/s²');
        console.log('');

        // ── Theory table: d = v² / (2a) ──
        console.log('── Theoretical roll distance (inches) on infinite flat cloth ──');
        var rows = [];
        decels.forEach(function (a) {
            var row = { DECEL: a };
            speeds.forEach(function (v) {
                row[v + ' in/s'] = Math.round((v * v) / (2 * a)) + '"';
            });
            rows.push(row);
        });
        console.table(rows);

        // ── Simulation table: actual simulateRoll (with rails, no pockets) ──
        console.log('── Simulated distance (includes rail bounces, E_RAIL=' + physics.constants.E_RAIL + ') ──');
        var savedDecel = physics.constants.DECEL;
        var simRows = [];
        decels.forEach(function (a) {
            physics.setDecel(a);
            var row = { DECEL: a };
            speeds.forEach(function (v) {
                // Roll straight down the table from center-top
                var startX = cx;
                var startY = rail + r + 1;  // just inside top rail
                var vx = 0;
                var vy = v;  // straight down
                var result = physics.simulateRoll(startX, startY, vx, vy, 0, { ignorePockets: true });
                row[v + ' in/s'] = Math.round(result.distance) + '" (' + countBounces(result.path) + 'b)';
            });
            simRows.push(row);
        });
        console.table(simRows);

        // Restore original
        physics.setDecel(savedDecel);

        // ── Reference ──
        console.log('── Real-world reference ──');
        console.log('  Soft touch:  12-24"   (barely rolls to next diamond)');
        console.log('  Medium:      60-120"  (1 table length)');
        console.log('  Firm:        150-250" (bounces once, rolls back)');
        console.log('  Hard break:  400+"    (3+ bounces)');
        console.log('');
        console.log('── Power → Speed mapping ──');
        console.log('  power 0.1  → 28 in/s    power 0.25 → 40 in/s');
        console.log('  power 0.5  → 60 in/s    power 1.0  → 100 in/s');
        console.log('');
        console.log('To change: PT.physics.setDecel(value)');
        console.log('Then verify: PT.calibrate()  or  PT.runPhysicsTests()');
    }

    PT.runPhysicsTests = runTests;
    PT.runCueBallPhysicsTests = runCueBallPhysicsTests;
    PT.runCollisionTransferTests = runCollisionTransferTests;
    PT.runCollisionTransferTestsVisual = runCollisionTransferTestsVisual;
    PT.runPhysicsTestsVisual = runPhysicsTestsVisual;
    PT.stopPhysicsVisualTests = stopPhysicsVisualTests;
    PT.calibrate = calibrate;
})();

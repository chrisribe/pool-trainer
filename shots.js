/* ================================================================
   Pool Trainer — shots.js
   Aim line, ghost ball, cut angle, pocket targeting
   ================================================================ */

(function () {
    'use strict';

    var cfg = PT.cfg;
    var colors = cfg.colors;
    var T = PT.T;
    var S = PT.S;
    var balls = PT.balls;

    function clearShotLines() {
        PT.shotLayer.removeChildren();
    }

    function hitBall(canvasPoint) {
        var hit = null;
        var nums = Object.keys(balls);
        for (var i = nums.length - 1; i >= 0; i--) {
            var b = balls[+nums[i]];
            if (!b.group) continue;
            var center = T(b.tableX, b.tableY);
            var dist = canvasPoint.getDistance(center);
            if (dist <= S(cfg.ballRadius) * 1.4) {
                hit = b;
                break;
            }
        }
        return hit;
    }

    function getPocketTargets() {
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        return [
            { x: rail,      y: rail,          name: 'TL' },
            { x: rail + pw, y: rail,          name: 'TR' },
            { x: rail,      y: rail + ph,     name: 'BL' },
            { x: rail + pw, y: rail + ph,     name: 'BR' },
            { x: rail,      y: rail + ph / 2, name: 'ML' },
            { x: rail + pw, y: rail + ph / 2, name: 'MR' }
        ];
    }

    function findTargetBall(cueTx, cueTy, aimDx, aimDy) {
        var r = cfg.ballRadius;
        var contactDist = r * 2;
        var best = null;

        Object.keys(balls).forEach(function (k) {
            var b = balls[+k];
            if (b.num === 0) return;

            var dx = b.tableX - cueTx;
            var dy = b.tableY - cueTy;

            var aimLen = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
            if (aimLen < 0.001) return;
            var nx = aimDx / aimLen;
            var ny = aimDy / aimLen;

            var proj = dx * nx + dy * ny;
            if (proj <= 0) return;

            var perpX = dx - proj * nx;
            var perpY = dy - proj * ny;
            var perp = Math.sqrt(perpX * perpX + perpY * perpY);

            if (perp > contactDist) return;

            var offset = Math.sqrt(contactDist * contactDist - perp * perp);
            var hitDist = proj - offset;

            if (hitDist < 0) return;

            if (!best || hitDist < best.distance) {
                best = {
                    ball: b,
                    distance: hitDist,
                    hitX: cueTx + nx * hitDist,
                    hitY: cueTy + ny * hitDist
                };
            }
        });

        return best;
    }

    function findBestPocket(objTx, objTy, objDx, objDy) {
        var pockets = getPocketTargets();
        var best = null;
        var bestAngle = Infinity;

        var dirLen = Math.sqrt(objDx * objDx + objDy * objDy);
        if (dirLen < 0.001) return null;
        var nx = objDx / dirLen;
        var ny = objDy / dirLen;

        pockets.forEach(function (p) {
            var px = p.x - objTx;
            var py = p.y - objTy;
            var pLen = Math.sqrt(px * px + py * py);
            if (pLen < 0.5) return;
            var pnx = px / pLen;
            var pny = py / pLen;

            var dot = nx * pnx + ny * pny;
            var angle = Math.acos(Math.max(-1, Math.min(1, dot)));

            if (angle < bestAngle) {
                bestAngle = angle;
                best = { pocket: p, distance: pLen, angle: angle };
            }
        });

        return (best && best.angle < Math.PI / 2) ? best : null;
    }

    function drawArrowhead(fromPt, toPt, color, strokeWidth) {
        var dx = toPt.x - fromPt.x;
        var dy = toPt.y - fromPt.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        var ux = dx / len, uy = dy / len;
        var headLen = S(0.6);
        var headWidth = S(0.3);
        var base = new paper.Point(toPt.x - ux * headLen, toPt.y - uy * headLen);
        var left = new paper.Point(base.x - uy * headWidth, base.y + ux * headWidth);
        var right = new paper.Point(base.x + uy * headWidth, base.y - ux * headWidth);
        new paper.Path({
            segments: [left, toPt, right],
            strokeColor: color,
            strokeWidth: strokeWidth,
            fillColor: color,
            closed: true
        });
    }

    function clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    function drawCueOverlay(cueTx, cueTy, nx, ny, overlay) {
        if (!overlay || overlay.show === false) return;
        var cueCenter = T(cueTx, cueTy);
        var size = (typeof overlay.size === 'number') ? overlay.size : 1.6;
        var r = S(cfg.ballRadius) * size;
        var offsetMult = (typeof overlay.offset === 'number') ? overlay.offset : 2.2;
        var offset = r * offsetMult;
        var side = overlay.side || 'right';

        var leftPx = -ny;
        var leftPy = nx;
        var rightPx = ny;
        var rightPy = -nx;
        var px = (side === 'left') ? leftPx : rightPx;
        var py = (side === 'left') ? leftPy : rightPy;

        var overlayCenter = new paper.Point(cueCenter.x + px * offset, cueCenter.y + py * offset);

        var group = new paper.Group();
        var ringGroup = new paper.Group();
        var uiGroup = new paper.Group();

        var ring = new paper.Path.Circle({
            center: new paper.Point(0, 0),
            radius: r,
            strokeColor: 'rgba(255,255,255,0.75)',
            strokeWidth: Math.max(1, r * 0.08),
            fillColor: 'rgba(255,255,255,0.05)'
        });

        var tip = overlay.tip || { x: 0.35, y: -0.35 };
        var tipX = clamp(tip.x || 0, -0.8, 0.8);
        var tipY = clamp(tip.y || 0, -0.8, 0.8);
        var contact = new paper.Path.Circle({
            center: new paper.Point(tipX * r * 0.7, tipY * r * 0.7),
            radius: Math.max(1.5, r * 0.12),
            fillColor: 'rgba(0,229,255,0.8)',
            strokeColor: 'rgba(0,229,255,0.9)',
            strokeWidth: Math.max(1, r * 0.05)
        });

        var power = (typeof overlay.power === 'number') ? clamp(overlay.power, 0, 1) : 0.55;
        var batteryTop = new paper.Point(r * 1.7, -r * 0.9);
        var batteryW = r * 0.55;
        var batteryH = r * 1.8;
        var batteryLeft = batteryTop.x - batteryW / 2;
        var batteryRight = batteryTop.x + batteryW / 2;
        var batteryBottom = batteryTop.y + batteryH;

        var batteryOutline = new paper.Path.Rectangle({
            from: new paper.Point(batteryLeft, batteryTop.y),
            to: new paper.Point(batteryRight, batteryBottom),
            radius: r * 0.08,
            strokeColor: 'rgba(200,200,200,0.7)',
            strokeWidth: Math.max(1, r * 0.05),
            fillColor: 'rgba(255,255,255,0.03)'
        });
        var segments = 6;
        var gap = r * 0.07;
        var segH = (batteryH - gap * (segments - 1)) / segments;
        var filled = Math.max(0, Math.min(segments, Math.ceil(power * segments)));
        var segColors = ['#2ecc71', '#2ecc71', '#f1c40f', '#f1c40f', '#f39c12', '#e74c3c'];
        for (var si = 0; si < segments; si++) {
            var segBottom = batteryBottom - si * (segH + gap);
            var segTop = segBottom - segH;
            var active = (si < filled);
            var seg = new paper.Path.Rectangle({
                from: new paper.Point(batteryLeft + r * 0.06, segTop),
                to: new paper.Point(batteryRight - r * 0.06, segBottom),
                radius: r * 0.05,
                strokeColor: null,
                fillColor: active ? segColors[si] : 'rgba(255,255,255,0.08)'
            });
            uiGroup.addChild(seg);
        }

        var label = new paper.PointText({
            point: new paper.Point(0, r * 1.55),
            content: 'SUGGESTED TIP / POWER',
            fillColor: 'rgba(255,255,255,0.5)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(8, r * 0.28),
            justification: 'center'
        });

        ringGroup.addChild(ring);
        ringGroup.addChild(contact);
        uiGroup.addChild(batteryOutline);
        uiGroup.addChild(label);

        group.addChild(ringGroup);
        group.addChild(uiGroup);

        group.position = overlayCenter;
        ringGroup.rotate(Math.atan2(ny, nx) * 180 / Math.PI);
    }

    function drawShotLines(cueTx, cueTy, aimTx, aimTy) {
        clearShotLines();
        PT.shotLayer.activate();

        var aimDx = aimTx - cueTx;
        var aimDy = aimTy - cueTy;
        var aimLen = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
        if (aimLen < 0.1) return;

        var nx = aimDx / aimLen;
        var ny = aimDy / aimLen;

        var target = findTargetBall(cueTx, cueTy, aimDx, aimDy);

        if (!target) {
            var extLen = 200;
            var fromPt = T(cueTx, cueTy);
            var toPt = T(cueTx + nx * extLen, cueTy + ny * extLen);
            new paper.Path.Line({
                from: fromPt,
                to: toPt,
                strokeColor: colors.aimLine,
                strokeWidth: S(0.12),
                dashArray: [S(0.5), S(0.5)]
            });
            drawArrowhead(fromPt, toPt, colors.aimLine, S(0.12));
            drawCueOverlay(cueTx, cueTy, nx, ny, PT.cueOverlay);
            return;
        }

        // Aim line
        var aimFrom = T(cueTx, cueTy);
        var aimTo = T(target.hitX, target.hitY);
        new paper.Path.Line({
            from: aimFrom,
            to: aimTo,
            strokeColor: colors.aimLine,
            strokeWidth: S(0.12)
        });
        drawArrowhead(aimFrom, aimTo, colors.aimLine, S(0.12));
        drawCueOverlay(cueTx, cueTy, nx, ny, PT.cueOverlay);

        // Ghost ball
        new paper.Path.Circle({
            center: T(target.hitX, target.hitY),
            radius: S(cfg.ballRadius),
            strokeColor: 'rgba(255,255,255,0.5)',
            strokeWidth: S(0.1),
            dashArray: [S(0.3), S(0.3)],
            fillColor: null
        });

        // Object ball direction
        var objBall = target.ball;
        var objDx = objBall.tableX - target.hitX;
        var objDy = objBall.tableY - target.hitY;
        var objLen = Math.sqrt(objDx * objDx + objDy * objDy);
        if (objLen < 0.001) {
            objDx = nx;
            objDy = ny;
        } else {
            objDx /= objLen;
            objDy /= objLen;
        }

        var pocketHit = findBestPocket(objBall.tableX, objBall.tableY, objDx, objDy);

        // OB deflection line
        var deflLen = 15;
        var behindLen = 3;
        var deflFrom = T(objBall.tableX - objDx * behindLen, objBall.tableY - objDy * behindLen);
        var deflTo = T(objBall.tableX + objDx * deflLen, objBall.tableY + objDy * deflLen);
        new paper.Path.Line({
            from: deflFrom,
            to: deflTo,
            strokeColor: colors.objBallPath,
            strokeWidth: S(0.15)
        });
        drawArrowhead(deflFrom, deflTo, colors.objBallPath, S(0.15));

        if (pocketHit) {
            new paper.Path.Line({
                from: T(objBall.tableX, objBall.tableY),
                to: T(pocketHit.pocket.x, pocketHit.pocket.y),
                strokeColor: colors.pocketPath,
                strokeWidth: S(0.15),
                dashArray: [S(0.45), S(0.35)]
            });
            new paper.Path.Circle({
                center: T(pocketHit.pocket.x, pocketHit.pocket.y),
                radius: S(0.5),
                strokeColor: colors.pocketPath,
                strokeWidth: S(0.12),
                fillColor: null
            });
        } else {
            var extObjLen = 40;
            new paper.Path.Line({
                from: T(objBall.tableX + objDx * deflLen, objBall.tableY + objDy * deflLen),
                to: T(objBall.tableX + objDx * extObjLen, objBall.tableY + objDy * extObjLen),
                strokeColor: colors.objBallPath,
                strokeWidth: S(0.12),
                dashArray: [S(0.4), S(0.4)]
            });
        }

        // Cue ball path after contact (90° rule)
        var cueDx, cueDy;
        var cutDot = nx * objDx + ny * objDy;
        var isNearlyStraight = cutDot > 0.996;
        if (objLen < 0.001 || isNearlyStraight) {
            cueDx = 0;
            cueDy = 0;
        } else {
            cueDx = -objDy;
            cueDy = objDx;
            var dot = cueDx * nx + cueDy * ny;
            if (dot < 0) {
                cueDx = -cueDx;
                cueDy = -cueDy;
            }
        }

        if (Math.abs(cueDx) > 0.001 || Math.abs(cueDy) > 0.001) {
            var cuePathLen = 20;
            new paper.Path.Line({
                from: T(target.hitX, target.hitY),
                to: T(target.hitX + cueDx * cuePathLen, target.hitY + cueDy * cuePathLen),
                strokeColor: colors.cueBallPath,
                strokeWidth: S(0.12),
                dashArray: [S(0.3), S(0.3)]
            });
        }

        // Cut angle text
        var cutAngle = Math.acos(Math.max(-1, Math.min(1, nx * objDx + ny * objDy)));
        var cutDeg = Math.round(cutAngle * 180 / Math.PI);

        var labelX = target.hitX + 2;
        var labelY = target.hitY - 2;
        new paper.PointText({
            point: T(labelX, labelY),
            content: cutDeg + '°',
            fillColor: colors.text,
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: S(1.5),
            justification: 'left'
        });
    }

    // ── Exports ──
    PT.clearShotLines = clearShotLines;
    PT.hitBall = hitBall;
    PT.getPocketTargets = getPocketTargets;
    PT.findTargetBall = findTargetBall;
    PT.findBestPocket = findBestPocket;
    PT.drawShotLines = drawShotLines;
})();

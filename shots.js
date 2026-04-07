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
        var cDiag   = cfg.cornerPocketShelf * 0.7;
        var sOffset = cfg.sidePocketShelf + cfg.sidePocketRadius;
        return [
            { x: rail - cDiag,      y: rail - cDiag,          name: 'TL' },
            { x: rail + pw + cDiag, y: rail - cDiag,          name: 'TR' },
            { x: rail - cDiag,      y: rail + ph + cDiag,     name: 'BL' },
            { x: rail + pw + cDiag, y: rail + ph + cDiag,     name: 'BR' },
            { x: rail - sOffset,    y: rail + ph / 2,         name: 'ML' },
            { x: rail + pw + sOffset, y: rail + ph / 2,       name: 'MR' }
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

        // Compute aim direction in canvas space
        var aimCanvas = T(cueTx + nx, cueTy + ny).subtract(cueCenter);
        var aimLen = aimCanvas.length;
        var cnx = aimCanvas.x / aimLen;
        var cny = aimCanvas.y / aimLen;

        // Place overlay to the right of the aim line (player's perspective)
        var px = -cny;
        var py = cnx;

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
        // Rotate overlay to align with aim direction so tip/power face the player
        var aimAngleDeg = Math.atan2(cny, cnx) * (180 / Math.PI);
        group.rotate(aimAngleDeg + 90, overlayCenter);
    }

    function drawCueOverlayAtCanvas(center, angleRad, overlay, sizeScale) {
        if (!overlay || overlay.show === false) return null;
        var size = (typeof overlay.size === 'number') ? overlay.size : 1.6;
        if (typeof sizeScale === 'number') size *= sizeScale;
        var r = S(cfg.ballRadius) * size;

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

        group.position = center;
        // Keep preview orientation fixed so the hit point does not rotate.

        return group;
    }

    function drawShotLines(cueTx, cueTy, aimTx, aimTy) {
        clearShotLines();
        PT.shotLayer.activate();

        // Store aim point for drill save
        PT.lastAimPoint = { x: aimTx, y: aimTy };

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
            if (!PT.editMode) drawCueOverlay(cueTx, cueTy, nx, ny, PT.cueOverlay);
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
        if (!PT.editMode) drawCueOverlay(cueTx, cueTy, nx, ny, PT.cueOverlay);

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

    // ── Edit panel helpers ──

    function getEditFieldValue(overlay, key) {
        if (!overlay) return 0;
        if (key === 'tipX') return (overlay.tip && overlay.tip.x) || 0;
        if (key === 'tipY') return (overlay.tip && overlay.tip.y) || 0;
        if (key === 'power') return (typeof overlay.power === 'number') ? overlay.power : 0.5;
        return 0;
    }

    function setEditFieldValue(overlay, key, val) {
        if (!overlay) return;
        if (key === 'tipX') { if (!overlay.tip) overlay.tip = { x: 0, y: 0 }; overlay.tip.x = val; }
        else if (key === 'tipY') { if (!overlay.tip) overlay.tip = { x: 0, y: 0 }; overlay.tip.y = val; }
        else if (key === 'power') { overlay.power = val; }
    }

    function editAdjust(dir) {
        var overlay = PT.cueOverlay;
        if (!overlay || !PT.editMode) return;
        var field = PT.editFields[PT.editCursor];
        if (!field) return;

        if (field.values) {
            // Toggle through discrete values
            var cur = getEditFieldValue(overlay, field.key);
            var idx = field.values.indexOf(cur);
            if (idx < 0) idx = 0;
            idx = (idx + dir + field.values.length) % field.values.length;
            setEditFieldValue(overlay, field.key, field.values[idx]);
        } else {
            // Numeric field
            var cur = getEditFieldValue(overlay, field.key);
            var step = field.step || 0.05;
            var newVal = Math.round((cur + dir * step) * 100) / 100;
            newVal = clamp(newVal, field.min, field.max);
            setEditFieldValue(overlay, field.key, newVal);
        }
    }

    var editOverlayGroup = null;
    var editPanelAnchor = null;

    function drawEditOverlayPreview() {
        if (editOverlayGroup) { editOverlayGroup.remove(); editOverlayGroup = null; }
        if (!PT.editMode || !PT.cueOverlay) return;

        PT.uiLayer.activate();

        var fb = PT.getFeltBounds();
        var fw = fb.right - fb.left;
        var fh = fb.bottom - fb.top;
        var center;
        var sizeScale = 1.4;
        var angleRad = 0;
        var cue = balls[0];
        if (cue && PT.lastAimPoint) {
            var adx = PT.lastAimPoint.x - cue.tableX;
            var ady = PT.lastAimPoint.y - cue.tableY;
            var alen = Math.sqrt(adx * adx + ady * ady);
            if (alen > 0.001) angleRad = Math.atan2(ady, adx);
        } else if (cue) {
            var nums = Object.keys(balls);
            var bestDist = Infinity;
            for (var i = 0; i < nums.length; i++) {
                var b = balls[+nums[i]];
                if (b.num === 0) continue;
                var dx = b.tableX - cue.tableX;
                var dy = b.tableY - cue.tableY;
                var d = Math.sqrt(dx * dx + dy * dy);
                if (d > 0.1 && d < bestDist) {
                    bestDist = d;
                    angleRad = Math.atan2(dy, dx);
                }
            }
        }
        if (editPanelAnchor && editPanelAnchor.previewX !== undefined) {
            center = new paper.Point(
                editPanelAnchor.previewX + editPanelAnchor.previewW * 0.5,
                editPanelAnchor.previewY + editPanelAnchor.previewH * 0.55
            );
            sizeScale = 1.2;
        } else {
            center = new paper.Point(
                fb.right - fw * 0.12,
                fb.bottom - fh * 0.22
            );
        }

        editOverlayGroup = drawCueOverlayAtCanvas(center, angleRad, PT.cueOverlay, sizeScale);
    }

    function drawEditPanel() {
        PT.uiLayer.activate();
        // Remove any existing edit panel
        if (PT._editPanelGroup) { PT._editPanelGroup.remove(); PT._editPanelGroup = null; }
        if (!PT.editMode || !PT.cueOverlay) return;

        var overlay = PT.cueOverlay;
        var fb = PT.getFeltBounds();
        var fw = fb.right - fb.left;
        var fh = fb.bottom - fb.top;

        var panelW = fw * 0.38;
        var panelH = fh * 0.35;
        var panelX = fb.left + fw * 0.03;
        var panelY = fb.bottom - panelH - fh * 0.03;

        var group = new paper.Group();

        var contentX = panelX + panelW * 0.04;
        var contentW = panelW * 0.55;
        var previewX = panelX + panelW * 0.63;
        var previewY = panelY + panelH * 0.18;
        var previewW = panelW * 0.33;
        var previewH = panelH * 0.64;

        editPanelAnchor = {
            x: panelX, y: panelY, w: panelW, h: panelH,
            previewX: previewX, previewY: previewY, previewW: previewW, previewH: previewH,
            contentX: contentX, contentW: contentW
        };

        // Background
        group.addChild(new paper.Path.Rectangle({
            from: new paper.Point(panelX, panelY),
            to: new paper.Point(panelX + panelW, panelY + panelH),
            radius: S(0.3),
            fillColor: 'rgba(0,0,0,0.85)',
            strokeColor: 'rgba(0,229,255,0.6)',
            strokeWidth: 2
        }));

        // Title
        var titleY = panelY + panelH * 0.14;
        group.addChild(new paper.PointText({
            point: new paper.Point(panelX + panelW / 2, titleY),
            content: 'CUE OVERLAY EDIT',
            fillColor: 'rgba(0,229,255,0.9)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(10, panelW * 0.06),
            fontWeight: 'bold',
            justification: 'center'
        }));

        // Fields
        var fields = PT.editFields;
        var fieldStartY = titleY + panelH * 0.12;
        var fieldH = (panelH * 0.48) / fields.length;
        var labelX = contentX + contentW * 0.08;
        var valueX = contentX + contentW * 0.92;

        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var y = fieldStartY + i * fieldH + fieldH * 0.5;
            var selected = (i === PT.editCursor);
            var val = getEditFieldValue(overlay, f.key);
            var valStr = f.values ? val.toUpperCase() : val.toFixed(2);

            if (selected) {
                group.addChild(new paper.Path.Rectangle({
                    from: new paper.Point(contentX + contentW * 0.00, y - fieldH * 0.40),
                    to: new paper.Point(contentX + contentW * 0.97, y + fieldH * 0.40),
                    radius: S(0.15),
                    fillColor: 'rgba(0,229,255,0.15)',
                    strokeColor: 'rgba(0,229,255,0.4)',
                    strokeWidth: 1
                }));
            }

            // Cursor indicator
            group.addChild(new paper.PointText({
                point: new paper.Point(labelX - panelW * 0.035, y + Math.max(4, panelW * 0.03)),
                content: selected ? '▸' : ' ',
                fillColor: 'rgba(0,229,255,0.9)',
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.max(10, panelW * 0.07),
                justification: 'left'
            }));

            // Label
            group.addChild(new paper.PointText({
                point: new paper.Point(labelX, y + Math.max(4, panelW * 0.03)),
                content: f.label,
                fillColor: selected ? '#fff' : 'rgba(255,255,255,0.6)',
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.max(9, panelW * 0.065),
                justification: 'left'
            }));

            // Value
            group.addChild(new paper.PointText({
                point: new paper.Point(valueX, y + Math.max(4, panelW * 0.03)),
                content: valStr,
                fillColor: selected ? '#0ef' : 'rgba(200,200,200,0.8)',
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.max(9, panelW * 0.065),
                fontWeight: 'bold',
                justification: 'right'
            }));
        }

        // Hint line
        var hasDrill = !!(PT.activeDrills && PT.activeDrills.length);
        var hintLine1 = '↑↓ select  ←→ adjust  0-9 drop';
        var hintLine2 = (hasDrill ? 'S save  ' : '') + 'N new  E done';
        group.addChild(new paper.PointText({
            point: new paper.Point(panelX + panelW / 2, panelY + panelH * 0.85),
            content: hintLine1,
            fillColor: 'rgba(255,255,255,0.35)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(7, panelW * 0.04),
            justification: 'center'
        }));
        group.addChild(new paper.PointText({
            point: new paper.Point(panelX + panelW / 2, panelY + panelH * 0.95),
            content: hintLine2,
            fillColor: 'rgba(255,255,255,0.35)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(7, panelW * 0.04),
            justification: 'center'
        }));

        PT._editPanelGroup = group;
        drawEditOverlayPreview();
    }

    function drawNewDrillPanel() {
        PT.uiLayer.activate();
        // Remove any existing panels
        if (PT._editPanelGroup) { PT._editPanelGroup.remove(); PT._editPanelGroup = null; }
        if (PT._newDrillPanelGroup) { PT._newDrillPanelGroup.remove(); PT._newDrillPanelGroup = null; }
        if (!PT.newDrillMode) return;

        var fb = PT.getFeltBounds();
        var fw = fb.right - fb.left;
        var fh = fb.bottom - fb.top;

        var panelW = fw * 0.32;
        var panelH = fh * 0.42;
        var panelX = fb.left + fw * 0.03;
        var panelY = fb.bottom - panelH - fh * 0.03;

        var group = new paper.Group();

        // Background
        group.addChild(new paper.Path.Rectangle({
            from: new paper.Point(panelX, panelY),
            to: new paper.Point(panelX + panelW, panelY + panelH),
            radius: S(0.3),
            fillColor: 'rgba(0,0,0,0.9)',
            strokeColor: 'rgba(255,0,170,0.6)',
            strokeWidth: 2
        }));

        // Title
        var titleY = panelY + panelH * 0.14;
        group.addChild(new paper.PointText({
            point: new paper.Point(panelX + panelW / 2, titleY),
            content: 'SAVE NEW DRILL',
            fillColor: 'rgba(255,0,170,0.9)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(10, panelW * 0.06),
            fontWeight: 'bold',
            justification: 'center'
        }));

        var contentX = panelX + panelW * 0.04;
        var contentW = panelW * 0.92;

        // Name display
        var nameY = titleY + panelH * 0.18;
        group.addChild(new paper.PointText({
            point: new paper.Point(contentX + contentW * 0.08, nameY),
            content: 'Name',
            fillColor: 'rgba(255,255,255,0.5)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(8, panelW * 0.06),
            justification: 'left'
        }));
        group.addChild(new paper.PointText({
            point: new paper.Point(contentX + contentW * 0.92, nameY),
            content: PT.newDrillName || '(unnamed)',
            fillColor: PT.newDrillName ? '#fff' : 'rgba(255,255,255,0.3)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(8, panelW * 0.06),
            fontWeight: 'bold',
            justification: 'right'
        }));

        // Selectable fields: Category, Difficulty
        var fields = PT.newDrillFields;
        var fieldStartY = nameY + panelH * 0.06;
        var fieldH = (panelH * 0.38) / fields.length;
        var labelX = contentX + contentW * 0.08;
        var valueX = contentX + contentW * 0.92;

        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            var y = fieldStartY + i * fieldH + fieldH * 0.5;
            var selected = (i === PT.newDrillCursor);
            var valStr = '';

            if (f.key === 'category') {
                var cat = DRILL_CATALOG[PT.newDrillCatIdx];
                valStr = cat ? (cat.icon + ' ' + cat.name) : '?';
            } else if (f.key === 'difficulty') {
                valStr = '';
                for (var s = 0; s < 3; s++) {
                    valStr += (s < PT.newDrillDifficulty) ? '★' : '☆';
                }
            }

            if (selected) {
                group.addChild(new paper.Path.Rectangle({
                    from: new paper.Point(contentX + contentW * 0.00, y - fieldH * 0.40),
                    to: new paper.Point(contentX + contentW * 0.97, y + fieldH * 0.40),
                    radius: S(0.15),
                    fillColor: 'rgba(255,0,170,0.12)',
                    strokeColor: 'rgba(255,0,170,0.4)',
                    strokeWidth: 1
                }));
            }

            group.addChild(new paper.PointText({
                point: new paper.Point(labelX - panelW * 0.035, y + Math.max(4, panelW * 0.03)),
                content: selected ? '▸' : ' ',
                fillColor: 'rgba(255,0,170,0.9)',
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.max(10, panelW * 0.07),
                justification: 'left'
            }));

            group.addChild(new paper.PointText({
                point: new paper.Point(labelX, y + Math.max(4, panelW * 0.03)),
                content: f.label,
                fillColor: selected ? '#fff' : 'rgba(255,255,255,0.6)',
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.max(9, panelW * 0.065),
                justification: 'left'
            }));

            group.addChild(new paper.PointText({
                point: new paper.Point(valueX, y + Math.max(4, panelW * 0.03)),
                content: valStr,
                fillColor: selected ? '#f0a' : 'rgba(200,200,200,0.8)',
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.max(9, panelW * 0.065),
                fontWeight: 'bold',
                justification: 'right'
            }));
        }

        // Hint
        var hintLine1 = '↑↓ select  ←→ adjust';
        var hintLine2 = 'S save  Esc cancel';
        group.addChild(new paper.PointText({
            point: new paper.Point(panelX + panelW / 2, panelY + panelH * 0.85),
            content: hintLine1,
            fillColor: 'rgba(255,255,255,0.35)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(7, panelW * 0.04),
            justification: 'center'
        }));
        group.addChild(new paper.PointText({
            point: new paper.Point(panelX + panelW / 2, panelY + panelH * 0.95),
            content: hintLine2,
            fillColor: 'rgba(255,255,255,0.35)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(7, panelW * 0.04),
            justification: 'center'
        }));

        PT._newDrillPanelGroup = group;
    }

    // ── Find target ball for auto-solve / animate ──
    // Priority: 1) selected ball  2) aim-line target  3) best solvable ball

    function findSolveTarget(cue) {
        // 1. User-selected ball (tapped to highlight)
        if (PT.selectedBall !== null && PT.selectedBall !== 0 && balls[PT.selectedBall]) {
            return balls[PT.selectedBall];
        }

        // 2. Aim-line target (user drew an aim line hitting a ball)
        if (PT.aimState) {
            var aimDx = PT.aimState.aimTx - cue.tableX;
            var aimDy = PT.aimState.aimTy - cue.tableY;
            var found = findTargetBall(cue.tableX, cue.tableY, aimDx, aimDy);
            if (found) return found.ball;
        }

        // 3. Scan all balls — pick the one with the best pocket solution
        var physics = PT.physics;
        var candidates = [];
        Object.keys(balls).forEach(function (k) {
            var b = balls[+k];
            if (b.num === 0) return;
            var pocket = physics.findBestPocketForSolve(b.tableX, b.tableY, cue.tableX, cue.tableY);
            if (!pocket) return;
            var dx = pocket.x - b.tableX;
            var dy = pocket.y - b.tableY;
            var pocketDist = Math.sqrt(dx * dx + dy * dy);
            var cueToOb = Math.sqrt(
                (b.tableX - cue.tableX) * (b.tableX - cue.tableX) +
                (b.tableY - cue.tableY) * (b.tableY - cue.tableY)
            );
            // Cut angle
            var obDir = { x: dx / pocketDist, y: dy / pocketDist };
            var cueDir = { x: (b.tableX - cue.tableX) / cueToOb, y: (b.tableY - cue.tableY) / cueToOb };
            var dotVal = cueDir.x * obDir.x + cueDir.y * obDir.y;
            var cutAngle = Math.acos(Math.max(-1, Math.min(1, dotVal)));
            // Score: small cut + short distance = best
            var score = (1 - cutAngle / (Math.PI / 2)) * 100 - (cueToOb + pocketDist) * 0.3;
            candidates.push({ ball: b, score: score });
        });

        if (candidates.length === 0) return null;
        candidates.sort(function (a, b) { return b.score - a.score; });
        return candidates[0].ball;
    }

    function showNoShotFeedback(msg) {
        PT.shotLayer.activate();
        var fb = PT.getFeltBounds();
        new paper.PointText({
            point: new paper.Point(fb.left + (fb.right - fb.left) * 0.5, fb.top + S(3)),
            content: msg || 'NO SHOT FOUND',
            fillColor: 'rgba(255,100,100,0.8)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: S(1.8),
            justification: 'center'
        });
    }

    function getPocketSummary(sim) {
        var out = {
            count: 0,
            entries: [],
            text: 'MISS',
            hasPocket: false
        };
        if (!sim || !sim.balls || !sim.balls.pocketed) return out;

        Object.keys(sim.balls.pocketed).forEach(function (id) {
            out.entries.push(id + ':' + sim.balls.pocketed[id]);
        });
        out.count = out.entries.length;
        out.hasPocket = out.count > 0;
        out.text = out.hasPocket ? ('POCKETED: ' + out.entries.join(', ')) : 'MISS';
        return out;
    }

    // ── Auto-solve: run physics solver and draw predicted paths ──

    function autoSolve() {
        var cue = balls[0];
        if (!cue) return;

        // Clear stale aim state from previous clicks
        PT.aimState = null;

        var targetBall = findSolveTarget(cue);
        if (!targetBall) { clearShotLines(); showNoShotFeedback('NO TARGET BALL'); return; }

        var physics = PT.physics;
        var solution = physics.solveShotForPocket(
            cue.tableX, cue.tableY,
            targetBall.tableX, targetBall.tableY,
            null // auto-pick best pocket
        );
        if (!solution) { clearShotLines(); showNoShotFeedback('NO POCKETABLE SHOT FOR BALL ' + targetBall.num); return; }

        // Apply solution to cue overlay
        PT.cueOverlay = {
            show: true,
            tip: { x: solution.tipX, y: solution.tipY },
            power: solution.power
        };

        // Set aim state to the solved angle
        var aimLen = 30;
        var aimTx = cue.tableX + Math.cos(solution.aimAngle) * aimLen;
        var aimTy = cue.tableY + Math.sin(solution.aimAngle) * aimLen;
        drawShotLines(cue.tableX, cue.tableY, aimTx, aimTy);

        // Draw physics-predicted paths on top
        PT.shotLayer.activate();
        var sim = solution.simulation;
        if (sim && sim.hit) {
            // Preferred: multi-ball rendering from physics engine
            if (sim.balls && sim.balls.paths) {
                Object.keys(sim.balls.paths).forEach(function (id) {
                    var path = sim.balls.paths[id];
                    if (!path || path.length < 2) return;

                    var pts = [];
                    for (var pi = 0; pi < path.length; pi += 3) {
                        pts.push(T(path[pi].x, path[pi].y));
                    }
                    if (pts.length < 2) return;

                    var color = 'rgba(255,255,255,0.25)';
                    var width = S(0.07);
                    if (id === '0') {
                        color = 'rgba(255,165,0,0.45)';
                        width = S(0.08);
                    } else if (id === 'target') {
                        color = 'rgba(0,229,255,0.55)';
                        width = S(0.1);
                    }

                    new paper.Path({
                        segments: pts,
                        strokeColor: color,
                        strokeWidth: width,
                        dashArray: [S(0.18), S(0.18)]
                    });
                });

                // Pocket indicators for all pocketed balls
                if (sim.balls.pocketed) {
                    Object.keys(sim.balls.pocketed).forEach(function (id) {
                        var pth = sim.balls.paths[id];
                        if (!pth || !pth.length) return;
                        var finalPt = pth[pth.length - 1];
                        new paper.Path.Circle({
                            center: T(finalPt.x, finalPt.y),
                            radius: S(1.1),
                            strokeColor: 'rgba(0,255,136,0.85)',
                            strokeWidth: S(0.14),
                            fillColor: null
                        });
                    });
                }
            } else {
                // Fallback legacy rendering
                if (sim.ob && sim.ob.path.length > 1) {
                    var obPts = [];
                    for (var i = 0; i < sim.ob.path.length; i += 3) {
                        obPts.push(T(sim.ob.path[i].x, sim.ob.path[i].y));
                    }
                    if (obPts.length > 1) {
                        new paper.Path({
                            segments: obPts,
                            strokeColor: 'rgba(0,229,255,0.5)',
                            strokeWidth: S(0.1),
                            dashArray: [S(0.2), S(0.2)]
                        });
                    }
                }

                if (sim.cb && sim.cb.path.length > 1) {
                    var cbPts = [];
                    for (var j = 0; j < sim.cb.path.length; j += 3) {
                        cbPts.push(T(sim.cb.path[j].x, sim.cb.path[j].y));
                    }
                    if (cbPts.length > 1) {
                        new paper.Path({
                            segments: cbPts,
                            strokeColor: 'rgba(255,165,0,0.4)',
                            strokeWidth: S(0.08),
                            dashArray: [S(0.15), S(0.15)]
                        });
                    }
                }
            }

            // Status label
            var pocketSummary = getPocketSummary(sim);
            var statusText = pocketSummary.hasPocket
                ? ('AUTO: ' + pocketSummary.text + ' (' + Math.round(solution.cutAngleDeg) + '\u00B0)')
                : ('AUTO: miss (' + Math.round(solution.cutAngleDeg) + '\u00B0)');
            var fb = PT.getFeltBounds();
            new paper.PointText({
                point: new paper.Point(fb.left + (fb.right - fb.left) * 0.5, fb.top + S(3)),
                content: statusText,
                fillColor: pocketSummary.hasPocket ? 'rgba(0,255,136,0.8)' : 'rgba(255,100,100,0.8)',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: S(1.8),
                justification: 'center'
            });
        }

        // Refresh edit panel if in edit mode
        if (PT.editMode) PT.drawEditPanel();
    }

    // ── Animated shot: roll balls along simulated paths ──

    var animState = null;  // active animation state or null

    function isAnimating() { return animState !== null; }

    function stopAnimation() {
        if (!animState) return;
        // Restore balls to original positions and visibility
        if (animState.cueBall) {
            PT.placeBall(0, animState.origCueX, animState.origCueY);
        }
        if (animState.dynamicBalls && animState.dynamicBalls.length) {
            for (var di = 0; di < animState.dynamicBalls.length; di++) {
                var db = animState.dynamicBalls[di];
                if (!db || !db.ball) continue;
                if (db.ball.group) {
                    db.ball.group.visible = true;
                    db.ball.group.opacity = 1;
                }
                if (typeof db.origX === 'number' && typeof db.origY === 'number') {
                    PT.placeBall(db.ball.num, db.origX, db.origY);
                }
                if (db.trail) {
                    db.trail.remove();
                    db.trail = null;
                }
            }
        }
        // Clean up trail paths
        if (animState.cbTrail) { animState.cbTrail.remove(); animState.cbTrail = null; }
        if (animState.obTrail) { animState.obTrail.remove(); animState.obTrail = null; }
        animState = null;
    }

    function animateShot() {
        // If already animating, stop and reset
        if (animState) { stopAnimation(); return; }

        var cue = balls[0];
        if (!cue) return;

        // Use the user's current aim line; do not auto-solve here.
        var aim = PT.lastAimPoint;
        if (!aim) {
            clearShotLines();
            showNoShotFeedback('SET AIM FIRST (DRAG FROM CUE BALL)');
            return;
        }

        var aimDx = aim.x - cue.tableX;
        var aimDy = aim.y - cue.tableY;
        var aimLen = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
        if (aimLen < 0.1) {
            clearShotLines();
            showNoShotFeedback('SET AIM FIRST (DRAG FROM CUE BALL)');
            return;
        }

        var aimAngle = Math.atan2(aimDy, aimDx);

        // Use current overlay settings as the user's chosen strike.
        var overlay = PT.cueOverlay || { tip: { x: 0, y: 0 }, power: 0.55 };
        var tipX = (overlay.tip && typeof overlay.tip.x === 'number') ? overlay.tip.x : 0;
        var tipY = (overlay.tip && typeof overlay.tip.y === 'number') ? overlay.tip.y : 0;
        var power = (typeof overlay.power === 'number') ? overlay.power : 0.55;

        // Identify the first OB on the user's aim line.
        var targetHit = findTargetBall(cue.tableX, cue.tableY, aimDx, aimDy);
        var targetBall = targetHit ? targetHit.ball : null;

        var physics = PT.physics;
        var sim = null;
        var resultText = 'MISS';

        if (targetBall) {
            sim = physics.simulateShot(
                cue.tableX, cue.tableY,
                targetBall.tableX, targetBall.tableY,
                aimAngle, tipX, tipY, power
            );
            if (!sim || !sim.hit) {
                clearShotLines();
                showNoShotFeedback('NO CONTACT');
                return;
            }
            resultText = getPocketSummary(sim).text;
        } else {
            // No OB contact: animate cue ball only so user sees miss behavior.
            var launch = physics.cueBallLaunch(tipX, tipY, power, aimAngle);
            var cbOnly = physics.simulateRoll(cue.tableX, cue.tableY, launch.vx, launch.vy, launch.sidespin);
            sim = {
                hit: false,
                ghostX: cue.tableX,
                ghostY: cue.tableY,
                ob: null,
                cb: cbOnly
            };
            resultText = 'NO CONTACT';
        }

        // Build full cue ball path: pre-contact (straight line to ghost) + post-contact
        var cbFullPath = [];
        var pointDt = 0.02; // simulateRoll samples every 4 * 0.005s = 0.02s per point
        var contactIdx = -1;
        if (sim.hit) {
            // Pre-contact: cue ball travels from start to ghost ball position
            var launch = physics.cueBallLaunch(tipX, tipY, power, aimAngle);
            var preDist = Math.sqrt(
                (sim.ghostX - cue.tableX) * (sim.ghostX - cue.tableX) +
                (sim.ghostY - cue.tableY) * (sim.ghostY - cue.tableY)
            );
            var preTime = preDist / Math.max(1, launch.speed);
            var preSteps = Math.max(8, Math.round(preTime / pointDt));
            for (var s = 0; s <= preSteps; s++) {
                var t = s / preSteps;
                cbFullPath.push({
                    x: cue.tableX + (sim.ghostX - cue.tableX) * t,
                    y: cue.tableY + (sim.ghostY - cue.tableY) * t
                });
            }
            // Contact index — OB starts moving here
            contactIdx = cbFullPath.length - 1;
            // Post-contact
            if (sim.cb && sim.cb.path.length > 0) {
                for (var ci = 0; ci < sim.cb.path.length; ci++) {
                    cbFullPath.push(sim.cb.path[ci]);
                }
            }
        } else if (sim.cb && sim.cb.path.length > 0) {
            // Cue-only simulation (no OB contact)
            for (var cj = 0; cj < sim.cb.path.length; cj++) {
                cbFullPath.push(sim.cb.path[cj]);
            }
            contactIdx = cbFullPath.length + 1; // OB never starts
        }

        // Build dynamic ball tracks from multi-ball simulation (or legacy OB fallback).
        var dynamicBalls = [];

        function buildPaddedPath(startX, startY, rawPath) {
            var out = [];
            for (var pad = 0; pad <= contactIdx; pad++) out.push({ x: startX, y: startY });
            for (var rp = 0; rp < rawPath.length; rp++) out.push(rawPath[rp]);
            return out;
        }

        if (sim.balls && sim.balls.paths) {
            Object.keys(sim.balls.paths).forEach(function (id) {
                if (id === '0') return;
                var ballRef = (id === 'target') ? targetBall : balls[+id];
                if (!ballRef || !ballRef.group) return;
                var raw = sim.balls.paths[id] || [];
                if (!raw.length) return;

                var db = {
                    id: id,
                    ball: ballRef,
                    origX: ballRef.tableX,
                    origY: ballRef.tableY,
                    path: buildPaddedPath(ballRef.tableX, ballRef.tableY, raw),
                    pocketFrame: -1,
                    hidden: false,
                    trail: null
                };
                if (sim.balls.pocketed && sim.balls.pocketed[id]) {
                    db.pocketFrame = contactIdx + raw.length - 1;
                }
                dynamicBalls.push(db);
            });
        } else if (targetBall) {
            // Legacy OB path fallback
            var rawOb = (sim.ob && sim.ob.path) ? sim.ob.path : [];
            var legacyPath = buildPaddedPath(targetBall.tableX, targetBall.tableY, rawOb);
            dynamicBalls.push({
                id: 'target',
                ball: targetBall,
                origX: targetBall.tableX,
                origY: targetBall.tableY,
                path: legacyPath,
                pocketFrame: (sim.ob && sim.ob.pocketed) ? (contactIdx + rawOb.length - 1) : -1,
                hidden: false,
                trail: null
            });
        }

        // Equalize lengths (pad shorter paths with final positions)
        var maxLen = cbFullPath.length;
        for (var dbi = 0; dbi < dynamicBalls.length; dbi++) {
            if (dynamicBalls[dbi].path.length > maxLen) maxLen = dynamicBalls[dbi].path.length;
        }
        var cbLast = cbFullPath[cbFullPath.length - 1] || { x: cue.tableX, y: cue.tableY };
        while (cbFullPath.length < maxLen) cbFullPath.push(cbLast);
        for (var dp = 0; dp < dynamicBalls.length; dp++) {
            var dpath = dynamicBalls[dp].path;
            var dlast = dpath[dpath.length - 1] || { x: dynamicBalls[dp].origX, y: dynamicBalls[dp].origY };
            while (dpath.length < maxLen) dpath.push(dlast);
        }

        // Draw the shot lines first, preserving the user's chosen aim.
        drawShotLines(cue.tableX, cue.tableY, aim.x, aim.y);

        // Create trail paths
        PT.shotLayer.activate();
        var cbTrail = new paper.Path({
            strokeColor: 'rgba(255,255,255,0.3)',
            strokeWidth: S(0.06)
        });
        for (var dt = 0; dt < dynamicBalls.length; dt++) {
            dynamicBalls[dt].trail = new paper.Path({
                strokeColor: (dynamicBalls[dt].id === 'target') ? 'rgba(255,100,100,0.3)' : 'rgba(220,220,255,0.22)',
                strokeWidth: S(0.06)
            });
        }

        var simPocket = getPocketSummary(sim);

        animState = {
            cueBall: cue,
            obBall: targetBall,
            origCueX: cue.tableX,
            origCueY: cue.tableY,
            origObX: targetBall ? targetBall.tableX : null,
            origObY: targetBall ? targetBall.tableY : null,
            cbPath: cbFullPath,
            obPath: null,
            frame: 0,
            frameCursor: 0,
            maxFrame: maxLen,
            pointDt: pointDt,
            contactIdx: contactIdx,
            obPocketFrame: -1,
            obHidden: false,
            cbTrail: cbTrail,
            obTrail: null,
            dynamicBalls: dynamicBalls,
            pocketed: simPocket.hasPocket,
            pocket: simPocket.text,
            obPocketed: sim.ob && sim.ob.pocketed,
            resultText: resultText
        };
    }

    // Called every paper.view frame to advance animation
    function animationTick(event) {
        if (!animState) return;

        var st = animState;
        var delta = (event && typeof event.delta === 'number') ? event.delta : (1 / 60);
        st.frameCursor += delta / st.pointDt;
        var advanced = Math.min(Math.floor(st.frameCursor), st.maxFrame - 1);

        if (advanced < st.frame) return;

        for (var f = st.frame; f <= advanced; f++) {
            var cbPt = st.cbPath[f];

            // Move cue ball group
            if (st.cueBall && st.cueBall.group) {
                st.cueBall.group.position = T(cbPt.x, cbPt.y);
                st.cueBall.tableX = cbPt.x;
                st.cueBall.tableY = cbPt.y;
            }

            // Move all dynamic balls participating in this simulation.
            if (st.dynamicBalls && st.dynamicBalls.length) {
                for (var dbi = 0; dbi < st.dynamicBalls.length; dbi++) {
                    var db = st.dynamicBalls[dbi];
                    if (!db || !db.ball || !db.ball.group) continue;
                    var dbPt = db.path[f];
                    if (!dbPt) continue;

                    if (!db.hidden) {
                        if (db.pocketFrame >= 0 && f >= db.pocketFrame) {
                            db.ball.group.visible = false;
                            db.hidden = true;
                        } else {
                            db.ball.group.position = T(dbPt.x, dbPt.y);
                            db.ball.tableX = dbPt.x;
                            db.ball.tableY = dbPt.y;
                        }
                    }
                }
            }

            // Add trail points (every few frames)
            if (f % 2 === 0) {
                st.cbTrail.add(T(cbPt.x, cbPt.y));
                if (st.dynamicBalls && st.dynamicBalls.length) {
                    for (var dti = 0; dti < st.dynamicBalls.length; dti++) {
                        var dtBall = st.dynamicBalls[dti];
                        if (!dtBall || !dtBall.trail || dtBall.hidden) continue;
                        if (f >= st.contactIdx) {
                            var tPt = dtBall.path[f];
                            if (tPt) dtBall.trail.add(T(tPt.x, tPt.y));
                        }
                    }
                }
            }
        }

        st.frame = advanced + 1;

        // Animation complete
        if (st.frame >= st.maxFrame) {
            // Show result label
            PT.shotLayer.activate();
            var fb = PT.getFeltBounds();
            var statusText = st.resultText || (st.pocketed ? ('POCKETED: ' + st.pocket) : 'MISS');
            new paper.PointText({
                point: new paper.Point(fb.left + (fb.right - fb.left) * 0.5, fb.top + S(3)),
                content: statusText,
                fillColor: st.pocketed ? 'rgba(0,255,136,0.9)' : 'rgba(255,100,100,0.9)',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: S(2),
                justification: 'center'
            });

            // Pause briefly then reset
            var captured = animState;
            setTimeout(function () {
                if (animState !== captured) return; // user already stopped it
                stopAnimation();
            }, 1500);
        }
    }

    // Hook into Paper.js frame event
    paper.view.on('frame', animationTick);

    // ── Exports ──
    PT.clearShotLines = clearShotLines;
    PT.hitBall = hitBall;
    PT.getPocketTargets = getPocketTargets;
    PT.findTargetBall = findTargetBall;
    PT.findBestPocket = findBestPocket;
    PT.drawShotLines = drawShotLines;
    PT.drawEditPanel = drawEditPanel;
    PT.drawNewDrillPanel = drawNewDrillPanel;
    PT.drawEditOverlayPreview = drawEditOverlayPreview;
    PT.editAdjust = editAdjust;
    PT.autoSolve = autoSolve;
    PT.animateShot = animateShot;
    PT.stopAnimation = stopAnimation;
    PT.isAnimating = isAnimating;
})();

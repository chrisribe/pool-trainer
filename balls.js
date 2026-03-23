/* ================================================================
   Pool Trainer — balls.js
   Ball creation, placement, removal, racks, redraw
   ================================================================ */

(function () {
    'use strict';

    var cfg = PT.cfg;
    var T = PT.T;
    var S = PT.S;
    var balls = PT.balls;

    function createBallGroup(num, tx, ty) {
        var bc = cfg.ballColors[num];
        var r  = cfg.ballRadius;
        var center = T(tx, ty);
        var sr = S(r);

        PT.ballLayer.activate();

        var items = [];

        if (bc.stripe) {
            var body = new paper.Path.Circle({ center: center, radius: sr, fillColor: '#ffffff' });
            var band = new paper.Path.Circle({ center: center, radius: sr * 0.92, fillColor: bc.fill });
            var disc = new paper.Path.Circle({ center: center, radius: sr * 0.52, fillColor: '#ffffff' });
            items.push(body, band, disc);
        } else {
            var solid = new paper.Path.Circle({ center: center, radius: sr, fillColor: bc.fill });
            items.push(solid);
            if (num !== 0) {
                var disc2 = new paper.Path.Circle({ center: center, radius: sr * 0.45, fillColor: '#ffffff' });
                items.push(disc2);
            }
        }

        var outline = new paper.Path.Circle({
            center: center,
            radius: sr,
            strokeColor: 'rgba(255,255,255,0.6)',
            strokeWidth: Math.max(1, sr * 0.08),
            fillColor: null
        });
        items.push(outline);

        if (bc.label) {
            var label = new paper.PointText({
                point: new paper.Point(center.x, center.y + sr * 0.3),
                content: bc.label,
                fillColor: num === 8 ? '#ffffff' : '#000000',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: sr * 0.75,
                justification: 'center'
            });
            items.push(label);
        }

        var group = new paper.Group(items);
        group.data = { ballNum: num };
        return group;
    }

    function placeBall(num, tx, ty) {
        var clamped = PT.clampToPlayingSurface(tx, ty);
        if (balls[num]) {
            balls[num].tableX = clamped.x;
            balls[num].tableY = clamped.y;
            if (balls[num].group) balls[num].group.remove();
            balls[num].group = createBallGroup(num, clamped.x, clamped.y);
        } else {
            var group = createBallGroup(num, clamped.x, clamped.y);
            balls[num] = { num: num, tableX: clamped.x, tableY: clamped.y, group: group };
        }
    }

    function removeBall(num) {
        if (balls[num]) {
            if (balls[num].group) balls[num].group.remove();
            delete balls[num];
        }
    }

    function clearBalls() {
        PT.selectedBall = null;
        Object.keys(balls).forEach(function (k) { removeBall(+k); });
    }

    function redrawBalls() {
        PT.ballLayer.removeChildren();
        PT.ballLayer.activate();
        Object.keys(balls).forEach(function (k) {
            var b = balls[+k];
            b.group = createBallGroup(b.num, b.tableX, b.tableY);
        });
        if (PT.selectedBall !== null && balls[PT.selectedBall]) {
            showSelectionRing(balls[PT.selectedBall]);
        }
    }

    function selectBall(num) {
        clearSelectionRing();
        if (PT.selectedBall === num) {
            // Toggle off
            PT.selectedBall = null;
            return;
        }
        PT.selectedBall = num;
        if (balls[num]) showSelectionRing(balls[num]);
    }

    function deselectBall() {
        clearSelectionRing();
        PT.selectedBall = null;
    }

    function deleteSelectedBall() {
        if (PT.selectedBall === null) return;
        removeBall(PT.selectedBall);
        PT.selectedBall = null;
        clearDeleteIcon();
    }

    // Selection ring — pulsing highlight around a ball
    var selectionRingItem = null;
    var deleteIconItem = null;
    function showSelectionRing(b) {
        clearSelectionRing();
        PT.ballLayer.activate();
        var center = T(b.tableX, b.tableY);
        var sr = S(cfg.ballRadius);
        selectionRingItem = new paper.Path.Circle({
            center: center,
            radius: sr * 1.35,
            strokeColor: '#ff4444',
            strokeWidth: Math.max(2, sr * 0.15),
            dashArray: [sr * 0.4, sr * 0.3],
            fillColor: null
        });
    }

    function clearSelectionRing() {
        if (selectionRingItem) {
            selectionRingItem.remove();
            selectionRingItem = null;
        }
        clearDeleteIcon();
    }

    function updateSelectionRingPosition(b) {
        if (!selectionRingItem || !b) return;
        selectionRingItem.position = T(b.tableX, b.tableY);
    }

    function showDeleteIcon(b) {
        clearDeleteIcon();
        if (!b) return;
        PT.uiLayer.activate();

        var center = T(b.tableX, b.tableY);
        var sr = S(cfg.ballRadius);
        var iconR = Math.max(8, sr * 0.55);
        var offset = new paper.Point(sr * 1.6, -sr * 1.6);
        var iconCenter = new paper.Point(center.x + offset.x, center.y + offset.y);

        var group = new paper.Group();
        var bg = new paper.Path.Circle({
            center: new paper.Point(0, 0),
            radius: iconR,
            fillColor: 'rgba(255,70,70,0.22)',
            strokeColor: '#ff4a4a',
            strokeWidth: Math.max(1, iconR * 0.18)
        });

        var bodyW = iconR * 0.9;
        var bodyH = iconR * 0.9;
        var body = new paper.Path.Rectangle({
            from: new paper.Point(-bodyW / 2, -bodyH / 2 + iconR * 0.1),
            to: new paper.Point(bodyW / 2, bodyH / 2 + iconR * 0.1),
            strokeColor: '#ff4a4a',
            strokeWidth: Math.max(1, iconR * 0.14),
            fillColor: null
        });

        var lidY = -bodyH / 2;
        var lid = new paper.Path.Line({
            from: new paper.Point(-bodyW * 0.6, lidY),
            to: new paper.Point(bodyW * 0.6, lidY),
            strokeColor: '#ff4a4a',
            strokeWidth: Math.max(1, iconR * 0.14)
        });

        var line1 = new paper.Path.Line({
            from: new paper.Point(-bodyW * 0.2, lidY + iconR * 0.25),
            to: new paper.Point(-bodyW * 0.2, lidY + iconR * 0.8),
            strokeColor: '#ff4a4a',
            strokeWidth: Math.max(1, iconR * 0.1)
        });
        var line2 = new paper.Path.Line({
            from: new paper.Point(bodyW * 0.2, lidY + iconR * 0.25),
            to: new paper.Point(bodyW * 0.2, lidY + iconR * 0.8),
            strokeColor: '#ff4a4a',
            strokeWidth: Math.max(1, iconR * 0.1)
        });

        group.addChild(bg);
        group.addChild(body);
        group.addChild(lid);
        group.addChild(line1);
        group.addChild(line2);
        group.position = iconCenter;
        group.data = { action: 'deleteBall' };

        deleteIconItem = group;
    }

    function clearDeleteIcon() {
        if (deleteIconItem) {
            deleteIconItem.remove();
            deleteIconItem = null;
        }
    }

    function updateDeleteIconPosition(b) {
        if (!deleteIconItem || !b) return;
        var center = T(b.tableX, b.tableY);
        var sr = S(cfg.ballRadius);
        var offset = new paper.Point(sr * 1.6, -sr * 1.6);
        deleteIconItem.position = new paper.Point(center.x + offset.x, center.y + offset.y);
    }

    function hitDeleteIcon(canvasPoint) {
        if (!deleteIconItem) return false;
        var hit = deleteIconItem.hitTest(canvasPoint, { fill: true, stroke: true, tolerance: 6 });
        return !!hit;
    }

    // ── Rack templates ──

    function rack9Ball() {
        clearBalls();
        PT.clearShotLines();
        PT.aimState = null;
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        var r  = cfg.ballRadius;
        var cx = rail + pw / 2;
        var footSpot = rail + ph * 0.25;
        var d = r * 2.05;

        var layout = [
            [0,  0,   1],
            [1, -0.5, 2],  [1,  0.5, 3],
            [2, -1,   4],  [2,  0,   9],  [2,  1, 5],
            [3, -0.5, 6],  [3,  0.5, 7],
            [4,  0,   8]
        ];

        var rowH = d * Math.sqrt(3) / 2;

        layout.forEach(function (entry) {
            var row = entry[0], col = entry[1], num = entry[2];
            var bx = cx + col * d;
            var by = footSpot - row * rowH;
            placeBall(num, bx, by);
        });

        placeBall(0, cx, rail + ph * 0.75);
    }

    function rack8Ball() {
        clearBalls();
        PT.clearShotLines();
        PT.aimState = null;
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        var r  = cfg.ballRadius;
        var cx = rail + pw / 2;
        var footSpot = rail + ph * 0.25;
        var d = r * 2.05;

        var layout = [
            [0,  0,    1],
            [1, -0.5, 10],  [1,  0.5, 2],
            [2, -1,   11],  [2,  0,   8],  [2,  1,  3],
            [3, -1.5,  4],  [3, -0.5,12],  [3, 0.5,13],  [3, 1.5, 5],
            [4, -2,   14],  [4, -1,   6],  [4,  0,  15],  [4, 1,  7],  [4, 2, 9]
        ];

        var rowH = d * Math.sqrt(3) / 2;

        layout.forEach(function (entry) {
            var row = entry[0], col = entry[1], num = entry[2];
            var bx = cx + col * d;
            var by = footSpot - row * rowH;
            placeBall(num, bx, by);
        });

        placeBall(0, cx, rail + ph * 0.75);
    }

    // Drop a ball at table center (or select it if it already exists)
    function dropBall(num) {
        if (num < 0 || num > 15) return;
        if (balls[num]) {
            selectBall(num);
            return;
        }
        var rail = cfg.railWidth;
        var cx = rail + cfg.playWidth / 2;
        var cy = rail + cfg.playHeight / 2;
        placeBall(num, cx, cy);
        selectBall(num);
    }

    // ── Exports ──
    PT.createBallGroup = createBallGroup;
    PT.placeBall = placeBall;
    PT.removeBall = removeBall;
    PT.clearBalls = clearBalls;
    PT.redrawBalls = redrawBalls;
    PT.selectBall = selectBall;
    PT.deselectBall = deselectBall;
    PT.deleteSelectedBall = deleteSelectedBall;
    PT.showDeleteIcon = showDeleteIcon;
    PT.clearDeleteIcon = clearDeleteIcon;
    PT.updateSelectionRingPosition = updateSelectionRingPosition;
    PT.updateDeleteIconPosition = updateDeleteIconPosition;
    PT.hitDeleteIcon = hitDeleteIcon;
    PT.rack9Ball = rack9Ball;
    PT.rack8Ball = rack8Ball;
    PT.dropBall = dropBall;
})();

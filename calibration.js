/* ================================================================
   Pool Trainer — calibration.js
   Homography math + calibration UI
   ================================================================ */

(function () {
    'use strict';

    var cfg = PT.cfg;

    // ── Homography math ──

    function computeHomography(src, dst) {
        var A = [], B = [];
        for (var i = 0; i < 4; i++) {
            var sx = src[i].x, sy = src[i].y;
            var dx = dst[i].x, dy = dst[i].y;
            A.push([sx, sy, 1, 0,  0,  0, -dx * sx, -dx * sy]);
            B.push(dx);
            A.push([0,  0,  0, sx, sy, 1, -dy * sx, -dy * sy]);
            B.push(dy);
        }
        var h = solveLinear8(A, B);
        if (!h) return null;
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }

    function solveLinear8(A, B) {
        var n = 8;
        var M = [];
        for (var i = 0; i < n; i++) {
            M[i] = A[i].slice();
            M[i].push(B[i]);
        }
        for (var col = 0; col < n; col++) {
            var maxRow = col, maxVal = Math.abs(M[col][col]);
            for (var row = col + 1; row < n; row++) {
                var v = Math.abs(M[row][col]);
                if (v > maxVal) { maxVal = v; maxRow = row; }
            }
            if (maxVal < 1e-12) return null;
            var tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
            var pivot = M[col][col];
            for (var j = col; j <= n; j++) M[col][j] /= pivot;
            for (var row2 = 0; row2 < n; row2++) {
                if (row2 === col) continue;
                var f = M[row2][col];
                for (var j2 = col; j2 <= n; j2++) M[row2][j2] -= f * M[col][j2];
            }
        }
        var x = [];
        for (var i2 = 0; i2 < n; i2++) x.push(M[i2][n]);
        return x;
    }

    function applyHomography(H, px, py) {
        var w = H[6] * px + H[7] * py + H[8];
        return {
            x: (H[0] * px + H[1] * py + H[2]) / w,
            y: (H[3] * px + H[4] * py + H[5]) / w
        };
    }

    function invert3x3(H) {
        var a = H[0], b = H[1], c = H[2];
        var d = H[3], e = H[4], f = H[5];
        var g = H[6], h = H[7], k = H[8];
        var det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
        if (Math.abs(det) < 1e-12) return null;
        var inv = 1 / det;
        return [
            (e * k - f * h) * inv, (c * h - b * k) * inv, (b * f - c * e) * inv,
            (f * g - d * k) * inv, (a * k - c * g) * inv, (c * d - a * f) * inv,
            (d * h - e * g) * inv, (b * g - a * h) * inv, (a * e - b * d) * inv
        ];
    }

    function getDefaultCorners() {
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        var tl = PT.T_default(rail, rail);
        var tr = PT.T_default(rail + pw, rail);
        var br = PT.T_default(rail + pw, rail + ph);
        var bl = PT.T_default(rail, rail + ph);
        return [
            { x: tl.x, y: tl.y },
            { x: tr.x, y: tr.y },
            { x: br.x, y: br.y },
            { x: bl.x, y: bl.y }
        ];
    }

    function rebuildCalibration() {
        if (!PT.calibrationCorners) {
            PT.calibrationMatrix = null;
            PT.calibrationInverse = null;
            return;
        }
        var src = getDefaultCorners();
        var dst = [
            PT.calibrationCorners.tl, PT.calibrationCorners.tr,
            PT.calibrationCorners.br, PT.calibrationCorners.bl
        ];
        PT.calibrationMatrix = computeHomography(src, dst);
        PT.calibrationInverse = PT.calibrationMatrix ? invert3x3(PT.calibrationMatrix) : null;
    }

    function saveCalibration() {
        if (PT.calibrationCorners) {
            localStorage.setItem('poolTrainer_calibration', JSON.stringify(PT.calibrationCorners));
        } else {
            localStorage.removeItem('poolTrainer_calibration');
        }
    }

    function loadCalibration() {
        var saved = localStorage.getItem('poolTrainer_calibration');
        if (saved) {
            try {
                // Ensure layout is computed before deriving default corners.
                if (!PT.scaleFactor) {
                    PT.computeLayout();
                }
                PT.calibrationCorners = JSON.parse(saved);
                rebuildCalibration();
            } catch (e) {
                PT.calibrationCorners = null;
            }
        }
    }

    // ── Calibration UI ──

    var calibLayer = new paper.Layer({ name: 'calibration' });
    calibLayer.visible = false;

    function enterCalibrationMode() {
        PT.calibrationMode = true;
        calibLayer.visible = true;
        calibLayer.activate();
        calibLayer.removeChildren();

        PT.clearShotLines();
        PT.uiLayer.removeChildren();
        PT.qrLayer.removeChildren();
        PT.ballLayer.visible = false;
        PT.shotLayer.visible = false;
        PT.uiLayer.visible = false;
        PT.qrLayer.visible = false;
        PT.drawTable();

        if (!PT.calibrationCorners) {
            var def = getDefaultCorners();
            PT.calibrationCorners = { tl: def[0], tr: def[1], br: def[2], bl: def[3] };
        }

        drawCalibrationHandles();
    }

    function exitCalibrationMode(save) {
        PT.calibrationMode = false;
        calibLayer.visible = false;
        calibLayer.removeChildren();
        PT.calibrationHandles.length = 0;
        PT.calibrationDragIdx = -1;

        PT.ballLayer.visible = true;
        PT.shotLayer.visible = true;
        PT.uiLayer.visible = true;
        PT.qrLayer.visible = true;

        if (save) {
            rebuildCalibration();
            saveCalibration();
        }

        PT.drawTable();
        PT.redrawBalls();
        if (PT.appMode === 'menu') PT.enterMenu();
        else if (PT.appMode === 'drillList') PT.showDrillList(PT.drillListCatId, PT.drillListPage);
        else if (PT.appMode === 'drill' && PT.activeDrills) PT.showDrillHUD();
        else if (PT.appMode === 'drill') PT.qrLayer.visible = false;
    }

    function resetCalibration() {
        PT.calibrationCorners = null;
        PT.calibrationMatrix = null;
        PT.calibrationInverse = null;
        saveCalibration();
        if (PT.calibrationMode) exitCalibrationMode(false);
        PT.drawTable();
        PT.redrawBalls();
    }

    function drawCalibrationHandles() {
        calibLayer.removeChildren();
        calibLayer.activate();
        PT.calibrationHandles.length = 0;

        var corners = [
            PT.calibrationCorners.tl, PT.calibrationCorners.tr,
            PT.calibrationCorners.br, PT.calibrationCorners.bl
        ];
        var labels = ['TL', 'TR', 'BR', 'BL'];
        var handleRadius = 14;

        new paper.Path({
            segments: corners.map(function (c) { return new paper.Point(c.x, c.y); }),
            closed: true,
            strokeColor: 'rgba(255,100,0,0.6)',
            strokeWidth: 2,
            dashArray: [8, 4],
            fillColor: null
        });

        for (var i = 0; i < 4; i++) {
            var c = corners[i];
            var group = new paper.Group();

            var circle = new paper.Path.Circle({
                center: new paper.Point(c.x, c.y),
                radius: handleRadius,
                fillColor: 'rgba(255,100,0,0.7)',
                strokeColor: '#ffffff',
                strokeWidth: 2
            });

            var ch = handleRadius * 0.6;
            var cp = new paper.Point(c.x, c.y);
            new paper.Path.Line({
                from: new paper.Point(cp.x - ch, cp.y),
                to: new paper.Point(cp.x + ch, cp.y),
                strokeColor: '#ffffff',
                strokeWidth: 1.5
            });
            new paper.Path.Line({
                from: new paper.Point(cp.x, cp.y - ch),
                to: new paper.Point(cp.x, cp.y + ch),
                strokeColor: '#ffffff',
                strokeWidth: 1.5
            });

            new paper.PointText({
                point: new paper.Point(c.x, c.y - handleRadius - 5),
                content: labels[i],
                fillColor: '#ffffff',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: 12,
                justification: 'center'
            });

            group.addChild(circle);
            PT.calibrationHandles.push({ idx: i, center: c });
        }

        var rail = cfg.railWidth;
        var textPos = PT.T_default(rail + cfg.playWidth / 2, rail + cfg.playHeight / 2);
        new paper.PointText({
            point: textPos,
            content: 'CALIBRATION',
            fillColor: 'rgba(255,100,0,0.9)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: PT.S(2),
            justification: 'center'
        });
        new paper.PointText({
            point: new paper.Point(textPos.x, textPos.y + PT.S(2.5)),
            content: 'Drag corners to match table',
            fillColor: 'rgba(255,100,0,0.7)',
            fontFamily: 'Arial, sans-serif',
            fontSize: PT.S(1.2),
            justification: 'center'
        });
        new paper.PointText({
            point: new paper.Point(textPos.x, textPos.y + PT.S(4.5)),
            content: 'K = save    Shift+K = reset',
            fillColor: 'rgba(255,100,0,0.5)',
            fontFamily: 'Arial, sans-serif',
            fontSize: PT.S(1),
            justification: 'center'
        });
    }

    function hitCalibrationHandle(canvasPoint) {
        var threshold = 20;
        var corners = [
            PT.calibrationCorners.tl, PT.calibrationCorners.tr,
            PT.calibrationCorners.br, PT.calibrationCorners.bl
        ];
        for (var i = 0; i < 4; i++) {
            var dx = canvasPoint.x - corners[i].x;
            var dy = canvasPoint.y - corners[i].y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) return i;
        }
        return -1;
    }

    // ── Exports ──
    PT.applyHomography = applyHomography;
    PT.getDefaultCorners = getDefaultCorners;
    PT.rebuildCalibration = rebuildCalibration;
    PT.saveCalibration = saveCalibration;
    PT.loadCalibration = loadCalibration;
    PT.calibLayer = calibLayer;
    PT.enterCalibrationMode = enterCalibrationMode;
    PT.exitCalibrationMode = exitCalibrationMode;
    PT.resetCalibration = resetCalibration;
    PT.drawCalibrationHandles = drawCalibrationHandles;
    PT.hitCalibrationHandle = hitCalibrationHandle;
})();

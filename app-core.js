/* ================================================================
   Pool Trainer — app.js (core)
   Shared namespace, Paper.js init, coordinate transforms, state
   ================================================================ */

window.PT = (function () {
    'use strict';

    // ── Bootstrap Paper.js ──
    var canvas = document.getElementById('table-canvas');
    paper.setup(canvas);

    var cfg = TABLE_CONFIG;
    var colors = cfg.colors;

    // ── Layers ──
    var tableLayer = new paper.Layer({ name: 'table' });
    var shotLayer  = new paper.Layer({ name: 'shots' });
    var ballLayer  = new paper.Layer({ name: 'balls' });
    var uiLayer    = new paper.Layer({ name: 'ui' });
    var qrLayer    = new paper.Layer({ name: 'qr' });

    // ── App state ──
    var appMode = 'menu';  // 'menu' | 'drillList' | 'drill'
    var projectionMode = false;

    // ── Ball state ──
    var balls = {};
    var dragTarget = null;
    var dragOffset = null;

    // ── Scale / coordinate system ──
    var totalWidth, totalHeight, scaleFactor, origin;

    // ── Calibration state ──
    var calibrationCorners = null;
    var calibrationMatrix = null;
    var calibrationInverse = null;
    var calibrationMode = false;
    var calibrationHandles = [];
    var calibrationDragIdx = -1;

    function computeLayout() {
        var rail = cfg.railWidth;
        totalWidth  = cfg.playWidth  + rail * 2;
        totalHeight = cfg.playHeight + rail * 2;

        var vw = paper.view.size.width;
        var vh = paper.view.size.height;

        var viewRatio = vw / vh;
        var drawWidth, drawHeight;
        if (viewRatio >= 1) {
            drawWidth  = totalHeight;
            drawHeight = totalWidth;
        } else {
            drawWidth  = totalWidth;
            drawHeight = totalHeight;
        }

        scaleFactor = Math.min(vw / drawWidth, vh / drawHeight) * 0.95;
        origin = new paper.Point(vw / 2, vh / 2);
    }

    function T_default(x, y) {
        var vw = paper.view.size.width;
        var vh = paper.view.size.height;
        var landscape = (vw / vh) >= 1;

        var cx, cy;
        if (landscape) {
            cx = (totalHeight - y) * scaleFactor;
            cy = x * scaleFactor;
        } else {
            cx = x * scaleFactor;
            cy = y * scaleFactor;
        }

        var drawnW, drawnH;
        if (landscape) {
            drawnW = totalHeight * scaleFactor;
            drawnH = totalWidth  * scaleFactor;
        } else {
            drawnW = totalWidth  * scaleFactor;
            drawnH = totalHeight * scaleFactor;
        }

        cx += (vw - drawnW) / 2;
        cy += (vh - drawnH) / 2;

        return new paper.Point(cx, cy);
    }

    function T(x, y) {
        var pt = T_default(x, y);
        if (calibrationMatrix) {
            var mapped = PT.applyHomography(calibrationMatrix, pt.x, pt.y);
            return new paper.Point(mapped.x, mapped.y);
        }
        return pt;
    }

    function S(inches) {
        return inches * scaleFactor;
    }

    function invT_default(canvasPoint) {
        var vw = paper.view.size.width;
        var vh = paper.view.size.height;
        var landscape = (vw / vh) >= 1;

        var drawnW, drawnH;
        if (landscape) {
            drawnW = totalHeight * scaleFactor;
            drawnH = totalWidth  * scaleFactor;
        } else {
            drawnW = totalWidth  * scaleFactor;
            drawnH = totalHeight * scaleFactor;
        }

        var cx = canvasPoint.x - (vw - drawnW) / 2;
        var cy = canvasPoint.y - (vh - drawnH) / 2;

        var tx, ty;
        if (landscape) {
            tx = cy / scaleFactor;
            ty = totalHeight - cx / scaleFactor;
        } else {
            tx = cx / scaleFactor;
            ty = cy / scaleFactor;
        }
        return { x: tx, y: ty };
    }

    function invT(canvasPoint) {
        if (calibrationInverse) {
            var unmapped = PT.applyHomography(calibrationInverse, canvasPoint.x, canvasPoint.y);
            return invT_default({ x: unmapped.x, y: unmapped.y });
        }
        return invT_default(canvasPoint);
    }

    function clampToPlayingSurface(tx, ty) {
        var rail = cfg.railWidth;
        var r = cfg.ballRadius;
        var minX = rail + r, maxX = rail + cfg.playWidth - r;
        var minY = rail + r, maxY = rail + cfg.playHeight - r;
        return {
            x: Math.max(minX, Math.min(maxX, tx)),
            y: Math.max(minY, Math.min(maxY, ty))
        };
    }

    // ── Aim state (shared between shots.js & input.js) ──
    var aimState = null;

    // ── Ball selection (for deletion) ──
    var selectedBall = null;  // ball number or null

    // ── Pointer tool — created once, handlers in input.js ──
    var pointerTool = new paper.Tool();
    pointerTool.activate();

    // ── Public namespace ──
    return {
        cfg: cfg,
        colors: colors,

        // Layers
        tableLayer: tableLayer,
        shotLayer: shotLayer,
        ballLayer: ballLayer,
        uiLayer: uiLayer,
        qrLayer: qrLayer,

        // Coordinate transforms
        computeLayout: computeLayout,
        T: T,
        T_default: T_default,
        invT: invT,
        invT_default: invT_default,
        S: S,
        clampToPlayingSurface: clampToPlayingSurface,

        // Layout dimensions (getters — computed lazily by computeLayout)
        get totalWidth()  { return totalWidth; },
        get totalHeight() { return totalHeight; },
        get scaleFactor() { return scaleFactor; },

        // State — accessed via getters/setters so modules can share
        get appMode() { return appMode; },
        set appMode(v) { appMode = v; },
        get projectionMode() { return projectionMode; },
        set projectionMode(v) { projectionMode = v; },

        // Ball state
        balls: balls,
        get dragTarget() { return dragTarget; },
        set dragTarget(v) { dragTarget = v; },
        get dragOffset() { return dragOffset; },
        set dragOffset(v) { dragOffset = v; },

        // Aim state
        get aimState() { return aimState; },
        set aimState(v) { aimState = v; },

        // Selected ball
        get selectedBall() { return selectedBall; },
        set selectedBall(v) { selectedBall = v; },

        // Calibration state
        get calibrationCorners() { return calibrationCorners; },
        set calibrationCorners(v) { calibrationCorners = v; },
        get calibrationMatrix() { return calibrationMatrix; },
        set calibrationMatrix(v) { calibrationMatrix = v; },
        get calibrationInverse() { return calibrationInverse; },
        set calibrationInverse(v) { calibrationInverse = v; },
        get calibrationMode() { return calibrationMode; },
        set calibrationMode(v) { calibrationMode = v; },
        calibrationHandles: calibrationHandles,
        get calibrationDragIdx() { return calibrationDragIdx; },
        set calibrationDragIdx(v) { calibrationDragIdx = v; },

        // Pointer tool
        pointerTool: pointerTool
    };
})();

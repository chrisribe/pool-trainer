/* ================================================================
   Pool Trainer — app.js
   Steps 1-5: Table | Balls | Shot lines | Drill save/load | Library
   ================================================================ */

(function () {
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

    // ── App state ──
    var appMode = 'menu';  // 'menu' | 'drill'
    var projectionMode = false;  // true = hide pockets/cushions/rail for projector overlay

    // ── Ball state ──
    // balls[number] = { num, tableX, tableY, group (Paper.js Group) }
    // tableX/tableY are in table-inches (origin = outer rail top-left corner)
    var balls = {};
    var dragTarget = null;   // ball currently being dragged
    var dragOffset = null;   // offset from pointer to ball center at drag start

    // ── Scale / coordinate system ──
    // Everything is drawn in "inches". One unit = 1 inch of table.
    // We compute a scale factor so the table (including rails) fits the viewport
    // with the aspect ratio locked, centered, black letterboxing on surplus space.

    var totalWidth, totalHeight, scaleFactor, origin;

    // ── Calibration state ──
    // 4-corner homography: maps default screen positions → user-adjusted positions
    // Stored as { tl, tr, br, bl } where each is { x, y } in screen pixels
    var calibrationCorners = null;  // null = no calibration (use default T)
    var calibrationMatrix = null;   // 3x3 homography matrix (forward)
    var calibrationInverse = null;  // 3x3 inverse homography matrix
    var calibrationMode = false;    // true = showing drag handles
    var calibrationHandles = [];    // Paper.js items for the 4 drag handles
    var calibrationDragIdx = -1;    // which handle is being dragged (-1 = none)

    function computeLayout() {
        var rail = cfg.railWidth;
        totalWidth  = cfg.playWidth  + rail * 2;   // playing surface + both rails
        totalHeight = cfg.playHeight + rail * 2;

        var vw = paper.view.size.width;
        var vh = paper.view.size.height;

        // Determine orientation: if viewport is wider than tall, table long-axis = horizontal
        var viewRatio = vw / vh;
        var tableRatio = totalWidth / totalHeight;   // < 1 for portrait table

        // We always keep the table with the long axis matching the viewport's long axis
        var drawWidth, drawHeight;
        if (viewRatio >= 1) {
            // landscape viewport → long axis horizontal → swap table axes
            drawWidth  = totalHeight;  // long side
            drawHeight = totalWidth;   // short side
        } else {
            // portrait viewport → long axis vertical (natural orientation)
            drawWidth  = totalWidth;
            drawHeight = totalHeight;
        }

        scaleFactor = Math.min(vw / drawWidth, vh / drawHeight) * 0.95; // 5% margin

        origin = new paper.Point(vw / 2, vh / 2); // center of viewport
    }

    // Helper: convert table-inches point to canvas point (default, no calibration).
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

    // Table-inches → canvas point (with calibration homography if active)
    function T(x, y) {
        var pt = T_default(x, y);
        if (calibrationMatrix) {
            var mapped = applyHomography(calibrationMatrix, pt.x, pt.y);
            return new paper.Point(mapped.x, mapped.y);
        }
        return pt;
    }

    // Scale inches → canvas pixels (scalar)
    function S(inches) {
        return inches * scaleFactor;
    }

    // Inverse transform: canvas point → default screen point (undo calibration)
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

    // Canvas point → table-inches (with calibration inverse if active)
    function invT(canvasPoint) {
        if (calibrationInverse) {
            var unmapped = applyHomography(calibrationInverse, canvasPoint.x, canvasPoint.y);
            return invT_default({ x: unmapped.x, y: unmapped.y });
        }
        return invT_default(canvasPoint);
    }

    // Clamp table position to playing surface bounds (keeps ball fully inside cushions)
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

    // ══════════════════════════════════════════════════════════════
    //  HOMOGRAPHY / CALIBRATION MATH
    // ══════════════════════════════════════════════════════════════

    // Compute 3x3 perspective transform mapping rectangle src[4] → arbitrary quad dst[4]
    // Each point is { x, y }. Order: TL, TR, BR, BL.
    // Returns a flat [a,b,c,d,e,f,g,h,1] array representing the 3x3 matrix:
    //   [ a  b  c ]     [ x' ]     [ a*x + b*y + c ]
    //   [ d  e  f ]  *  [ y' ]  =  [ d*x + e*y + f ]
    //   [ g  h  1 ]     [ 1  ]     [ g*x + h*y + 1 ]
    // Screen output = (col0/col2, col1/col2) after perspective divide.
    function computeHomography(src, dst) {
        // Set up 8x8 system: solve for [a,b,c,d,e,f,g,h]
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

    // Gaussian elimination for 8x8 system
    function solveLinear8(A, B) {
        var n = 8;
        // Augmented matrix
        var M = [];
        for (var i = 0; i < n; i++) {
            M[i] = A[i].slice();
            M[i].push(B[i]);
        }
        // Forward elimination with partial pivoting
        for (var col = 0; col < n; col++) {
            var maxRow = col, maxVal = Math.abs(M[col][col]);
            for (var row = col + 1; row < n; row++) {
                var v = Math.abs(M[row][col]);
                if (v > maxVal) { maxVal = v; maxRow = row; }
            }
            if (maxVal < 1e-12) return null; // singular
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

    // Apply homography: screen point → transformed screen point
    function applyHomography(H, px, py) {
        var w = H[6] * px + H[7] * py + H[8];
        return {
            x: (H[0] * px + H[1] * py + H[2]) / w,
            y: (H[3] * px + H[4] * py + H[5]) / w
        };
    }

    // Invert a 3x3 matrix (stored as flat 9-element array, row-major)
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

    // Get the 4 default screen positions of the playing surface corners (no calibration)
    function getDefaultCorners() {
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        var tl = T_default(rail, rail);
        var tr = T_default(rail + pw, rail);
        var br = T_default(rail + pw, rail + ph);
        var bl = T_default(rail, rail + ph);
        return [
            { x: tl.x, y: tl.y },
            { x: tr.x, y: tr.y },
            { x: br.x, y: br.y },
            { x: bl.x, y: bl.y }
        ];
    }

    // Rebuild the homography matrices from current calibration corners
    function rebuildCalibration() {
        if (!calibrationCorners) {
            calibrationMatrix = null;
            calibrationInverse = null;
            return;
        }
        var src = getDefaultCorners();
        var dst = [
            calibrationCorners.tl, calibrationCorners.tr,
            calibrationCorners.br, calibrationCorners.bl
        ];
        calibrationMatrix = computeHomography(src, dst);
        calibrationInverse = calibrationMatrix ? invert3x3(calibrationMatrix) : null;
    }

    // Save calibration to localStorage
    function saveCalibration() {
        if (calibrationCorners) {
            localStorage.setItem('poolTrainer_calibration', JSON.stringify(calibrationCorners));
        } else {
            localStorage.removeItem('poolTrainer_calibration');
        }
    }

    // Load calibration from localStorage
    function loadCalibration() {
        var saved = localStorage.getItem('poolTrainer_calibration');
        if (saved) {
            try {
                calibrationCorners = JSON.parse(saved);
                rebuildCalibration();
            } catch (e) {
                calibrationCorners = null;
            }
        }
    }

    // ── Drawing ──

    function drawTable() {
        tableLayer.removeChildren();
        tableLayer.activate();
        computeLayout();

        var rail = cfg.railWidth;
        var cush = cfg.cushionWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;

        if (!projectionMode) {
            // 1. Outer rail (dark rectangle, rounded corners)
            var railTL = T(0, 0);
            var railBR = T(totalWidth, totalHeight);
            var railRect = new paper.Path.Rectangle({
                from: railTL,
                to: railBR,
                radius: S(1.5),
                fillColor: colors.rail,
                strokeColor: '#333',
                strokeWidth: S(0.15)
            });

            // 2. Cushions / bumpers — 6 segments between the pockets
            drawCushions(rail, pw, ph);

            // 3. Pockets
            drawPockets(rail, pw, ph);
        } else {
            // Projection mode: thin nose outline for calibration verification
            drawNoseOutline(rail, pw, ph);
        }

        // 4. Diamonds (shown in both modes — useful for alignment check)
        drawDiamonds(rail, pw, ph);

        // 5. Table markings (head string, foot spot, center spot)
        drawMarkings(rail, pw, ph);
    }

    // ── Cushions (bumpers) ──
    // 6 rubber cushion segments between pockets.
    // Each cushion tapers at both ends — the nose (playing-surface edge) is set back
    // from the pocket opening, while the rail face (outer edge) extends closer to
    // the pocket. This creates the angled "mouth" that funnels balls into pockets.
    function drawCushions(rail, pw, ph) {
        var cw = cfg.cushionWidth;        // depth of rubber from rail face to nose
        var col = colors.cushion;

        // Use mouth dimensions for cushion taper (not the larger hole)
        // Corner mouth is diagonal — project onto each rail axis: half-mouth * √2
        var cmAxis = cfg.cornerPocketMouth * 1.0;  // along-rail distance from corner to nose tip
        var sm = cfg.sidePocketMouth;               // side pocket half-mouth (along rail)

        // Nose = cushion tip (playing surface edge), where mouth is measured
        // Rail = outer edge, tighter (cushion extends closer to pocket)
        var cNose = cmAxis;            // corner: nose tip aligns with mouth spec
        var cRail = cmAxis * 0.55;     // corner: rail face, tighter
        var sNose = sm;                // side: nose tip at mouth spec
        var sRail = sm * 0.45;         // side: rail face, tighter

        // Playing surface edges (inner / nose side)
        var left   = rail;
        var right  = rail + pw;
        var top    = rail;
        var bottom = rail + ph;
        var midY   = rail + ph / 2;

        // Rail face edges (outer side of cushion)
        var oLeft   = rail - cw;
        var oRight  = rail + pw + cw;
        var oTop    = rail - cw;
        var oBottom = rail + ph + cw;

        // ── Top short rail (top-left corner ↔ top-right corner) ──
        cushionSegment(
            left  + cRail, oTop,      // outer-left  (rail face, close to pocket)
            right - cRail, oTop,      // outer-right (rail face, close to pocket)
            right - cNose, top,       // inner-right (nose, wider gap)
            left  + cNose, top,       // inner-left  (nose, wider gap)
            col
        );

        // ── Bottom short rail (bottom-left corner ↔ bottom-right corner) ──
        cushionSegment(
            left  + cNose, bottom,    // inner-left (nose)
            right - cNose, bottom,    // inner-right (nose)
            right - cRail, oBottom,   // outer-right (rail face)
            left  + cRail, oBottom,   // outer-left (rail face)
            col
        );

        // ── Left rail, upper half (top-left corner ↔ left side pocket) ──
        cushionSegment(
            oLeft, top  + cRail,      // outer-top (rail face, close to corner pocket)
            left,  top  + cNose,      // inner-top (nose, wider gap)
            left,  midY - sNose,      // inner-bottom (nose, wider gap from side pocket)
            oLeft, midY - sRail,      // outer-bottom (rail face, close to side pocket)
            col
        );

        // ── Left rail, lower half (left side pocket ↔ bottom-left corner) ──
        cushionSegment(
            oLeft, midY   + sRail,    // outer-top (rail face, close to side pocket)
            left,  midY   + sNose,    // inner-top (nose, wider gap)
            left,  bottom - cNose,    // inner-bottom (nose)
            oLeft, bottom - cRail,    // outer-bottom (rail face, close to corner pocket)
            col
        );

        // ── Right rail, upper half (top-right corner ↔ right side pocket) ──
        cushionSegment(
            right,  top  + cNose,     // inner-top (nose)
            oRight, top  + cRail,     // outer-top (rail face)
            oRight, midY - sRail,     // outer-bottom (rail face, close to side pocket)
            right,  midY - sNose,     // inner-bottom (nose)
            col
        );

        // ── Right rail, lower half (right side pocket ↔ bottom-right corner) ──
        cushionSegment(
            right,  midY   + sNose,   // inner-top (nose)
            oRight, midY   + sRail,   // outer-top (rail face)
            oRight, bottom - cRail,   // outer-bottom (rail face)
            right,  bottom - cNose,   // inner-bottom (nose)
            col
        );
    }

    // Draw a single cushion as a filled quadrilateral (4 corners in table-inches)
    function cushionSegment(x1, y1, x2, y2, x3, y3, x4, y4, col) {
        var path = new paper.Path({
            segments: [T(x1, y1), T(x2, y2), T(x3, y3), T(x4, y4)],
            closed: true,
            fillColor: col,
            strokeColor: '#0a9ea3',
            strokeWidth: S(0.15)
        });
    }

    // ── Pockets ──
    function drawPockets(rail, pw, ph) {
        var cr = cfg.cornerPocketRadius;
        var sr = cfg.sidePocketRadius;
        var cShelf = cfg.cornerPocketShelf;
        var sShelf = cfg.sidePocketShelf;

        // Corner pockets: push center diagonally into rail corner by shelf only.
        // The shelf (1"–2.25") is the visible felt between mouth and hole edge.
        // Circle's near edge should sit about at the cushion intersection.
        var cDiag = cShelf * 0.7;  // shelf projected per axis (not shelf+radius!)
        var corners = [
            { x: rail - cDiag,      y: rail - cDiag,      r: cr },
            { x: rail + pw + cDiag, y: rail - cDiag,      r: cr },
            { x: rail - cDiag,      y: rail + ph + cDiag, r: cr },
            { x: rail + pw + cDiag, y: rail + ph + cDiag, r: cr }
        ];

        // Side pockets: shelf is 0"–0.375" — nearly flush.
        // Push center outward by just enough so near edge is at the cushion line.
        var sOffset = sShelf + sr;  // shelf to hole edge + radius to center
        var sides = [
            { x: rail - sOffset,      y: rail + ph / 2, r: sr },
            { x: rail + pw + sOffset, y: rail + ph / 2, r: sr }
        ];

        var allPockets = corners.concat(sides);

        allPockets.forEach(function (p) {
            new paper.Path.Circle({
                center: T(p.x, p.y),
                radius: S(p.r),
                fillColor: colors.pocket,
                strokeColor: colors.cushion,
                strokeWidth: S(0.2)
            });
        });
    }

    // ── Nose outline (projection mode) ──
    // Thin dashed rectangle at the cushion nose edge (inner playing surface boundary)
    // Used for calibration verification — if this line sits on the physical cushion nose,
    // the projection is aligned correctly.
    function drawNoseOutline(rail, pw, ph) {
        var tl = T(rail, rail);
        var tr = T(rail + pw, rail);
        var bl = T(rail, rail + ph);
        var br = T(rail + pw, rail + ph);
        new paper.Path({
            segments: [tl, tr, br, bl],
            closed: true,
            strokeColor: 'rgba(255,255,255,0.35)',
            strokeWidth: S(0.1),
            dashArray: [S(0.6), S(0.4)],
            fillColor: null
        });
    }

    // ── Diamonds / Sights (WPA Section 6) ──
    // 18 sights, center 3 11/16" from cushion nose (into the wooden rail)
    function drawDiamonds(rail, pw, ph) {
        var r = cfg.diamondRadius;
        var sightDist = cfg.sightDistFromNose || 3.6875;
        // Sight sits sightDist outward from cushion nose, in the wooden rail
        var offset = rail - sightDist;

        // Long rails (left & right): 7 diamonds each, skip side pocket position
        var longSpacing = ph / 8;
        for (var i = 1; i <= 7; i++) {
            if (i === 4) continue; // skip side pocket position
            var y = rail + i * longSpacing;
            // left rail
            diamond(T(offset, y), r);
            // right rail
            diamond(T(rail + pw + (rail - offset), y), r);
        }

        // Short rails (top & bottom): 3 diamonds each
        var shortSpacing = pw / 4;
        for (var j = 1; j <= 3; j++) {
            var x = rail + j * shortSpacing;
            // top rail
            diamond(T(x, offset), r);
            // bottom rail
            diamond(T(x, rail + ph + (rail - offset)), r);
        }
    }

    function diamond(center, r) {
        new paper.Path.Circle({
            center: center,
            radius: S(r),
            fillColor: colors.diamond
        });
    }

    // ── Table markings ──
    function drawMarkings(rail, pw, ph) {
        var col = colors.tableLine;
        var sw = S(0.15);

        // Head string: line across the table at 1/4 of playing height from the "head" (bottom)
        var headY = rail + ph * 0.75;
        new paper.Path.Line({
            from: T(rail, headY),
            to: T(rail + pw, headY),
            strokeColor: col,
            strokeWidth: sw,
            dashArray: [S(1), S(1)]
        });

        // Foot spot: dot at 1/4 from the top (foot end)
        var footSpotY = rail + ph * 0.25;
        new paper.Path.Circle({
            center: T(rail + pw / 2, footSpotY),
            radius: S(0.4),
            fillColor: col
        });

        // Head spot: dot at head string center
        new paper.Path.Circle({
            center: T(rail + pw / 2, headY),
            radius: S(0.4),
            fillColor: col
        });

        // Center spot
        new paper.Path.Circle({
            center: T(rail + pw / 2, rail + ph / 2),
            radius: S(0.4),
            fillColor: col
        });

        // Long string (center line, very subtle)
        new paper.Path.Line({
            from: T(rail + pw / 2, rail),
            to: T(rail + pw / 2, rail + ph),
            strokeColor: 'rgba(255,255,255,0.06)',
            strokeWidth: sw
        });
    }

    // ── Fullscreen helper ──
    function enterFullscreen() {
        var el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }

    // Double-tap or press F to toggle fullscreen
    document.addEventListener('keydown', function (e) {
        if (e.key === 'f' || e.key === 'F') enterFullscreen();
    });

    // ── Resize handling ──
    paper.view.onResize = function () {
        rebuildCalibration();
        drawTable();
        redrawBalls();
        clearShotLines();
        if (calibrationMode) drawCalibrationHandles();
        if (appMode === 'menu') showMenu();
        else if (appMode === 'drillList') showMenu(); // reset to menu on resize
        else if (appMode === 'drill' && activeDrills) showDrillHUD();
    };

    // ══════════════════════════════════════════════════════════════
    //  BALL PLACEMENT (Step 2)
    // ══════════════════════════════════════════════════════════════

    // Create a Paper.js Group for a single ball at table position (tx, ty)
    function createBallGroup(num, tx, ty) {
        var bc = cfg.ballColors[num];
        var r  = cfg.ballRadius;
        var center = T(tx, ty);
        var sr = S(r);

        ballLayer.activate();

        var items = [];

        if (bc.stripe) {
            // Stripe ball: white body + colored band + white circle center
            var body = new paper.Path.Circle({ center: center, radius: sr, fillColor: '#ffffff' });
            // Colored band (slightly smaller circle behind label area)
            var band = new paper.Path.Circle({ center: center, radius: sr * 0.92, fillColor: bc.fill });
            // White center disc for number
            var disc = new paper.Path.Circle({ center: center, radius: sr * 0.52, fillColor: '#ffffff' });
            items.push(body, band, disc);
        } else {
            // Solid ball (or cue ball)
            var solid = new paper.Path.Circle({ center: center, radius: sr, fillColor: bc.fill });
            items.push(solid);
            // White center disc for number (not on cue ball)
            if (num !== 0) {
                var disc2 = new paper.Path.Circle({ center: center, radius: sr * 0.45, fillColor: '#ffffff' });
                items.push(disc2);
            }
        }

        // Outline for visibility on black background
        var outline = new paper.Path.Circle({
            center: center,
            radius: sr,
            strokeColor: 'rgba(255,255,255,0.6)',
            strokeWidth: Math.max(1, sr * 0.08),
            fillColor: null
        });
        items.push(outline);

        // Number label
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

    // Place or move a ball on the table
    function placeBall(num, tx, ty) {
        var clamped = clampToPlayingSurface(tx, ty);
        if (balls[num]) {
            // Update position
            balls[num].tableX = clamped.x;
            balls[num].tableY = clamped.y;
            // Rebuild visual at new position
            if (balls[num].group) balls[num].group.remove();
            balls[num].group = createBallGroup(num, clamped.x, clamped.y);
        } else {
            // New ball
            var group = createBallGroup(num, clamped.x, clamped.y);
            balls[num] = { num: num, tableX: clamped.x, tableY: clamped.y, group: group };
        }
    }

    // Remove a ball from the table
    function removeBall(num) {
        if (balls[num]) {
            if (balls[num].group) balls[num].group.remove();
            delete balls[num];
        }
    }

    // Remove all balls
    function clearBalls() {
        Object.keys(balls).forEach(function (k) { removeBall(+k); });
    }

    // Redraw all balls at current table positions (called after resize)
    function redrawBalls() {
        ballLayer.removeChildren();
        ballLayer.activate();
        Object.keys(balls).forEach(function (k) {
            var b = balls[+k];
            b.group = createBallGroup(b.num, b.tableX, b.tableY);
        });
    }

    // ── Rack templates ──

    function rack9Ball() {
        clearBalls();
        clearShotLines();
        aimState = null;
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        var r  = cfg.ballRadius;
        var cx = rail + pw / 2;
        var footSpot = rail + ph * 0.25;
        var d = r * 2.05; // ball diameter + small gap

        // 9-ball diamond: rows of 1-2-3-2-1
        //   row 0 (front, on foot spot): 1 ball
        //   row 1: 2 balls
        //   row 2: 3 balls (9-ball in center)
        //   row 3: 2 balls
        //   row 4 (back): 1 ball
        var layout = [
            // [row, col-offset, ball-number]
            [0,  0,   1],
            [1, -0.5, 2],  [1,  0.5, 3],
            [2, -1,   4],  [2,  0,   9],  [2,  1, 5],
            [3, -0.5, 6],  [3,  0.5, 7],
            [4,  0,   8]
        ];

        var rowH = d * Math.sqrt(3) / 2; // vertical distance between rows

        layout.forEach(function (entry) {
            var row = entry[0], col = entry[1], num = entry[2];
            var bx = cx + col * d;
            var by = footSpot - row * rowH; // rack towards foot (top of table)
            placeBall(num, bx, by);
        });

        // Cue ball on head spot
        placeBall(0, cx, rail + ph * 0.75);
    }

    function rack8Ball() {
        clearBalls();
        clearShotLines();
        aimState = null;
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        var r  = cfg.ballRadius;
        var cx = rail + pw / 2;
        var footSpot = rail + ph * 0.25;
        var d = r * 2.05;

        // 8-ball triangle: 5 rows (1-2-3-4-5 = 15 balls)
        // 8-ball must be in center of row 2 (3rd row). Corners of last row:
        // one solid, one stripe. Rest randomized per BCA rules.
        // For a clean default: deterministic layout.
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

    // ══════════════════════════════════════════════════════════════
    //  SHOT VISUALIZATION (Step 3)
    // ══════════════════════════════════════════════════════════════

    var aimState = null;  // { aiming: true } while dragging from cue ball

    function clearShotLines() {
        shotLayer.removeChildren();
    }

    // Hit test: find a ball under the canvas point
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

    // Get all pocket target points (center of each pocket opening at cushion line)
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

    // Find the first object ball the aim line intersects
    // Returns { ball, hitPoint, distance } or null
    function findTargetBall(cueTx, cueTy, aimDx, aimDy) {
        var r = cfg.ballRadius;
        var contactDist = r * 2;  // center-to-center at contact
        var best = null;

        Object.keys(balls).forEach(function (k) {
            var b = balls[+k];
            if (b.num === 0) return; // skip cue ball

            // Vector from cue ball to this ball
            var dx = b.tableX - cueTx;
            var dy = b.tableY - cueTy;

            // Project onto aim direction
            var aimLen = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
            if (aimLen < 0.001) return;
            var nx = aimDx / aimLen;
            var ny = aimDy / aimLen;

            var proj = dx * nx + dy * ny;
            if (proj <= 0) return; // ball is behind aim direction

            // Perpendicular distance from aim line to ball center
            var perpX = dx - proj * nx;
            var perpY = dy - proj * ny;
            var perp = Math.sqrt(perpX * perpX + perpY * perpY);

            if (perp > contactDist) return; // aim line misses this ball

            // Distance along aim line to contact point
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

    // Find best pocket for an object ball given the cut direction
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

            // Angle between object ball direction and pocket direction
            var dot = nx * pnx + ny * pny;
            var angle = Math.acos(Math.max(-1, Math.min(1, dot)));

            if (angle < bestAngle) {
                bestAngle = angle;
                best = { pocket: p, distance: pLen, angle: angle };
            }
        });

        // Only return if pocket is within ~90° of the ball's path
        return (best && best.angle < Math.PI / 2) ? best : null;
    }

    // Draw an arrowhead at the end of a line (screen coords)
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

    // Draw the shot visualization
    function drawShotLines(cueTx, cueTy, aimTx, aimTy) {
        clearShotLines();
        shotLayer.activate();

        var aimDx = aimTx - cueTx;
        var aimDy = aimTy - cueTy;
        var aimLen = Math.sqrt(aimDx * aimDx + aimDy * aimDy);
        if (aimLen < 0.1) return;

        var nx = aimDx / aimLen;
        var ny = aimDy / aimLen;

        // 1. Find target ball
        var target = findTargetBall(cueTx, cueTy, aimDx, aimDy);

        if (!target) {
            // No ball hit — just draw aim line to rail
            var extLen = 200; // far enough to hit any rail
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
            return;
        }

        // 2. Aim line: cue ball → ghost ball position (contact point)
        var aimFrom = T(cueTx, cueTy);
        var aimTo = T(target.hitX, target.hitY);
        new paper.Path.Line({
            from: aimFrom,
            to: aimTo,
            strokeColor: colors.aimLine,
            strokeWidth: S(0.12)
        });
        drawArrowhead(aimFrom, aimTo, colors.aimLine, S(0.12));

        // 3. Ghost ball at contact point
        new paper.Path.Circle({
            center: T(target.hitX, target.hitY),
            radius: S(cfg.ballRadius),
            strokeColor: 'rgba(255,255,255,0.5)',
            strokeWidth: S(0.1),
            dashArray: [S(0.3), S(0.3)],
            fillColor: null
        });

        // 4. Object ball direction: from object ball center, pushed by contact
        var objBall = target.ball;
        var objDx = objBall.tableX - target.hitX;
        var objDy = objBall.tableY - target.hitY;
        var objLen = Math.sqrt(objDx * objDx + objDy * objDy);
        if (objLen < 0.001) {
            // Straight-on hit → object ball goes in aim direction
            objDx = nx;
            objDy = ny;
        } else {
            objDx /= objLen;
            objDy /= objLen;
        }

        // Find best pocket for object ball path
        var pocketHit = findBestPocket(objBall.tableX, objBall.tableY, objDx, objDy);

        // OB deflection line — extends through ball (behind + forward) with arrow
        var deflLen = 15;
        var behindLen = 3; // extend behind the ball so player sees where to hit
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
            // Pocket line — green path from object ball to pocket
            new paper.Path.Line({
                from: T(objBall.tableX, objBall.tableY),
                to: T(pocketHit.pocket.x, pocketHit.pocket.y),
                strokeColor: colors.pocketPath,
                strokeWidth: S(0.15)
            });

            // Small circle at pocket to mark target
            new paper.Path.Circle({
                center: T(pocketHit.pocket.x, pocketHit.pocket.y),
                radius: S(0.5),
                strokeColor: colors.pocketPath,
                strokeWidth: S(0.12),
                fillColor: null
            });
        } else {
            // No good pocket — extend the deflection further (dashed)
            var extObjLen = 40;
            new paper.Path.Line({
                from: T(objBall.tableX + objDx * deflLen, objBall.tableY + objDy * deflLen),
                to: T(objBall.tableX + objDx * extObjLen, objBall.tableY + objDy * extObjLen),
                strokeColor: colors.objBallPath,
                strokeWidth: S(0.12),
                dashArray: [S(0.4), S(0.4)]
            });
        }

        // 5. Cue ball path after contact (deflection)
        // For center-ball hit (no english), cue ball deflects at 90° to the
        // object ball direction (the "tangent line" / "90° rule")
        var cueDx, cueDy;
        // Check cut angle — nearly straight shots (< 5°) mean cue ball stops
        var cutDot = nx * objDx + ny * objDy;
        var isNearlyStraight = cutDot > 0.996; // cos(5°) ≈ 0.996
        if (objLen < 0.001 || isNearlyStraight) {
            // Dead/near-straight shot — cue ball stops (stun)
            cueDx = 0;
            cueDy = 0;
        } else {
            // 90° to object ball direction (perpendicular, preserving cue ball's forward momentum side)
            cueDx = -objDy;
            cueDy = objDx;

            // Pick the correct perpendicular direction (same side as cue's original momentum)
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

        // 6. Cut angle indicator text
        // Angle between aim direction and cue-to-object-ball line
        var cutAngle = Math.acos(Math.max(-1, Math.min(1, nx * objDx + ny * objDy)));
        var cutDeg = Math.round(cutAngle * 180 / Math.PI);

        // Place label near the contact point, offset slightly
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

    // ══════════════════════════════════════════════════════════════
    //  DRILL SAVE/LOAD (Step 4)
    // ══════════════════════════════════════════════════════════════

    // Pointer tool — created once, handlers assigned later in Step 5
    var pointerTool = new paper.Tool();
    pointerTool.activate();

    // Serialize current ball layout to a drill object
    function serializeDrill(name, description, difficulty) {
        var ballList = [];
        Object.keys(balls).forEach(function (k) {
            var b = balls[+k];
            ballList.push({
                num: b.num,
                x: Math.round((b.tableX - cfg.railWidth) * 100) / 100,
                y: Math.round((b.tableY - cfg.railWidth) * 100) / 100
            });
        });
        return {
            name: name || 'Untitled Drill',
            description: description || '',
            difficulty: difficulty || 1,
            balls: ballList
        };
    }

    // Load a drill object onto the table
    function loadDrill(drill) {
        clearBalls();
        clearShotLines();
        var rail = cfg.railWidth;
        drill.balls.forEach(function (b) {
            placeBall(b.num, rail + b.x, rail + b.y);
        });

        // Auto-show aim line: use explicit aimLine, or compute proper aim
        // through the ghost ball position that pots the first object ball
        var cue = balls[0];
        if (!cue) return;

        if (drill.aimLine) {
            drawShotLines(cue.tableX, cue.tableY, rail + drill.aimLine.x, rail + drill.aimLine.y);
        } else {
            // Find first object ball
            var ob = null;
            for (var i = 0; i < drill.balls.length; i++) {
                if (drill.balls[i].num !== 0) {
                    ob = balls[drill.balls[i].num];
                    break;
                }
            }
            if (!ob) return;

            // Find the best pocket for this object ball from the cue ball's perspective
            var cueToBallDx = ob.tableX - cue.tableX;
            var cueToBallDy = ob.tableY - cue.tableY;
            var pocket = findBestPocket(ob.tableX, ob.tableY, cueToBallDx, cueToBallDy);

            if (pocket) {
                // Compute ghost ball position: offset from object ball, opposite the pocket direction
                var pDx = pocket.pocket.x - ob.tableX;
                var pDy = pocket.pocket.y - ob.tableY;
                var pLen = Math.sqrt(pDx * pDx + pDy * pDy);
                var r2 = cfg.ballRadius * 2;
                var ghostX = ob.tableX - (pDx / pLen) * r2;
                var ghostY = ob.tableY - (pDy / pLen) * r2;
                drawShotLines(cue.tableX, cue.tableY, ghostX, ghostY);
            } else {
                // No good pocket — just aim at the ball center
                drawShotLines(cue.tableX, cue.tableY, ob.tableX, ob.tableY);
            }
        }

        // Draw cue ball target (ideal landing zone) if specified
        if (drill.cueTarget) {
            var tx = rail + drill.cueTarget.x;
            var ty = rail + drill.cueTarget.y;
            shotLayer.activate();

            // Outer ring
            new paper.Path.Circle({
                center: T(tx, ty),
                radius: S(2.5),
                strokeColor: 'rgba(0,229,255,0.25)',
                strokeWidth: S(0.08),
                fillColor: null
            });
            // Middle ring
            new paper.Path.Circle({
                center: T(tx, ty),
                radius: S(1.5),
                strokeColor: 'rgba(0,229,255,0.35)',
                strokeWidth: S(0.08),
                fillColor: null
            });
            // Inner ring (bullseye)
            new paper.Path.Circle({
                center: T(tx, ty),
                radius: S(0.6),
                strokeColor: 'rgba(0,229,255,0.5)',
                strokeWidth: S(0.1),
                fillColor: 'rgba(0,229,255,0.12)'
            });
            // Crosshair lines
            var chSize = S(3.2);
            var cp = T(tx, ty);
            new paper.Path.Line({
                from: new paper.Point(cp.x - chSize, cp.y),
                to: new paper.Point(cp.x + chSize, cp.y),
                strokeColor: 'rgba(0,229,255,0.2)',
                strokeWidth: S(0.06)
            });
            new paper.Path.Line({
                from: new paper.Point(cp.x, cp.y - chSize),
                to: new paper.Point(cp.x, cp.y + chSize),
                strokeColor: 'rgba(0,229,255,0.2)',
                strokeWidth: S(0.06)
            });
        }
    }

    // Download current layout as JSON
    function exportDrill() {
        var drill = serializeDrill('Custom Drill', '', 1);
        var json = JSON.stringify(drill, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'drill.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ══════════════════════════════════════════════════════════════
    //  DRILL LIBRARY & MENU UI (Step 5)
    // ══════════════════════════════════════════════════════════════

    var drillCache = {};       // category id → array of drills
    var activeDrills = null;   // currently loaded drill array
    var activeDrillIdx = 0;    // current drill index within the set
    var activeCategory = null; // current category name
    var drillListPage = 0;     // current page in drill list
    var drillListCatId = null; // current category id in drill list

    // Fetch a drill JSON file (with cache)
    function fetchDrills(catalogEntry, callback) {
        if (drillCache[catalogEntry.id]) {
            callback(drillCache[catalogEntry.id]);
            return;
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', catalogEntry.file, true);
        xhr.onload = function () {
            if (xhr.status === 200) {
                var data = JSON.parse(xhr.responseText);
                drillCache[catalogEntry.id] = data;
                callback(data);
            }
        };
        xhr.send();
    }

    // ── Menu rendering (projected on table) ──

    // Get the screen bounding box of the playing surface
    function getFeltBounds() {
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;
        var c1 = T(rail, rail);
        var c2 = T(rail + pw, rail + ph);
        return {
            left:   Math.min(c1.x, c2.x),
            right:  Math.max(c1.x, c2.x),
            top:    Math.min(c1.y, c2.y),
            bottom: Math.max(c1.y, c2.y)
        };
    }

    function showMenu() {
        appMode = 'menu';
        clearBalls();
        clearShotLines();
        uiLayer.removeChildren();
        uiLayer.activate();

        var fb = getFeltBounds();
        var fw = fb.right - fb.left;
        var fh = fb.bottom - fb.top;
        var cx = (fb.left + fb.right) / 2;

        // Title
        new paper.PointText({
            point: new paper.Point(cx, fb.top + fh * 0.1),
            content: 'POOL TRAINER',
            fillColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: Math.min(fw, fh) * 0.06,
            justification: 'center'
        });

        // Subtitle
        new paper.PointText({
            point: new paper.Point(cx, fb.top + fh * 0.16),
            content: 'Select a drill category',
            fillColor: 'rgba(255,255,255,0.5)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.min(fw, fh) * 0.025,
            justification: 'center'
        });

        // Category buttons
        var catalog = (typeof DRILL_CATALOG !== 'undefined') ? DRILL_CATALOG : [];
        var btnW = Math.min(fw * 0.6, 400);
        var btnH = Math.min(fh * 0.07, 50);
        var gap = btnH * 0.35;
        var startY = fb.top + fh * 0.24;

        catalog.forEach(function (cat, i) {
            var y = startY + i * (btnH + gap);

            var btn = new paper.Path.Rectangle({
                from: new paper.Point(cx - btnW / 2, y),
                to: new paper.Point(cx + btnW / 2, y + btnH),
                radius: 8,
                fillColor: 'rgba(255,255,255,0.08)',
                strokeColor: 'rgba(255,255,255,0.3)',
                strokeWidth: 1
            });
            btn.data = { action: 'category', categoryId: cat.id };

            var label = new paper.PointText({
                point: new paper.Point(cx, y + btnH * 0.65),
                content: cat.icon + '  ' + cat.name,
                fillColor: '#ffffff',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: btnH * 0.4,
                justification: 'center'
            });
            label.data = { action: 'category', categoryId: cat.id };
        });

        // Free play button
        var fpY = startY + catalog.length * (btnH + gap) + gap;
        var fpBtn = new paper.Path.Rectangle({
            from: new paper.Point(cx - btnW / 2, fpY),
            to: new paper.Point(cx + btnW / 2, fpY + btnH),
            radius: 8,
            fillColor: 'rgba(0,229,255,0.1)',
            strokeColor: 'rgba(0,229,255,0.4)',
            strokeWidth: 1
        });
        fpBtn.data = { action: 'freeplay' };

        new paper.PointText({
            point: new paper.Point(cx, fpY + btnH * 0.65),
            content: '🎱  Free Play',
            fillColor: '#00e5ff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: btnH * 0.4,
            justification: 'center'
        }).data = { action: 'freeplay' };

        // Keyboard hint
        new paper.PointText({
            point: new paper.Point(cx, fb.bottom - fh * 0.03),
            content: 'Press F for fullscreen',
            fillColor: 'rgba(255,255,255,0.25)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.min(fw, fh) * 0.02,
            justification: 'center'
        });
    }

    // Show drill list for a category (with pagination)
    function showDrillList(categoryId, page) {
        var cat = null;
        var catalog = (typeof DRILL_CATALOG !== 'undefined') ? DRILL_CATALOG : [];
        for (var i = 0; i < catalog.length; i++) {
            if (catalog[i].id === categoryId) { cat = catalog[i]; break; }
        }
        if (!cat) return;

        fetchDrills(cat, function (drills) {
            activeCategory = cat.name;
            activeDrills = drills;
            activeDrillIdx = 0;
            drillListCatId = categoryId;
            drillListPage = page || 0;

            uiLayer.removeChildren();
            uiLayer.activate();

            var fb = getFeltBounds();
            var fw = fb.right - fb.left;
            var fh = fb.bottom - fb.top;
            var cx = (fb.left + fb.right) / 2;

            // Title
            var titleH = fh * 0.1;
            new paper.PointText({
                point: new paper.Point(cx, fb.top + titleH),
                content: cat.icon + ' ' + cat.name,
                fillColor: '#ffffff',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: Math.min(fw, fh) * 0.04,
                justification: 'center'
            });

            var btnW = Math.min(fw * 0.65, 450);
            var btnH = Math.min(fh * 0.06, 44);
            var gap = btnH * 0.25;
            var listTop = fb.top + titleH + fh * 0.04;
            // Reserve space for back button + nav at bottom
            var listBottom = fb.bottom - fh * 0.12;
            var available = listBottom - listTop;
            var itemH = btnH + gap;
            var perPage = Math.max(1, Math.floor(available / itemH));
            var totalPages = Math.ceil(drills.length / perPage);
            var pg = Math.min(drillListPage, totalPages - 1);
            var startIdx = pg * perPage;
            var endIdx = Math.min(startIdx + perPage, drills.length);

            for (var j = startIdx; j < endIdx; j++) {
                var drill = drills[j];
                var row = j - startIdx;
                var y = listTop + row * itemH;

                var stars = '';
                for (var s = 0; s < 5; s++) stars += s < drill.difficulty ? '★' : '☆';

                var btn = new paper.Path.Rectangle({
                    from: new paper.Point(cx - btnW / 2, y),
                    to: new paper.Point(cx + btnW / 2, y + btnH),
                    radius: 6,
                    fillColor: 'rgba(255,255,255,0.06)',
                    strokeColor: 'rgba(255,255,255,0.2)',
                    strokeWidth: 1
                });
                btn.data = { action: 'loadDrill', drillIdx: j };

                new paper.PointText({
                    point: new paper.Point(cx - btnW * 0.42, y + btnH * 0.65),
                    content: drill.name,
                    fillColor: '#ffffff',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.36,
                    justification: 'left'
                }).data = { action: 'loadDrill', drillIdx: j };

                new paper.PointText({
                    point: new paper.Point(cx + btnW * 0.42, y + btnH * 0.65),
                    content: stars,
                    fillColor: '#ffee00',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.3,
                    justification: 'right'
                }).data = { action: 'loadDrill', drillIdx: j };
            }

            // Bottom row: [Back]  [◀ page ▶]
            var botY = fb.bottom - fh * 0.08;
            var navBtnW = btnH * 1.2;  // square-ish nav buttons
            var backW = btnW * 0.3;

            // Back button (far left)
            var bkL = cx - btnW / 2;
            var backBtn = new paper.Path.Rectangle({
                from: new paper.Point(bkL, botY),
                to: new paper.Point(bkL + backW, botY + btnH),
                radius: 6,
                fillColor: 'rgba(255,255,255,0.04)',
                strokeColor: 'rgba(255,255,255,0.2)',
                strokeWidth: 1
            });
            backBtn.data = { action: 'backToMenu' };

            new paper.PointText({
                point: new paper.Point(bkL + backW / 2, botY + btnH * 0.65),
                content: '← Back',
                fillColor: 'rgba(255,255,255,0.6)',
                fontFamily: 'Arial, sans-serif',
                fontSize: btnH * 0.34,
                justification: 'center'
            }).data = { action: 'backToMenu' };

            // Page nav (right-aligned): [◀] [1/2] [▶]
            if (totalPages > 1) {
                var navR = cx + btnW / 2;   // right edge
                var pgTextW = btnH * 1.8;   // space for "1 / 2"

                // ▶ Next (rightmost)
                if (pg < totalPages - 1) {
                    var nxL = navR - navBtnW;
                    var nextBtn = new paper.Path.Rectangle({
                        from: new paper.Point(nxL, botY),
                        to: new paper.Point(navR, botY + btnH),
                        radius: 6,
                        fillColor: 'rgba(255,255,255,0.04)',
                        strokeColor: 'rgba(255,255,255,0.2)',
                        strokeWidth: 1
                    });
                    nextBtn.data = { action: 'nextPage' };
                    new paper.PointText({
                        point: new paper.Point(nxL + navBtnW / 2, botY + btnH * 0.65),
                        content: '▶',
                        fillColor: 'rgba(255,255,255,0.6)',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.4,
                        justification: 'center'
                    }).data = { action: 'nextPage' };
                }

                // Page text (center-right)
                var pgX = navR - navBtnW - pgTextW / 2;
                new paper.PointText({
                    point: new paper.Point(pgX, botY + btnH * 0.65),
                    content: (pg + 1) + ' / ' + totalPages,
                    fillColor: 'rgba(255,255,255,0.4)',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.32,
                    justification: 'center'
                });

                // ◀ Prev (left of page text)
                if (pg > 0) {
                    var pvL = navR - navBtnW - pgTextW - navBtnW;
                    var prevBtn = new paper.Path.Rectangle({
                        from: new paper.Point(pvL, botY),
                        to: new paper.Point(pvL + navBtnW, botY + btnH),
                        radius: 6,
                        fillColor: 'rgba(255,255,255,0.04)',
                        strokeColor: 'rgba(255,255,255,0.2)',
                        strokeWidth: 1
                    });
                    prevBtn.data = { action: 'prevPage' };
                    new paper.PointText({
                        point: new paper.Point(pvL + navBtnW / 2, botY + btnH * 0.65),
                        content: '◀',
                        fillColor: 'rgba(255,255,255,0.6)',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.4,
                        justification: 'center'
                    }).data = { action: 'prevPage' };
                }
            }
        });
    }

    // ── Drill HUD (shown during drill mode) ──

    function showDrillHUD() {
        uiLayer.removeChildren();
        uiLayer.activate();

        if (!activeDrills || !activeDrills[activeDrillIdx]) return;
        var drill = activeDrills[activeDrillIdx];
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;

        // Get the screen bounding box of the playing surface
        var c1 = T(rail, rail);
        var c2 = T(rail + pw, rail + ph);
        var sL = Math.min(c1.x, c2.x);     // screen left
        var sR = Math.max(c1.x, c2.x);     // screen right
        var sT = Math.min(c1.y, c2.y);     // screen top
        var sB = Math.max(c1.y, c2.y);     // screen bottom
        var margin = S(2);
        var fs = S(1.4);

        // Drill name — screen top-left of felt
        new paper.PointText({
            point: new paper.Point(sL + margin, sT + margin + fs),
            content: drill.name,
            fillColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: fs * 1.1,
            justification: 'left'
        });

        // Description — below name
        if (drill.description) {
            new paper.PointText({
                point: new paper.Point(sL + margin, sT + margin + fs * 2.8),
                content: drill.description,
                fillColor: 'rgba(255,255,255,0.4)',
                fontFamily: 'Arial, sans-serif',
                fontSize: fs * 0.65,
                justification: 'left'
            });
        }

        // Step counter — screen top-right of felt
        new paper.PointText({
            point: new paper.Point(sR - margin, sT + margin + fs),
            content: (activeDrillIdx + 1) + ' / ' + activeDrills.length,
            fillColor: 'rgba(255,255,255,0.6)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: fs * 1.0,
            justification: 'right'
        });

        // Category name — below counter
        if (activeCategory) {
            new paper.PointText({
                point: new paper.Point(sR - margin, sT + margin + fs * 2.5),
                content: activeCategory,
                fillColor: 'rgba(255,255,255,0.3)',
                fontFamily: 'Arial, sans-serif',
                fontSize: fs * 0.6,
                justification: 'right'
            });
        }

        // Difficulty stars — below category
        var stars = '';
        for (var s = 0; s < 5; s++) stars += s < drill.difficulty ? '★' : '☆';
        new paper.PointText({
            point: new paper.Point(sR - margin, sT + margin + fs * 3.8),
            content: stars,
            fillColor: '#ffee00',
            fontFamily: 'Arial, sans-serif',
            fontSize: fs * 0.65,
            justification: 'right'
        });

        // Navigation hints — screen bottom-center of felt
        new paper.PointText({
            point: new paper.Point((sL + sR) / 2, sB - margin),
            content: '→ Next    ← Prev    M Menu',
            fillColor: 'rgba(255,255,255,0.2)',
            fontFamily: 'Arial, sans-serif',
            fontSize: fs * 0.55,
            justification: 'center'
        });
    }

    // ── Drill navigation ──

    function startDrill(idx) {
        appMode = 'drill';
        activeDrillIdx = idx;
        loadDrill(activeDrills[idx]);
        showDrillHUD();
    }

    function nextDrill() {
        if (!activeDrills) return;
        if (activeDrillIdx < activeDrills.length - 1) {
            startDrill(activeDrillIdx + 1);
        }
    }

    function prevDrill() {
        if (!activeDrills) return;
        if (activeDrillIdx > 0) {
            startDrill(activeDrillIdx - 1);
        }
    }

    // ── UI hit testing ──

    function hitUI(canvasPoint) {
        var hits = uiLayer.hitTestAll(canvasPoint, { fill: true, stroke: true, tolerance: 5 });
        for (var i = 0; i < hits.length; i++) {
            var item = hits[i].item;
            while (item && !item.data.action) { item = item.parent; }
            if (item && item.data.action) return item.data;
        }
        return null;
    }

    // ══════════════════════════════════════════════════════════════
    //  CALIBRATION UI (Step 6)
    // ══════════════════════════════════════════════════════════════

    var calibLayer = new paper.Layer({ name: 'calibration' });
    calibLayer.visible = false;

    function enterCalibrationMode() {
        calibrationMode = true;
        calibLayer.visible = true;
        calibLayer.activate();
        calibLayer.removeChildren();

        // Initialize corners from saved calibration or defaults
        if (!calibrationCorners) {
            var def = getDefaultCorners();
            calibrationCorners = { tl: def[0], tr: def[1], br: def[2], bl: def[3] };
        }

        drawCalibrationHandles();
    }

    function exitCalibrationMode(save) {
        calibrationMode = false;
        calibLayer.visible = false;
        calibLayer.removeChildren();
        calibrationHandles = [];
        calibrationDragIdx = -1;

        if (save) {
            rebuildCalibration();
            saveCalibration();
            // Redraw everything with new calibration
            drawTable();
            redrawBalls();
        }
    }

    function resetCalibration() {
        calibrationCorners = null;
        calibrationMatrix = null;
        calibrationInverse = null;
        saveCalibration();
        if (calibrationMode) exitCalibrationMode(false);
        drawTable();
        redrawBalls();
    }

    function drawCalibrationHandles() {
        calibLayer.removeChildren();
        calibLayer.activate();
        calibrationHandles = [];

        var corners = [
            calibrationCorners.tl, calibrationCorners.tr,
            calibrationCorners.br, calibrationCorners.bl
        ];
        var labels = ['TL', 'TR', 'BR', 'BL'];
        var handleRadius = 14;

        // Draw connecting lines between corners
        var linePath = new paper.Path({
            segments: corners.map(function (c) { return new paper.Point(c.x, c.y); }),
            closed: true,
            strokeColor: 'rgba(255,100,0,0.6)',
            strokeWidth: 2,
            dashArray: [8, 4],
            fillColor: null
        });

        // Draw each handle
        for (var i = 0; i < 4; i++) {
            var c = corners[i];
            var group = new paper.Group();

            // Outer circle
            var circle = new paper.Path.Circle({
                center: new paper.Point(c.x, c.y),
                radius: handleRadius,
                fillColor: 'rgba(255,100,0,0.7)',
                strokeColor: '#ffffff',
                strokeWidth: 2
            });

            // Crosshair
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

            // Label
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
            calibrationHandles.push({ idx: i, center: c });
        }

        // Instructions text — placed on the table surface (center of playing area)
        var rail = cfg.railWidth;
        var textPos = T_default(rail + cfg.playWidth / 2, rail + cfg.playHeight / 2);
        new paper.PointText({
            point: textPos,
            content: 'CALIBRATION',
            fillColor: 'rgba(255,100,0,0.9)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: S(2),
            justification: 'center'
        });
        new paper.PointText({
            point: new paper.Point(textPos.x, textPos.y + S(2.5)),
            content: 'Drag corners to match table',
            fillColor: 'rgba(255,100,0,0.7)',
            fontFamily: 'Arial, sans-serif',
            fontSize: S(1.2),
            justification: 'center'
        });
        new paper.PointText({
            point: new paper.Point(textPos.x, textPos.y + S(4.5)),
            content: 'K = save    Shift+K = reset',
            fillColor: 'rgba(255,100,0,0.5)',
            fontFamily: 'Arial, sans-serif',
            fontSize: S(1),
            justification: 'center'
        });
    }

    // Hit test calibration handles
    function hitCalibrationHandle(canvasPoint) {
        var threshold = 20;
        var corners = [
            calibrationCorners.tl, calibrationCorners.tr,
            calibrationCorners.br, calibrationCorners.bl
        ];
        for (var i = 0; i < 4; i++) {
            var dx = canvasPoint.x - corners[i].x;
            var dy = canvasPoint.y - corners[i].y;
            if (Math.sqrt(dx * dx + dy * dy) <= threshold) return i;
        }
        return -1;
    }

    // ── Pointer tool (handles menu clicks + drill aiming + ball drag + calibration) ──

    pointerTool.onMouseDown = function (event) {
        // Calibration mode: handle dragging
        if (calibrationMode) {
            calibrationDragIdx = hitCalibrationHandle(event.point);
            return;
        }

        // Check UI layer first (menu buttons)
        if (appMode === 'menu' || appMode === 'drillList') {
            var uiHit = hitUI(event.point);
            if (uiHit) {
                if (uiHit.action === 'category') {
                    appMode = 'drillList';
                    showDrillList(uiHit.categoryId, 0);
                } else if (uiHit.action === 'loadDrill') {
                    startDrill(uiHit.drillIdx);
                } else if (uiHit.action === 'backToMenu') {
                    showMenu();
                } else if (uiHit.action === 'prevPage') {
                    showDrillList(drillListCatId, drillListPage - 1);
                } else if (uiHit.action === 'nextPage') {
                    showDrillList(drillListCatId, drillListPage + 1);
                } else if (uiHit.action === 'freeplay') {
                    appMode = 'drill';
                    activeDrills = null;
                    activeDrillIdx = 0;
                    activeCategory = null;
                    clearBalls();
                    clearShotLines();
                    uiLayer.removeChildren();
                    rack9Ball();
                }
                return;
            }
        }

        // In drill mode — dragging balls or aiming
        var b = hitBall(event.point);
        if (b) {
            // Click on any ball (including cue) = drag to reposition
            dragTarget = b;
            var center = T(b.tableX, b.tableY);
            dragOffset = new paper.Point(
                event.point.x - center.x,
                event.point.y - center.y
            );
            clearShotLines();
            aimState = null;
        } else if (balls[0] && Object.keys(balls).length > 1) {
            // Click on empty table with cue ball present = aim from cue ball
            aimState = { aiming: true };
            var tablePos = invT(event.point);
            drawShotLines(balls[0].tableX, balls[0].tableY, tablePos.x, tablePos.y);
        } else {
            clearShotLines();
            aimState = null;
        }
    };

    pointerTool.onMouseDrag = function (event) {
        // Calibration drag
        if (calibrationMode && calibrationDragIdx >= 0) {
            var keys = ['tl', 'tr', 'br', 'bl'];
            calibrationCorners[keys[calibrationDragIdx]] = { x: event.point.x, y: event.point.y };
            drawCalibrationHandles();
            return;
        }

        if (aimState && aimState.aiming && balls[0]) {
            var tablePos = invT(event.point);
            drawShotLines(balls[0].tableX, balls[0].tableY, tablePos.x, tablePos.y);
            return;
        }

        if (!dragTarget) return;
        var adjusted = new paper.Point(
            event.point.x - dragOffset.x,
            event.point.y - dragOffset.y
        );
        var tablePos = invT(adjusted);
        var clamped = clampToPlayingSurface(tablePos.x, tablePos.y);
        dragTarget.tableX = clamped.x;
        dragTarget.tableY = clamped.y;
        dragTarget.group.remove();
        ballLayer.activate();
        dragTarget.group = createBallGroup(dragTarget.num, clamped.x, clamped.y);
    };

    pointerTool.onMouseUp = function () {
        if (calibrationMode) {
            calibrationDragIdx = -1;
            return;
        }
        if (aimState) aimState = null;
        dragTarget = null;
        dragOffset = null;
    };

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', function (e) {
        if (e.key === 'f' || e.key === 'F') enterFullscreen();
        if (e.key === 'p' || e.key === 'P') {
            projectionMode = !projectionMode;
            drawTable();
            redrawBalls();
        }
        if (e.key === 'K' && e.shiftKey) {
            // Shift+K = reset calibration
            resetCalibration();
            return;
        }
        if (e.key === 'k' || e.key === 'K') {
            if (calibrationMode) {
                exitCalibrationMode(true);  // save and apply
            } else {
                enterCalibrationMode();
            }
            return;
        }

        if (appMode === 'drill') {
            if (e.key === 'ArrowRight' || e.key === ' ') nextDrill();
            if (e.key === 'ArrowLeft') prevDrill();
            if (e.key === 'm' || e.key === 'M' || e.key === 'Escape') showMenu();
            if (e.key === '9') { activeDrills = null; rack9Ball(); uiLayer.removeChildren(); }
            if (e.key === '8') { activeDrills = null; rack8Ball(); uiLayer.removeChildren(); }
            if (e.key === 'c' || e.key === 'C') clearBalls();
            if (e.key === 'e' || e.key === 'E') exportDrill();
        } else if (appMode === 'menu' || appMode === 'drillList') {
            if (e.key === 'Escape' && appMode === 'drillList') showMenu();
        }
    });

    // ── Initial draw — load calibration, start on menu ──
    loadCalibration();
    drawTable();
    showMenu();
    paper.view.draw();

})();

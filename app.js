/* ================================================================
   Pool Trainer — app.js
   Step 1: Table renderer  |  Step 2: Ball placement
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
    var ballLayer  = new paper.Layer({ name: 'balls' });

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

    // Helper: convert table-inches point to canvas point.
    // (0,0) = top-left corner of the rail. Playing surface starts at (railWidth, railWidth).
    // We center the table in the viewport and optionally rotate for landscape.
    function T(x, y) {
        var vw = paper.view.size.width;
        var vh = paper.view.size.height;
        var landscape = (vw / vh) >= 1;

        var cx, cy;
        if (landscape) {
            // rotate 90°: table x → screen y, table y → screen x (inverted)
            cx = (totalHeight - y) * scaleFactor;
            cy = x * scaleFactor;
        } else {
            cx = x * scaleFactor;
            cy = y * scaleFactor;
        }

        // center
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

    // Scale inches → canvas pixels (scalar)
    function S(inches) {
        return inches * scaleFactor;
    }

    // Inverse transform: canvas point → table-inches (x, y)
    function invT(canvasPoint) {
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

    // ── Drawing ──

    function drawTable() {
        tableLayer.removeChildren();
        tableLayer.activate();
        computeLayout();

        var rail = cfg.railWidth;
        var cush = cfg.cushionWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;

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

        // 4. Diamonds
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

    // ── Diamonds / Sights (WPA Section 6) ──
    // 18 sights, center 3 11/16" from cushion nose
    function drawDiamonds(rail, pw, ph) {
        var r = cfg.diamondRadius;
        var cw = cfg.cushionWidth;
        // WPA: sight center is sightDistFromNose from the cushion nose
        // Nose is at the inner edge (rail), so sight is at rail - sightDistFromNose + cw
        // = distance from outer edge of table inward
        var sightDist = cfg.sightDistFromNose || 3.6875;
        // Offset from outer table edge: the nose is at 'rail' from outer edge,
        // so the sight is at (rail - cw) + (cw - sightDist) = rail - sightDist
        // But sightDist is measured outward from nose, so sight center = rail - sightDist
        // Wait: nose is at position 'rail' (inner edge). Sight is sightDist away from nose
        // going outward (into the rail). So sight x = rail - sightDist... but that could be
        // negative. sightDist (3.6875) > cushionWidth (2) so the sight is in the wooden rail.
        // Position from outer edge = total rail (rail) - (cushionWidth + sightDist - cushionWidth)
        // Simpler: sight center = rail - sightDist (from playing surface edge, going outward)
        // Since rail=5 and sightDist=3.6875, offset from outer edge = 5 - 3.6875 = 1.3125"
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
        drawTable();
        redrawBalls();
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

    // ── Drag-and-drop ──

    function hitBall(canvasPoint) {
        // Check all balls for hit
        var hit = null;
        var nums = Object.keys(balls);
        for (var i = nums.length - 1; i >= 0; i--) {
            var b = balls[+nums[i]];
            if (!b.group) continue;
            var center = T(b.tableX, b.tableY);
            var dist = canvasPoint.getDistance(center);
            if (dist <= S(cfg.ballRadius) * 1.4) {  // generous touch target
                hit = b;
                break;
            }
        }
        return hit;
    }

    var pointerTool = new paper.Tool();
    pointerTool.activate();

    pointerTool.onMouseDown = function (event) {
        var b = hitBall(event.point);
        if (b) {
            dragTarget = b;
            var center = T(b.tableX, b.tableY);
            dragOffset = new paper.Point(
                event.point.x - center.x,
                event.point.y - center.y
            );
        }
    };

    pointerTool.onMouseDrag = function (event) {
        if (!dragTarget) return;
        var adjusted = new paper.Point(
            event.point.x - dragOffset.x,
            event.point.y - dragOffset.y
        );
        var tablePos = invT(adjusted);
        var clamped = clampToPlayingSurface(tablePos.x, tablePos.y);
        dragTarget.tableX = clamped.x;
        dragTarget.tableY = clamped.y;
        // Move group visually
        var newCenter = T(clamped.x, clamped.y);
        var oldCenter = T(0, 0); // we need delta, so rebuild is simpler for now
        dragTarget.group.remove();
        ballLayer.activate();
        dragTarget.group = createBallGroup(dragTarget.num, clamped.x, clamped.y);
    };

    pointerTool.onMouseUp = function () {
        dragTarget = null;
        dragOffset = null;
    };

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', function (e) {
        if (e.key === '9') rack9Ball();
        if (e.key === '8') rack8Ball();
        if (e.key === 'c' || e.key === 'C') clearBalls();
    });

    // ── Initial draw ──
    drawTable();
    paper.view.draw();

})();

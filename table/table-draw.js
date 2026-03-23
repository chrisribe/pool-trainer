/* ================================================================
   Pool Trainer — table/table-draw.js
   Table rendering, cushions, pockets, diamonds, markings, resize
   ================================================================ */

(function () {
    'use strict';

    var cfg = PT.cfg;
    var colors = cfg.colors;
    var T = PT.T;
    var S = PT.S;

    function drawTable() {
        PT.tableLayer.removeChildren();
        PT.tableLayer.activate();
        PT.computeLayout();

        var rail = cfg.railWidth;
        var cush = cfg.cushionWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;

        if (!PT.projectionMode) {
            var railTL = T(0, 0);
            var railBR = T(PT.totalWidth, PT.totalHeight);
            new paper.Path.Rectangle({
                from: railTL,
                to: railBR,
                radius: S(1.5),
                fillColor: colors.rail,
                strokeColor: '#333',
                strokeWidth: S(0.15)
            });

            drawCushions(rail, pw, ph);
            drawPockets(rail, pw, ph);
        } else {
            drawNoseOutline(rail, pw, ph);
        }

        drawDiamonds(rail, pw, ph);
        drawMarkings(rail, pw, ph);
    }

    function drawCushions(rail, pw, ph) {
        var cw = cfg.cushionWidth;
        var col = colors.cushion;

        var cmAxis = cfg.cornerPocketMouth * 1.0;
        var sm = cfg.sidePocketMouth;

        var cNose = cmAxis;
        var cRail = cmAxis * 0.55;
        var sNose = sm;
        var sRail = sm * 0.45;

        var left   = rail;
        var right  = rail + pw;
        var top    = rail;
        var bottom = rail + ph;
        var midY   = rail + ph / 2;

        var oLeft   = rail - cw;
        var oRight  = rail + pw + cw;
        var oTop    = rail - cw;
        var oBottom = rail + ph + cw;

        // Top short rail
        cushionSegment(left + cRail, oTop, right - cRail, oTop, right - cNose, top, left + cNose, top, col);
        // Bottom short rail
        cushionSegment(left + cNose, bottom, right - cNose, bottom, right - cRail, oBottom, left + cRail, oBottom, col);
        // Left rail, upper half
        cushionSegment(oLeft, top + cRail, left, top + cNose, left, midY - sNose, oLeft, midY - sRail, col);
        // Left rail, lower half
        cushionSegment(oLeft, midY + sRail, left, midY + sNose, left, bottom - cNose, oLeft, bottom - cRail, col);
        // Right rail, upper half
        cushionSegment(right, top + cNose, oRight, top + cRail, oRight, midY - sRail, right, midY - sNose, col);
        // Right rail, lower half
        cushionSegment(right, midY + sNose, oRight, midY + sRail, oRight, bottom - cRail, right, bottom - cNose, col);
    }

    function cushionSegment(x1, y1, x2, y2, x3, y3, x4, y4, col) {
        new paper.Path({
            segments: [T(x1, y1), T(x2, y2), T(x3, y3), T(x4, y4)],
            closed: true,
            fillColor: col,
            strokeColor: '#0a9ea3',
            strokeWidth: S(0.15)
        });
    }

    function drawPockets(rail, pw, ph) {
        var cr = cfg.cornerPocketRadius;
        var sr = cfg.sidePocketRadius;
        var cShelf = cfg.cornerPocketShelf;
        var sShelf = cfg.sidePocketShelf;

        var cDiag = cShelf * 0.7;
        var corners = [
            { x: rail - cDiag,      y: rail - cDiag,      r: cr },
            { x: rail + pw + cDiag, y: rail - cDiag,      r: cr },
            { x: rail - cDiag,      y: rail + ph + cDiag, r: cr },
            { x: rail + pw + cDiag, y: rail + ph + cDiag, r: cr }
        ];

        var sOffset = sShelf + sr;
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

    function drawDiamonds(rail, pw, ph) {
        var r = cfg.diamondRadius;
        var sightDist = cfg.sightDistFromNose || 3.6875;
        var offset = rail - sightDist;

        var longSpacing = ph / 8;
        for (var i = 1; i <= 7; i++) {
            if (i === 4) continue;
            var y = rail + i * longSpacing;
            diamond(T(offset, y), r);
            diamond(T(rail + pw + (rail - offset), y), r);
        }

        var shortSpacing = pw / 4;
        for (var j = 1; j <= 3; j++) {
            var x = rail + j * shortSpacing;
            diamond(T(x, offset), r);
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

    function drawMarkings(rail, pw, ph) {
        var col = colors.tableLine;
        var sw = S(0.15);

        var headY = rail + ph * 0.75;
        new paper.Path.Line({
            from: T(rail, headY),
            to: T(rail + pw, headY),
            strokeColor: col,
            strokeWidth: sw,
            dashArray: [S(1), S(1)]
        });

        var footSpotY = rail + ph * 0.25;
        new paper.Path.Circle({
            center: T(rail + pw / 2, footSpotY),
            radius: S(0.4),
            fillColor: col
        });

        new paper.Path.Circle({
            center: T(rail + pw / 2, headY),
            radius: S(0.4),
            fillColor: col
        });

        new paper.Path.Circle({
            center: T(rail + pw / 2, rail + ph / 2),
            radius: S(0.4),
            fillColor: col
        });

        new paper.Path.Line({
            from: T(rail + pw / 2, rail),
            to: T(rail + pw / 2, rail + ph),
            strokeColor: 'rgba(255,255,255,0.06)',
            strokeWidth: sw
        });
    }

    function enterFullscreen() {
        var el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }

    // ── Resize handling ──
    var lastResizeW = 0, lastResizeH = 0;
    paper.view.onResize = function () {
        var w = paper.view.size.width, h = paper.view.size.height;
        if (w === lastResizeW && h === lastResizeH) return;
        lastResizeW = w; lastResizeH = h;
        PT.rebuildCalibration();
        drawTable();
        PT.redrawBalls();
        PT.clearShotLines();
        if (PT.drawCueTarget) PT.drawCueTarget();
        if (PT.calibrationMode) PT.drawCalibrationHandles();
        if (PT.appMode === 'menu') PT.enterMenu();
        else if (PT.appMode === 'drillList') PT.showDrillList(PT.drillListCatId, PT.drillListPage);
        else if (PT.appMode === 'drill' && PT.activeDrills) PT.showDrillHUD();
    };

    // ── Exports ──
    PT.drawTable = drawTable;
    PT.enterFullscreen = enterFullscreen;
})();

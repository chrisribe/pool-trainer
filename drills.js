/* ================================================================
   Pool Trainer — drills.js
   Drill save/load, menu UI, drill list, HUD, navigation
   ================================================================ */

(function () {
    'use strict';

    var cfg = PT.cfg;
    var T = PT.T;
    var S = PT.S;
    var balls = PT.balls;

    // ── Drill state ──
    var drillCache = {};
    var activeDrills = null;
    var activeDrillIdx = 0;
    var activeCategory = null;
    var drillListPage = 0;
    var drillListCatId = null;
    var menuCursor = 0;
    var menuItemCount = 0;
    var menuPage = 0;
    var cueTargetGroup = null;
    var physicsMenuItems = [
        { label: 'Run Physics Tests', action: 'runPhysicsTests' },
        { label: 'Run Cue Ball Tests', action: 'runCueBallPhysicsTests' },
        { label: 'Run Collision Tests', action: 'runCollisionTransferTests' },
        { label: 'Run Calibration', action: 'calibrate' },
        { label: 'Run Full Phase Sweep', action: 'runAll' }
    ];

    // ── Serialize / Load ──

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
        var drill = {
            name: name || 'Untitled Drill',
            description: description || '',
            difficulty: difficulty || 1,
            balls: ballList
        };
        // Include cueOverlay if present
        if (PT.cueOverlay) {
            drill.cueOverlay = {
                show: PT.cueOverlay.show !== false,
                tip: PT.cueOverlay.tip || { x: 0, y: 0 },
                power: (typeof PT.cueOverlay.power === 'number') ? PT.cueOverlay.power : 0.5
            };
        }
        if (PT.cueTarget) {
            drill.cueTarget = { x: PT.cueTarget.x, y: PT.cueTarget.y };
        }
        return drill;
    }

    function drawCueTarget() {
        if (cueTargetGroup) {
            cueTargetGroup.remove();
            cueTargetGroup = null;
        }
        PT.targetLayer.removeChildren();
        if (!PT.cueTarget || PT.appMode !== 'drill') return;

        var rail = cfg.railWidth;
        var tx = rail + PT.cueTarget.x;
        var ty = rail + PT.cueTarget.y;

        PT.targetLayer.activate();

        cueTargetGroup = new paper.Group();
        cueTargetGroup.addChild(new paper.Path.Circle({
            center: T(tx, ty),
            radius: S(2.5),
            strokeColor: 'rgba(0,229,255,0.25)',
            strokeWidth: S(0.08),
            fillColor: null
        }));
        cueTargetGroup.addChild(new paper.Path.Circle({
            center: T(tx, ty),
            radius: S(1.5),
            strokeColor: 'rgba(0,229,255,0.35)',
            strokeWidth: S(0.08),
            fillColor: null
        }));
        cueTargetGroup.addChild(new paper.Path.Circle({
            center: T(tx, ty),
            radius: S(0.6),
            strokeColor: 'rgba(0,229,255,0.5)',
            strokeWidth: S(0.1),
            fillColor: 'rgba(0,229,255,0.12)'
        }));
        var chSize = S(3.2);
        var cp = T(tx, ty);
        cueTargetGroup.addChild(new paper.Path.Line({
            from: new paper.Point(cp.x - chSize, cp.y),
            to: new paper.Point(cp.x + chSize, cp.y),
            strokeColor: 'rgba(0,229,255,0.2)',
            strokeWidth: S(0.06)
        }));
        cueTargetGroup.addChild(new paper.Path.Line({
            from: new paper.Point(cp.x, cp.y - chSize),
            to: new paper.Point(cp.x, cp.y + chSize),
            strokeColor: 'rgba(0,229,255,0.2)',
            strokeWidth: S(0.06)
        }));
    }

    function setCueTarget(x, y) {
        PT.cueTarget = { x: x, y: y };
        drawCueTarget();
    }

    function hideCueTarget() {
        if (cueTargetGroup) {
            cueTargetGroup.remove();
            cueTargetGroup = null;
        }
        PT.targetLayer.removeChildren();
    }

    function hitCueTarget(canvasPoint) {
        if (!PT.cueTarget) return null;
        var rail = cfg.railWidth;
        var center = T(rail + PT.cueTarget.x, rail + PT.cueTarget.y);
        var dist = canvasPoint.getDistance(center);
        if (dist <= S(3.2)) return { type: 'cueTarget' };
        return null;
    }

    function loadDrill(drill) {
        PT.cueOverlay = drill.cueOverlay || null;
        PT.cueTarget = drill.cueTarget ? { x: drill.cueTarget.x, y: drill.cueTarget.y } : null;
        PT.clearBalls();
        PT.clearShotLines();
        var rail = cfg.railWidth;
        drill.balls.forEach(function (b) {
            PT.placeBall(b.num, rail + b.x, rail + b.y);
        });

        var cue = balls[0];
        if (!cue) return;

        if (drill.aimLine) {
            PT.drawShotLines(cue.tableX, cue.tableY, rail + drill.aimLine.x, rail + drill.aimLine.y);
        } else {
            var ob = null;
            for (var i = 0; i < drill.balls.length; i++) {
                if (drill.balls[i].num !== 0) {
                    ob = balls[drill.balls[i].num];
                    break;
                }
            }
            if (!ob) return;

            var cueToBallDx = ob.tableX - cue.tableX;
            var cueToBallDy = ob.tableY - cue.tableY;
            var pocket = PT.findBestPocket(ob.tableX, ob.tableY, cueToBallDx, cueToBallDy);

            if (pocket) {
                var pDx = pocket.pocket.x - ob.tableX;
                var pDy = pocket.pocket.y - ob.tableY;
                var pLen = Math.sqrt(pDx * pDx + pDy * pDy);
                var r2 = cfg.ballRadius * 2;
                var ghostX = ob.tableX - (pDx / pLen) * r2;
                var ghostY = ob.tableY - (pDy / pLen) * r2;
                PT.drawShotLines(cue.tableX, cue.tableY, ghostX, ghostY);
            } else {
                PT.drawShotLines(cue.tableX, cue.tableY, ob.tableX, ob.tableY);
            }
        }

        drawCueTarget();
    }

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

    // Save current drill to server (update in place)
    function saveDrill(callback) {
        if (!activeDrills || !drillListCatId) {
            if (callback) callback(false, 'No active drill category');
            return;
        }
        var existing = activeDrills[activeDrillIdx];
        var drill = serializeDrill(
            existing.name,
            existing.description,
            existing.difficulty
        );
        // Preserve fields we don't edit
        if (PT.cueTarget) drill.cueTarget = { x: PT.cueTarget.x, y: PT.cueTarget.y };
        else if (existing.cueTarget) drill.cueTarget = existing.cueTarget;
        // Capture current aim if available, otherwise keep original
        if (PT.lastAimPoint) {
            var rail = cfg.railWidth;
            drill.aimLine = {
                x: Math.round((PT.lastAimPoint.x - rail) * 100) / 100,
                y: Math.round((PT.lastAimPoint.y - rail) * 100) / 100
            };
        } else if (existing.aimLine) {
            drill.aimLine = existing.aimLine;
        }

        var xhr = new XMLHttpRequest();
        xhr.open('PUT', '/api/drills/' + drillListCatId + '/' + activeDrillIdx, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
            var ok = xhr.status === 200;
            // Update local cache so navigating back shows new data
            if (ok) {
                activeDrills[activeDrillIdx] = drill;
                if (drillCache[drillListCatId]) drillCache[drillListCatId][activeDrillIdx] = drill;
            }
            if (callback) callback(ok, ok ? 'Saved' : 'Save failed');
        };
        xhr.onerror = function () { if (callback) callback(false, 'Network error'); };
        xhr.send(JSON.stringify(drill));
    }

    // Save as new drill appended to a category
    function saveAsNewDrill(name, catId, difficulty, callback) {
        // Support old signature: saveAsNewDrill(name, callback)
        if (typeof catId === 'function') { callback = catId; catId = null; difficulty = 1; }
        if (typeof difficulty === 'function') { callback = difficulty; difficulty = 1; }
        catId = 'custom';
        var drill = serializeDrill(name || 'New Drill', '', difficulty || 1);

        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/drills/' + catId, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
            var ok = xhr.status === 200;
            if (ok) {
                try {
                    var resp = JSON.parse(xhr.responseText);
                    // Add to local cache
                    if (drillCache[catId]) drillCache[catId].push(drill);
                    // If we're in the same category, update active drills
                    if (activeDrills && drillListCatId === catId) {
                        activeDrills.push(drill);
                        activeDrillIdx = activeDrills.length - 1;
                    }
                } catch (e) {}
            }
            if (callback) callback(ok, ok ? 'Drill added' : 'Save failed');
        };
        xhr.onerror = function () { if (callback) callback(false, 'Network error'); };
        xhr.send(JSON.stringify(drill));
    }

    // ── Fetch drills ──

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

    // ── Menu rendering ──

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

    function makeFrame(left, top, right, bottom) {
        return {
            left: left,
            top: top,
            right: right,
            bottom: bottom,
            width: right - left,
            height: bottom - top,
            cx: (left + right) / 2,
            cy: (top + bottom) / 2
        };
    }

    function insetFrame(frame, padX, padY) {
        return makeFrame(
            frame.left + padX,
            frame.top + padY,
            frame.right - padX,
            frame.bottom - padY
        );
    }

    function splitVertical(frame, topHeight, footerHeight) {
        var bodyTop = frame.top + topHeight;
        var bodyBottom = frame.bottom - footerHeight;
        if (bodyBottom < bodyTop) bodyBottom = bodyTop;
        return {
            top: makeFrame(frame.left, frame.top, frame.right, bodyTop),
            body: makeFrame(frame.left, bodyTop, frame.right, bodyBottom),
            footer: makeFrame(frame.left, bodyBottom, frame.right, frame.bottom)
        };
    }

    function buildLayoutContext() {
        var felt = getFeltBounds();
        var root = makeFrame(felt.left, felt.top, felt.right, felt.bottom);
        var minSide = Math.min(root.width, root.height);
        var safe = insetFrame(root, root.width * 0.05, root.height * 0.04);
        var tokens = {
            titleSize: minSide * 0.06,
            subtitleSize: minSide * 0.025,
            hintSize: minSide * 0.02,
            menuBtnW: Math.min(root.width * 0.6, 400),
            menuBtnH: Math.min(root.height * 0.07, 50),
            listBtnW: Math.min(root.width * 0.65, 450),
            listBtnH: Math.min(root.height * 0.06, 44),
            menuGap: Math.min(root.height * 0.07, 50) * 0.35,
            listGap: Math.min(root.height * 0.06, 44) * 0.25,
            radius: 8,
            bulletSizeMul: 0.4
        };
        return {
            felt: root,
            safe: safe,
            tokens: tokens
        };
    }

    function getMenuPaginationFrame(ctx, btnH, gap) {
        var startY = ctx.felt.top + ctx.felt.height * 0.24;
        var hintY = ctx.felt.bottom - ctx.felt.height * 0.12;
        var bottomY = hintY - btnH * 0.95;
        return makeFrame(ctx.felt.left, startY, ctx.felt.right, bottomY);
    }

    function getPerPage(frame, itemH, gap) {
        var step = itemH + gap;
        return Math.max(1, Math.floor(frame.height / step));
    }

    function getMenuPagingMetrics() {
        var ctx = buildLayoutContext();
        var btnH = ctx.tokens.menuBtnH;
        var gap = ctx.tokens.menuGap;
        var frame = getMenuPaginationFrame(ctx, btnH, gap);
        return {
            perPage: getPerPage(frame, btnH, gap)
        };
    }

    function alignX(frame, width, mode, inset) {
        inset = inset || 0;
        if (mode === 'left') return frame.left + inset;
        if (mode === 'right') return frame.right - width - inset;
        return frame.cx - width / 2;
    }

    function showMenu() {
        PT.appMode = 'menu';
        PT.clearBalls();
        PT.clearShotLines();
        hideCueTarget();
        PT.uiLayer.removeChildren();
        PT.uiLayer.activate();

        var ctx = buildLayoutContext();
        var tokens = ctx.tokens;
        var felt = ctx.felt;

        new paper.PointText({
            point: new paper.Point(felt.cx, felt.top + felt.height * 0.1),
            content: 'POOL TRAINER',
            fillColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: tokens.titleSize,
            justification: 'center'
        });

        new paper.PointText({
            point: new paper.Point(felt.cx, felt.top + felt.height * 0.16),
            content: 'Select a drill category',
            fillColor: 'rgba(255,255,255,0.5)',
            fontFamily: 'Arial, sans-serif',
            fontSize: tokens.subtitleSize,
            justification: 'center'
        });

        var catalog = (typeof DRILL_CATALOG !== 'undefined') ? DRILL_CATALOG : [];
        var btnW = tokens.menuBtnW;
        var btnH = tokens.menuBtnH;
        var gap = tokens.menuGap;
        var listFrame = getMenuPaginationFrame(ctx, btnH, gap);
        var startY = listFrame.top;
        var itemStep = btnH + gap;
        var perPage = getPerPage(listFrame, btnH, gap);

        var items = [];
        if (activeDrills && activeDrills.length) {
            var drill = activeDrills[activeDrillIdx];
            items.push({
                action: 'resume',
                label: '\u25b6 Resume: ' + drill.name + '  (' + (activeDrillIdx + 1) + '/' + activeDrills.length + ')',
                fill: 'rgba(0,255,100,0.2)',
                fillIdle: 'rgba(0,255,100,0.08)',
                stroke: '#00ff66',
                strokeIdle: 'rgba(0,255,100,0.4)',
                text: '#00ff66'
            });
        }

        catalog.forEach(function (cat) {
            items.push({
                action: 'category',
                categoryId: cat.id,
                label: cat.icon + '  ' + cat.name,
                fill: 'rgba(255,255,255,0.18)',
                fillIdle: 'rgba(255,255,255,0.08)',
                stroke: '#ffffff',
                strokeIdle: 'rgba(255,255,255,0.3)',
                text: '#ffffff'
            });
        });

        items.push({
            action: 'freeplay',
            label: '\ud83c\udfb1  Free Play',
            fill: 'rgba(0,229,255,0.2)',
            fillIdle: 'rgba(0,229,255,0.1)',
            stroke: '#00e5ff',
            strokeIdle: 'rgba(0,229,255,0.4)',
            text: '#00e5ff'
        });

        items.push({
            action: 'physicsTests',
            label: '\u2699\ufe0f  Physics Tests',
            fill: 'rgba(255,200,0,0.22)',
            fillIdle: 'rgba(255,200,0,0.1)',
            stroke: '#ffd84a',
            strokeIdle: 'rgba(255,216,74,0.45)',
            text: '#ffd84a'
        });

        menuItemCount = items.length;
        if (menuItemCount < 1) menuItemCount = 1;
        if (menuCursor >= menuItemCount) menuCursor = menuItemCount - 1;
        if (menuCursor < 0) menuCursor = 0;

        var totalPages = Math.max(1, Math.ceil(items.length / perPage));
        menuPage = Math.max(0, Math.min(totalPages - 1, menuPage));
        var pageStart = menuPage * perPage;
        var pageEnd = Math.min(pageStart + perPage, items.length);

        if (menuCursor < pageStart || menuCursor >= pageEnd) {
            menuCursor = pageStart;
        }

        for (var i = pageStart; i < pageEnd; i++) {
            var row = i - pageStart;
            var y = startY + row * itemStep;
            var item = items[i];
            var selected = (i === menuCursor);

            var btn = new paper.Path.Rectangle({
                from: new paper.Point(alignX(felt, btnW, 'center'), y),
                to: new paper.Point(alignX(felt, btnW, 'center') + btnW, y + btnH),
                radius: tokens.radius,
                fillColor: selected ? item.fill : item.fillIdle,
                strokeColor: selected ? item.stroke : item.strokeIdle,
                strokeWidth: selected ? 2 : 1
            });
            btn.data = { action: item.action, categoryId: item.categoryId };

            var label = new paper.PointText({
                point: new paper.Point(felt.cx, y + btnH * 0.65),
                content: item.label,
                fillColor: item.text,
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: btnH * 0.4,
                justification: 'center'
            });
            label.data = { action: item.action, categoryId: item.categoryId };

            if (selected) {
                new paper.PointText({
                    point: new paper.Point(alignX(felt, btnW, 'center') - btnH * 0.4, y + btnH * 0.65),
                    content: '\u25b6',
                    fillColor: item.text,
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * tokens.bulletSizeMul,
                    justification: 'center'
                });
            }
        }

        var hintY = felt.bottom - felt.height * 0.12;

        if (totalPages > 1) {
            var rowsShown = Math.max(0, pageEnd - pageStart);
            var navY = startY + rowsShown * itemStep + gap * 0.15;
            var navBottomLimit = hintY - btnH * 0.95 - gap * 0.25;
            if (navY > navBottomLimit) navY = navBottomLimit;
            var navBtnW = btnH * 1.3;
            var navTextW = btnH * 2.0;

            if (menuPage > 0) {
                var prevX = felt.cx - navTextW / 2 - navBtnW;
                new paper.Path.Rectangle({
                    from: new paper.Point(prevX, navY),
                    to: new paper.Point(prevX + navBtnW, navY + btnH * 0.82),
                    radius: 6,
                    fillColor: 'rgba(255,255,255,0.05)',
                    strokeColor: 'rgba(255,255,255,0.25)',
                    strokeWidth: 1
                }).data = { action: 'menuPrevPage' };
                new paper.PointText({
                    point: new paper.Point(prevX + navBtnW / 2, navY + btnH * 0.56),
                    content: '\u25c0',
                    fillColor: 'rgba(255,255,255,0.75)',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.36,
                    justification: 'center'
                }).data = { action: 'menuPrevPage' };
            }

            new paper.PointText({
                point: new paper.Point(felt.cx, navY + btnH * 0.56),
                content: (menuPage + 1) + ' / ' + totalPages,
                fillColor: 'rgba(255,255,255,0.45)',
                fontFamily: 'Arial, sans-serif',
                fontSize: btnH * 0.3,
                justification: 'center'
            });

            if (menuPage < totalPages - 1) {
                var nextX = felt.cx + navTextW / 2;
                new paper.Path.Rectangle({
                    from: new paper.Point(nextX, navY),
                    to: new paper.Point(nextX + navBtnW, navY + btnH * 0.82),
                    radius: 6,
                    fillColor: 'rgba(255,255,255,0.05)',
                    strokeColor: 'rgba(255,255,255,0.25)',
                    strokeWidth: 1
                }).data = { action: 'menuNextPage' };
                new paper.PointText({
                    point: new paper.Point(nextX + navBtnW / 2, navY + btnH * 0.56),
                    content: '\u25b6',
                    fillColor: 'rgba(255,255,255,0.75)',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.36,
                    justification: 'center'
                }).data = { action: 'menuNextPage' };
            }
        }

        new paper.PointText({
            point: new paper.Point(felt.cx, hintY),
            content: '\u2191\u2193 Navigate   \u25c0\u25b6 Page   Enter Select   F Fullscreen   P Projection   K Calibrate',
            fillColor: 'rgba(255,255,255,0.25)',
            fontFamily: 'Arial, sans-serif',
            fontSize: tokens.hintSize,
            justification: 'center'
        });

        PT.qrLayer.visible = true;
    }

    function runPhysicsMenuAction(action) {
        function safeRun(fnName) {
            if (typeof PT[fnName] === 'function') {
                try {
                    PT[fnName]();
                    return true;
                } catch (err) {
                    console.error('Physics menu action failed:', fnName, err);
                    return false;
                }
            }
            return false;
        }

        if (action === 'runAll') {
            safeRun('runPhysicsTests');
            safeRun('runCueBallPhysicsTests');
            safeRun('runCollisionTransferTests');
            safeRun('calibrate');
            return;
        }

        safeRun(action);
    }

    function showPhysicsTestsMenu() {
        PT.qrLayer.visible = false;
        PT.qrLayer.removeChildren();
        hideCueTarget();
        PT.uiLayer.removeChildren();
        PT.uiLayer.activate();

        PT.appMode = 'physicsTests';

        var ctx = buildLayoutContext();
        var tokens = ctx.tokens;
        var felt = ctx.felt;

        new paper.PointText({
            point: new paper.Point(felt.cx, felt.top + felt.height * 0.1),
            content: 'PHYSICS TESTS',
            fillColor: '#ffd84a',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: tokens.titleSize * 0.92,
            justification: 'center'
        });

        new paper.PointText({
            point: new paper.Point(felt.cx, felt.top + felt.height * 0.155),
            content: 'Run test phases quickly (results in browser console)',
            fillColor: 'rgba(255,255,255,0.55)',
            fontFamily: 'Arial, sans-serif',
            fontSize: tokens.subtitleSize * 0.88,
            justification: 'center'
        });

        var btnW = Math.min(felt.width * 0.62, 430);
        var btnH = tokens.menuBtnH;
        var gap = tokens.menuGap;
        var startY = felt.top + felt.height * 0.24;

        menuItemCount = physicsMenuItems.length + 1;
        if (menuCursor >= menuItemCount) menuCursor = menuItemCount - 1;
        if (menuCursor < 0) menuCursor = 0;

        for (var i = 0; i < physicsMenuItems.length; i++) {
            var item = physicsMenuItems[i];
            var y = startY + i * (btnH + gap);
            var selected = (menuCursor === i);

            var btn = new paper.Path.Rectangle({
                from: new paper.Point(alignX(felt, btnW, 'center'), y),
                to: new paper.Point(alignX(felt, btnW, 'center') + btnW, y + btnH),
                radius: tokens.radius,
                fillColor: selected ? 'rgba(255,216,74,0.2)' : 'rgba(255,255,255,0.07)',
                strokeColor: selected ? '#ffd84a' : 'rgba(255,255,255,0.25)',
                strokeWidth: selected ? 2 : 1
            });
            btn.data = { action: 'physicsAction', testAction: item.action };

            new paper.PointText({
                point: new paper.Point(felt.cx, y + btnH * 0.65),
                content: item.label,
                fillColor: selected ? '#ffd84a' : '#ffffff',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: btnH * 0.36,
                justification: 'center'
            }).data = { action: 'physicsAction', testAction: item.action };

            if (selected) {
                new paper.PointText({
                    point: new paper.Point(alignX(felt, btnW, 'center') - btnH * 0.4, y + btnH * 0.65),
                    content: '\u25b6',
                    fillColor: '#ffd84a',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.4,
                    justification: 'center'
                });
            }
        }

        var backY = startY + physicsMenuItems.length * (btnH + gap) + gap;
        var backSelected = (menuCursor === physicsMenuItems.length);

        var backBtn = new paper.Path.Rectangle({
            from: new paper.Point(alignX(felt, btnW, 'center'), backY),
            to: new paper.Point(alignX(felt, btnW, 'center') + btnW, backY + btnH),
            radius: tokens.radius,
            fillColor: backSelected ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.05)',
            strokeColor: backSelected ? '#ffffff' : 'rgba(255,255,255,0.25)',
            strokeWidth: backSelected ? 2 : 1
        });
        backBtn.data = { action: 'backToMenu' };

        new paper.PointText({
            point: new paper.Point(felt.cx, backY + btnH * 0.65),
            content: '\u2190 Back to Main Menu',
            fillColor: backSelected ? '#ffffff' : 'rgba(255,255,255,0.8)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: btnH * 0.34,
            justification: 'center'
        }).data = { action: 'backToMenu' };

        new paper.PointText({
            point: new paper.Point(felt.cx, felt.bottom - felt.height * 0.12),
            content: '\u2191\u2193 or P/N Navigate   Enter Select   Esc Back',
            fillColor: 'rgba(255,255,255,0.25)',
            fontFamily: 'Arial, sans-serif',
            fontSize: tokens.hintSize,
            justification: 'center'
        });
    }

    function enterMenu() {
        showMenu();
        PT.drawQRCode();
    }

    // ── Drill list ──

    function showDrillList(categoryId, page) {
        var cat = null;
        var catalog = (typeof DRILL_CATALOG !== 'undefined') ? DRILL_CATALOG : [];
        for (var i = 0; i < catalog.length; i++) {
            if (catalog[i].id === categoryId) { cat = catalog[i]; break; }
        }
        if (!cat) return;

        fetchDrills(cat, function (drills) {
            PT.qrLayer.visible = false;
            PT.qrLayer.removeChildren();
            hideCueTarget();
            activeCategory = cat.name;
            activeDrills = drills;
            activeDrillIdx = 0;
            drillListCatId = categoryId;
            drillListPage = page || 0;

            PT.uiLayer.removeChildren();
            PT.uiLayer.activate();

            var ctx = buildLayoutContext();
            var tokens = ctx.tokens;
            var felt = ctx.felt;
            var frames = splitVertical(felt, felt.height * 0.16, felt.height * 0.14);

            new paper.PointText({
                point: new paper.Point(felt.cx, frames.top.top + frames.top.height * 0.62),
                content: cat.icon + ' ' + cat.name,
                fillColor: '#ffffff',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: tokens.titleSize * 0.66,
                justification: 'center'
            });

            var btnW = tokens.listBtnW;
            var btnH = tokens.listBtnH;
            var gap = tokens.listGap;
            var listTop = frames.body.top + gap * 0.2;
            var listBottom = frames.body.bottom;
            var available = listBottom - listTop;
            var itemH = btnH + gap;
            var perPage = Math.max(1, Math.floor(available / itemH));
            var totalPages = Math.max(1, Math.ceil(drills.length / perPage));
            var pg = Math.min(drillListPage, totalPages - 1);
            var startIdx = pg * perPage;
            var endIdx = Math.min(startIdx + perPage, drills.length);

            var pageItems = endIdx - startIdx;
            var isEmptyCustom = (drills.length === 0 && cat.id === 'custom');
            if (isEmptyCustom) pageItems = 1;
            menuItemCount = pageItems + 1;
            if (menuCursor >= menuItemCount) menuCursor = menuItemCount - 1;
            if (menuCursor < 0) menuCursor = 0;
            if (isEmptyCustom) {
                var emptyY = listTop;
                var emptySelected = (menuCursor === 0);
                var emptyBtn = new paper.Path.Rectangle({
                    from: new paper.Point(alignX(felt, btnW, 'center'), emptyY),
                    to: new paper.Point(alignX(felt, btnW, 'center') + btnW, emptyY + btnH),
                    radius: 6,
                    fillColor: emptySelected ? 'rgba(0,229,255,0.16)' : 'rgba(0,229,255,0.08)',
                    strokeColor: emptySelected ? '#00e5ff' : 'rgba(0,229,255,0.4)',
                    strokeWidth: emptySelected ? 2 : 1
                });
                emptyBtn.data = { action: 'newCustomDrill' };

                if (emptySelected) {
                    new paper.PointText({
                        point: new paper.Point(alignX(felt, btnW, 'center') - btnH * 0.35, emptyY + btnH * 0.65),
                        content: '\u25b6',
                        fillColor: '#00e5ff',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.36,
                        justification: 'center'
                    });
                }

                new paper.PointText({
                    point: new paper.Point(felt.cx, emptyY + btnH * 0.65),
                    content: 'Create New Drill',
                    fillColor: '#00e5ff',
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 'bold',
                    fontSize: btnH * 0.36,
                    justification: 'center'
                }).data = { action: 'newCustomDrill' };

                new paper.PointText({
                    point: new paper.Point(felt.cx, emptyY + btnH * 1.7),
                    content: 'No custom drills yet',
                    fillColor: 'rgba(255,255,255,0.4)',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.28,
                    justification: 'center'
                });
            } else {
                for (var j = startIdx; j < endIdx; j++) {
                    var drill = drills[j];
                    var row = j - startIdx;
                    var y = listTop + row * itemH;
                    var isSelected = (row === menuCursor);

                    var stars = '';
                    for (var s = 0; s < 5; s++) stars += s < drill.difficulty ? '\u2605' : '\u2606';

                    var btn = new paper.Path.Rectangle({
                        from: new paper.Point(alignX(felt, btnW, 'center'), y),
                        to: new paper.Point(alignX(felt, btnW, 'center') + btnW, y + btnH),
                        radius: 6,
                        fillColor: isSelected ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
                        strokeColor: isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)',
                        strokeWidth: isSelected ? 2 : 1
                    });
                    btn.data = { action: 'loadDrill', drillIdx: j };

                    if (isSelected) {
                        new paper.PointText({
                            point: new paper.Point(alignX(felt, btnW, 'center') - btnH * 0.35, y + btnH * 0.65),
                            content: '\u25b6',
                            fillColor: '#ffffff',
                            fontFamily: 'Arial, sans-serif',
                            fontSize: btnH * 0.36,
                            justification: 'center'
                        });
                    }

                    new paper.PointText({
                        point: new paper.Point(felt.cx - btnW * 0.42, y + btnH * 0.65),
                        content: drill.name,
                        fillColor: '#ffffff',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.36,
                        justification: 'left'
                    }).data = { action: 'loadDrill', drillIdx: j };

                    new paper.PointText({
                        point: new paper.Point(felt.cx + btnW * 0.42, y + btnH * 0.65),
                        content: stars,
                        fillColor: '#ffee00',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.3,
                        justification: 'right'
                    }).data = { action: 'loadDrill', drillIdx: j };
                }
            }

            // Bottom row: [Back]  [◀ page ▶]
            var botY = frames.footer.top + frames.footer.height * 0.2;
            var navBtnW = btnH * 1.2;
            var backW = btnW * 0.3;
            var backSelected = (menuCursor === pageItems);

            var bkL = alignX(felt, btnW, 'center');
            var backBtn = new paper.Path.Rectangle({
                from: new paper.Point(bkL, botY),
                to: new paper.Point(bkL + backW, botY + btnH),
                radius: 6,
                fillColor: backSelected ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                strokeColor: backSelected ? '#ffffff' : 'rgba(255,255,255,0.2)',
                strokeWidth: backSelected ? 2 : 1
            });
            backBtn.data = { action: 'backToMenu' };

            new paper.PointText({
                point: new paper.Point(bkL + backW / 2, botY + btnH * 0.65),
                content: '\u2190 Back',
                fillColor: backSelected ? '#ffffff' : 'rgba(255,255,255,0.6)',
                fontFamily: 'Arial, sans-serif',
                fontSize: btnH * 0.34,
                justification: 'center'
            }).data = { action: 'backToMenu' };

            if (backSelected) {
                new paper.PointText({
                    point: new paper.Point(bkL - btnH * 0.35, botY + btnH * 0.65),
                    content: '\u25b6',
                    fillColor: '#ffffff',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.34,
                    justification: 'center'
                });
            }

            if (totalPages > 1) {
                var navR = alignX(felt, btnW, 'center') + btnW;
                var pgTextW = btnH * 1.8;

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
                        content: '\u25b6',
                        fillColor: 'rgba(255,255,255,0.6)',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.4,
                        justification: 'center'
                    }).data = { action: 'nextPage' };
                }

                var pgX = navR - navBtnW - pgTextW / 2;
                new paper.PointText({
                    point: new paper.Point(pgX, botY + btnH * 0.65),
                    content: (pg + 1) + ' / ' + totalPages,
                    fillColor: 'rgba(255,255,255,0.4)',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.32,
                    justification: 'center'
                });

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
                        content: '\u25c0',
                        fillColor: 'rgba(255,255,255,0.6)',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.4,
                        justification: 'center'
                    }).data = { action: 'prevPage' };
                }
            }
        });
    }

    // ── Drill HUD ──

    function showDrillHUD() {
        PT.uiLayer.removeChildren();
        PT.uiLayer.activate();

        var ctx = buildLayoutContext();
        var felt = ctx.felt;
        var margin = S(2);
        var fs = S(1.4);
        var leftX = felt.left + margin;
        var rightX = felt.right - margin;
        var topY = felt.top + margin;
        var bottomY = felt.bottom - margin;

        if (!activeDrills || !activeDrills[activeDrillIdx]) {
            // Free play — show minimal hint
            new paper.PointText({
                point: new paper.Point(felt.cx, bottomY),
                content: 'A Auto Solve    Shift+A Animate    N Save as Drill    M Menu    E Edit    F Fullscreen    P Projection    K Calibrate    Del Remove Ball    Tap Trash',
                fillColor: 'rgba(255,255,255,0.2)',
                fontFamily: 'Arial, sans-serif',
                fontSize: fs * 0.55,
                justification: 'center'
            });
            return;
        }

        var drill = activeDrills[activeDrillIdx];
        new paper.PointText({
            point: new paper.Point(leftX, topY + fs),
            content: drill.name,
            fillColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: fs * 1.1,
            justification: 'left'
        });

        var infoY = topY + fs * 2.0;
        if (activeCategory) {
            new paper.PointText({
                point: new paper.Point(leftX, infoY),
                content: 'Category: ' + activeCategory,
                fillColor: 'rgba(255,255,255,0.35)',
                fontFamily: 'Arial, sans-serif',
                fontSize: fs * 0.6,
                justification: 'left'
            });
            infoY += fs * 0.9;
        }

        if (drill.description) {
            new paper.PointText({
                point: new paper.Point(leftX, infoY + fs * 0.9),
                content: drill.description,
                fillColor: 'rgba(255,255,255,0.4)',
                fontFamily: 'Arial, sans-serif',
                fontSize: fs * 0.65,
                justification: 'left'
            });
        }

        new paper.PointText({
            point: new paper.Point(rightX, topY + fs),
            content: (activeDrillIdx + 1) + ' / ' + activeDrills.length,
            fillColor: 'rgba(255,255,255,0.6)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: fs * 1.0,
            justification: 'right'
        });

        if (activeCategory) {
            new paper.PointText({
                point: new paper.Point(rightX, topY + fs * 2.5),
                content: activeCategory,
                fillColor: 'rgba(255,255,255,0.3)',
                fontFamily: 'Arial, sans-serif',
                fontSize: fs * 0.6,
                justification: 'right'
            });
        }

        var stars = '';
        for (var s = 0; s < 5; s++) stars += s < drill.difficulty ? '\u2605' : '\u2606';
        new paper.PointText({
            point: new paper.Point(rightX, topY + fs * 3.8),
            content: stars,
            fillColor: '#ffee00',
            fontFamily: 'Arial, sans-serif',
            fontSize: fs * 0.65,
            justification: 'right'
        });

        new paper.PointText({
            point: new paper.Point(felt.cx, bottomY),
            content: '\u2192 Next    \u2190 Prev    A Auto Solve    Shift+A Animate    M Menu    E Edit    N New    F Fullscreen    P Projection    K Calibrate    Del Remove Ball    Tap Trash',
            fillColor: 'rgba(255,255,255,0.2)',
            fontFamily: 'Arial, sans-serif',
            fontSize: fs * 0.55,
            justification: 'center'
        });
    }

    // ── Drill navigation ──

    function startDrill(idx) {
        PT.appMode = 'drill';
        PT.qrLayer.visible = false;
        activeDrillIdx = idx;
        loadDrill(activeDrills[idx]);
        showDrillHUD();
    }

    function startCustomDrill() {
        PT.appMode = 'drill';
        PT.qrLayer.visible = false;
        PT.qrLayer.removeChildren();
        PT.cueOverlay = null;
        PT.cueTarget = null;
        if (PT.hideCueTarget) PT.hideCueTarget();
        activeDrills = null;
        activeDrillIdx = 0;
        activeCategory = null;
        PT.clearBalls();
        PT.clearShotLines();
        PT.uiLayer.removeChildren();
        PT.rack9Ball();
        showDrillHUD();
        if (PT.toggleEditMode && !PT.editMode) PT.toggleEditMode();
        if (PT.enterNewDrillMode) PT.enterNewDrillMode();
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

    // ── Menu cursor navigation ──

    function menuNav(dir) {
        if (PT.appMode !== 'menu' && PT.appMode !== 'drillList' && PT.appMode !== 'physicsTests') return;
        if (dir === 'up') {
            menuCursor = Math.max(0, menuCursor - 1);
        } else if (dir === 'down') {
            menuCursor = Math.min(menuItemCount - 1, menuCursor + 1);
        }
        if (PT.appMode === 'menu') {
            var metrics = getMenuPagingMetrics();
            menuPage = Math.floor(menuCursor / metrics.perPage);
        }
        if (PT.appMode === 'menu') showMenu();
        else if (PT.appMode === 'drillList') showDrillList(drillListCatId, drillListPage);
        else if (PT.appMode === 'physicsTests') showPhysicsTestsMenu();
        PT.sendRemoteStatus();
    }

    function menuPageNav(dir) {
        if (PT.appMode !== 'menu') return;

        var metrics = getMenuPagingMetrics();
        var totalPages = Math.max(1, Math.ceil(menuItemCount / metrics.perPage));

        if (dir === 'prev') menuPage = Math.max(0, menuPage - 1);
        else if (dir === 'next') menuPage = Math.min(totalPages - 1, menuPage + 1);

        menuCursor = Math.max(0, Math.min(menuItemCount - 1, menuPage * metrics.perPage));
        showMenu();
        PT.sendRemoteStatus();
    }

    function menuSelect() {
        if (PT.appMode === 'menu') {
            var catalog = (typeof DRILL_CATALOG !== 'undefined') ? DRILL_CATALOG : [];
            var idx = 0;
            var selected = null;

            if (activeDrills && activeDrills.length) {
                if (menuCursor === idx) selected = { action: 'resume' };
                idx++;
            }

            if (!selected) {
                for (var c = 0; c < catalog.length; c++) {
                    if (menuCursor === idx) {
                        selected = { action: 'category', categoryId: catalog[c].id };
                        break;
                    }
                    idx++;
                }
            }

            if (!selected && menuCursor === idx) {
                selected = { action: 'freeplay' };
            }
            idx++;

            if (!selected && menuCursor === idx) {
                selected = { action: 'physicsTests' };
            }

            if (!selected) {
                PT.sendRemoteStatus();
                return;
            }

            if (selected.action === 'resume') {
                startDrill(activeDrillIdx);
                PT.sendRemoteStatus();
                return;
            }

            if (selected.action === 'category') {
                PT.appMode = 'drillList';
                PT.qrLayer.visible = false;
                PT.qrLayer.removeChildren();
                menuCursor = 0;
                showDrillList(selected.categoryId, 0);
            } else if (selected.action === 'freeplay') {
                PT.appMode = 'drill';
                PT.qrLayer.visible = false;
                PT.qrLayer.removeChildren();
                PT.cueOverlay = null;
                activeDrills = null;
                activeDrillIdx = 0;
                activeCategory = null;
                PT.clearBalls();
                PT.clearShotLines();
                PT.uiLayer.removeChildren();
                PT.rack9Ball();
            } else if (selected.action === 'physicsTests') {
                menuCursor = 0;
                showPhysicsTestsMenu();
            }
        } else if (PT.appMode === 'drillList') {
            var drills = drillCache[drillListCatId];
            if (!drills) return;
            var perPage = menuItemCount - 1;
            var startIdx = drillListPage * perPage;
            if (drills.length === 0 && drillListCatId === 'custom') {
                if (menuCursor === 0) startCustomDrill();
                else enterMenu();
                PT.sendRemoteStatus();
                return;
            }
            if (menuCursor < perPage) {
                var drillIdx = startIdx + menuCursor;
                if (drillIdx < drills.length) {
                    startDrill(drillIdx);
                }
            } else {
                menuCursor = 0;
                enterMenu();
            }
        } else if (PT.appMode === 'physicsTests') {
            if (menuCursor < physicsMenuItems.length) {
                runPhysicsMenuAction(physicsMenuItems[menuCursor].action);
                showPhysicsTestsMenu();
            } else {
                menuCursor = 0;
                enterMenu();
            }
        }
        PT.sendRemoteStatus();
    }

    function menuBack() {
        if (PT.appMode === 'drillList') {
            menuCursor = 0;
            enterMenu();
        } else if (PT.appMode === 'physicsTests') {
            if (PT.stopPhysicsVisualTests) PT.stopPhysicsVisualTests();
            menuCursor = 0;
            enterMenu();
        } else if (PT.appMode === 'drill') {
            menuCursor = 0;
            enterMenu();
        }
        PT.sendRemoteStatus();
    }

    // ── UI hit testing ──

    function hitUI(canvasPoint) {
        var hits = PT.uiLayer.hitTestAll(canvasPoint, { fill: true, stroke: true, tolerance: 5 });
        for (var i = 0; i < hits.length; i++) {
            var item = hits[i].item;
            while (item && !item.data.action) { item = item.parent; }
            if (item && item.data.action) return item.data;
        }
        return null;
    }

    // ── Exports ──
    PT.drillCache = drillCache;
    // Use getters/setters for mutable drill state
    Object.defineProperties(PT, {
        activeDrills:   { get: function () { return activeDrills; },   set: function (v) { activeDrills = v; } },
        activeDrillIdx: { get: function () { return activeDrillIdx; }, set: function (v) { activeDrillIdx = v; } },
        activeCategory: { get: function () { return activeCategory; }, set: function (v) { activeCategory = v; } },
        drillListPage:  { get: function () { return drillListPage; },  set: function (v) { drillListPage = v; } },
        drillListCatId: { get: function () { return drillListCatId; }, set: function (v) { drillListCatId = v; } },
        menuCursor:     { get: function () { return menuCursor; },     set: function (v) { menuCursor = v; } },
        menuItemCount:  { get: function () { return menuItemCount; },  set: function (v) { menuItemCount = v; } }
    });

    PT.serializeDrill = serializeDrill;
    PT.loadDrill = loadDrill;
    PT.exportDrill = exportDrill;
    PT.saveDrill = saveDrill;
    PT.saveAsNewDrill = saveAsNewDrill;
    PT.fetchDrills = fetchDrills;
    PT.getFeltBounds = getFeltBounds;
    PT.showMenu = showMenu;
    PT.showPhysicsTestsMenu = showPhysicsTestsMenu;
    PT.runPhysicsMenuAction = runPhysicsMenuAction;
    PT.enterMenu = enterMenu;
    PT.showDrillList = showDrillList;
    PT.showDrillHUD = showDrillHUD;
    PT.drawCueTarget = drawCueTarget;
    PT.setCueTarget = setCueTarget;
    PT.hideCueTarget = hideCueTarget;
    PT.hitCueTarget = hitCueTarget;
    PT.startDrill = startDrill;
    PT.startCustomDrill = startCustomDrill;
    PT.nextDrill = nextDrill;
    PT.prevDrill = prevDrill;
    PT.menuNav = menuNav;
    PT.menuPageNav = menuPageNav;
    PT.menuSelect = menuSelect;
    PT.menuBack = menuBack;
    PT.hitUI = hitUI;
})();

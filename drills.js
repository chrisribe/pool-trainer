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
        return {
            name: name || 'Untitled Drill',
            description: description || '',
            difficulty: difficulty || 1,
            balls: ballList
        };
    }

    function loadDrill(drill) {
        PT.cueOverlay = drill.cueOverlay || null;
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

        // Cue ball target
        if (drill.cueTarget) {
            var tx = rail + drill.cueTarget.x;
            var ty = rail + drill.cueTarget.y;
            PT.shotLayer.activate();

            new paper.Path.Circle({
                center: T(tx, ty),
                radius: S(2.5),
                strokeColor: 'rgba(0,229,255,0.25)',
                strokeWidth: S(0.08),
                fillColor: null
            });
            new paper.Path.Circle({
                center: T(tx, ty),
                radius: S(1.5),
                strokeColor: 'rgba(0,229,255,0.35)',
                strokeWidth: S(0.08),
                fillColor: null
            });
            new paper.Path.Circle({
                center: T(tx, ty),
                radius: S(0.6),
                strokeColor: 'rgba(0,229,255,0.5)',
                strokeWidth: S(0.1),
                fillColor: 'rgba(0,229,255,0.12)'
            });
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

    function showMenu() {
        PT.appMode = 'menu';
        PT.clearBalls();
        PT.clearShotLines();
        PT.uiLayer.removeChildren();
        PT.uiLayer.activate();

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

        // Resume item when drills are active
        var hasResume = !!(activeDrills && activeDrills.length);
        var resumeOffset = 0;
        if (hasResume) {
            resumeOffset = 1;
            var rY = startY;
            var rSelected = (menuCursor === 0);
            var drill = activeDrills[activeDrillIdx];
            var rLabel = '\u25b6 Resume: ' + drill.name + '  (' + (activeDrillIdx + 1) + '/' + activeDrills.length + ')';
            new paper.Path.Rectangle({
                from: new paper.Point(cx - btnW / 2, rY),
                to: new paper.Point(cx + btnW / 2, rY + btnH),
                radius: 8,
                fillColor: rSelected ? 'rgba(0,255,100,0.2)' : 'rgba(0,255,100,0.08)',
                strokeColor: rSelected ? '#00ff66' : 'rgba(0,255,100,0.4)',
                strokeWidth: rSelected ? 2 : 1
            }).data = { action: 'resume' };
            new paper.PointText({
                point: new paper.Point(cx, rY + btnH * 0.65),
                content: rLabel,
                fillColor: '#00ff66',
                fontFamily: 'Arial, sans-serif',
                fontWeight: 'bold',
                fontSize: btnH * 0.35,
                justification: 'center'
            }).data = { action: 'resume' };
            if (rSelected) {
                new paper.PointText({
                    point: new paper.Point(cx - btnW / 2 - btnH * 0.4, rY + btnH * 0.65),
                    content: '\u25b6',
                    fillColor: '#00ff66',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.4,
                    justification: 'center'
                });
            }
            startY += btnH + gap * 2;
        }

        // Total items = resume? + categories + free play
        menuItemCount = resumeOffset + catalog.length + 1;
        if (menuCursor >= menuItemCount) menuCursor = menuItemCount - 1;
        if (menuCursor < 0) menuCursor = 0;

        catalog.forEach(function (cat, i) {
            var y = startY + i * (btnH + gap);
            var isSelected = ((i + resumeOffset) === menuCursor);

            var btn = new paper.Path.Rectangle({
                from: new paper.Point(cx - btnW / 2, y),
                to: new paper.Point(cx + btnW / 2, y + btnH),
                radius: 8,
                fillColor: isSelected ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                strokeColor: isSelected ? '#ffffff' : 'rgba(255,255,255,0.3)',
                strokeWidth: isSelected ? 2 : 1
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

            if (isSelected) {
                new paper.PointText({
                    point: new paper.Point(cx - btnW / 2 - btnH * 0.4, y + btnH * 0.65),
                    content: '\u25b6',
                    fillColor: '#ffffff',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: btnH * 0.4,
                    justification: 'center'
                });
            }
        });

        // Free play button
        var fpIdx = resumeOffset + catalog.length;
        var fpY = startY + catalog.length * (btnH + gap) + gap;
        var fpSelected = (menuCursor === fpIdx);
        var fpBtn = new paper.Path.Rectangle({
            from: new paper.Point(cx - btnW / 2, fpY),
            to: new paper.Point(cx + btnW / 2, fpY + btnH),
            radius: 8,
            fillColor: fpSelected ? 'rgba(0,229,255,0.2)' : 'rgba(0,229,255,0.1)',
            strokeColor: fpSelected ? '#00e5ff' : 'rgba(0,229,255,0.4)',
            strokeWidth: fpSelected ? 2 : 1
        });
        fpBtn.data = { action: 'freeplay' };

        new paper.PointText({
            point: new paper.Point(cx, fpY + btnH * 0.65),
            content: '\ud83c\udfb1  Free Play',
            fillColor: '#00e5ff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: btnH * 0.4,
            justification: 'center'
        }).data = { action: 'freeplay' };

        if (fpSelected) {
            new paper.PointText({
                point: new paper.Point(cx - btnW / 2 - btnH * 0.4, fpY + btnH * 0.65),
                content: '\u25b6',
                fillColor: '#00e5ff',
                fontFamily: 'Arial, sans-serif',
                fontSize: btnH * 0.4,
                justification: 'center'
            });
        }

        // Keyboard hint
        new paper.PointText({
            point: new paper.Point(cx, fb.bottom - fh * 0.12),
            content: '\u2191\u2193 Navigate   Enter Select   F Fullscreen   P Projection   K Calibrate',
            fillColor: 'rgba(255,255,255,0.25)',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.min(fw, fh) * 0.02,
            justification: 'center'
        });

        // Show QR layer
        PT.qrLayer.visible = true;
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
            activeCategory = cat.name;
            activeDrills = drills;
            activeDrillIdx = 0;
            drillListCatId = categoryId;
            drillListPage = page || 0;

            PT.uiLayer.removeChildren();
            PT.uiLayer.activate();

            var fb = getFeltBounds();
            var fw = fb.right - fb.left;
            var fh = fb.bottom - fb.top;
            var cx = (fb.left + fb.right) / 2;

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
            var listBottom = fb.bottom - fh * 0.12;
            var available = listBottom - listTop;
            var itemH = btnH + gap;
            var perPage = Math.max(1, Math.floor(available / itemH));
            var totalPages = Math.ceil(drills.length / perPage);
            var pg = Math.min(drillListPage, totalPages - 1);
            var startIdx = pg * perPage;
            var endIdx = Math.min(startIdx + perPage, drills.length);

            var pageItems = endIdx - startIdx;
            menuItemCount = pageItems + 1;
            if (menuCursor >= menuItemCount) menuCursor = menuItemCount - 1;
            if (menuCursor < 0) menuCursor = 0;

            for (var j = startIdx; j < endIdx; j++) {
                var drill = drills[j];
                var row = j - startIdx;
                var y = listTop + row * itemH;
                var isSelected = (row === menuCursor);

                var stars = '';
                for (var s = 0; s < 5; s++) stars += s < drill.difficulty ? '\u2605' : '\u2606';

                var btn = new paper.Path.Rectangle({
                    from: new paper.Point(cx - btnW / 2, y),
                    to: new paper.Point(cx + btnW / 2, y + btnH),
                    radius: 6,
                    fillColor: isSelected ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
                    strokeColor: isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)',
                    strokeWidth: isSelected ? 2 : 1
                });
                btn.data = { action: 'loadDrill', drillIdx: j };

                if (isSelected) {
                    new paper.PointText({
                        point: new paper.Point(cx - btnW / 2 - btnH * 0.35, y + btnH * 0.65),
                        content: '\u25b6',
                        fillColor: '#ffffff',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: btnH * 0.36,
                        justification: 'center'
                    });
                }

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
            var navBtnW = btnH * 1.2;
            var backW = btnW * 0.3;
            var backSelected = (menuCursor === pageItems);

            var bkL = cx - btnW / 2;
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
                var navR = cx + btnW / 2;
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

        if (!activeDrills || !activeDrills[activeDrillIdx]) return;
        var drill = activeDrills[activeDrillIdx];
        var rail = cfg.railWidth;
        var pw = cfg.playWidth;
        var ph = cfg.playHeight;

        var c1 = T(rail, rail);
        var c2 = T(rail + pw, rail + ph);
        var sL = Math.min(c1.x, c2.x);
        var sR = Math.max(c1.x, c2.x);
        var sT = Math.min(c1.y, c2.y);
        var sB = Math.max(c1.y, c2.y);
        var margin = S(2);
        var fs = S(1.4);

        new paper.PointText({
            point: new paper.Point(sL + margin, sT + margin + fs),
            content: drill.name,
            fillColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: fs * 1.1,
            justification: 'left'
        });

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

        new paper.PointText({
            point: new paper.Point(sR - margin, sT + margin + fs),
            content: (activeDrillIdx + 1) + ' / ' + activeDrills.length,
            fillColor: 'rgba(255,255,255,0.6)',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 'bold',
            fontSize: fs * 1.0,
            justification: 'right'
        });

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

        var stars = '';
        for (var s = 0; s < 5; s++) stars += s < drill.difficulty ? '\u2605' : '\u2606';
        new paper.PointText({
            point: new paper.Point(sR - margin, sT + margin + fs * 3.8),
            content: stars,
            fillColor: '#ffee00',
            fontFamily: 'Arial, sans-serif',
            fontSize: fs * 0.65,
            justification: 'right'
        });

        new paper.PointText({
            point: new paper.Point((sL + sR) / 2, sB - margin),
            content: '\u2192 Next    \u2190 Prev    M Menu    Del Remove Ball    Tap Trash',
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
        if (PT.appMode !== 'menu' && PT.appMode !== 'drillList') return;
        if (dir === 'up') {
            menuCursor = Math.max(0, menuCursor - 1);
        } else if (dir === 'down') {
            menuCursor = Math.min(menuItemCount - 1, menuCursor + 1);
        }
        if (PT.appMode === 'menu') showMenu();
        else if (PT.appMode === 'drillList') showDrillList(drillListCatId, drillListPage);
        PT.sendRemoteStatus();
    }

    function menuSelect() {
        if (PT.appMode === 'menu') {
            var catalog = (typeof DRILL_CATALOG !== 'undefined') ? DRILL_CATALOG : [];
            var hasResume = !!(activeDrills && activeDrills.length);
            var resumeOffset = hasResume ? 1 : 0;
            if (hasResume && menuCursor === 0) {
                startDrill(activeDrillIdx);
                PT.sendRemoteStatus();
                return;
            }
            var catIdx = menuCursor - resumeOffset;
            if (catIdx < catalog.length) {
                var catId = catalog[catIdx].id;
                PT.appMode = 'drillList';
                PT.qrLayer.visible = false;
                PT.qrLayer.removeChildren();
                menuCursor = 0;
                showDrillList(catId, 0);
            } else if (catIdx === catalog.length) {
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
            }
        } else if (PT.appMode === 'drillList') {
            var drills = drillCache[drillListCatId];
            if (!drills) return;
            var perPage = menuItemCount - 1;
            var startIdx = drillListPage * perPage;
            if (menuCursor < perPage) {
                var drillIdx = startIdx + menuCursor;
                if (drillIdx < drills.length) {
                    startDrill(drillIdx);
                }
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
    PT.fetchDrills = fetchDrills;
    PT.getFeltBounds = getFeltBounds;
    PT.showMenu = showMenu;
    PT.enterMenu = enterMenu;
    PT.showDrillList = showDrillList;
    PT.showDrillHUD = showDrillHUD;
    PT.startDrill = startDrill;
    PT.nextDrill = nextDrill;
    PT.prevDrill = prevDrill;
    PT.menuNav = menuNav;
    PT.menuSelect = menuSelect;
    PT.menuBack = menuBack;
    PT.hitUI = hitUI;
})();

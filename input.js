/* ================================================================
   Pool Trainer — input.js
   Pointer tool handlers (mouse/touch), keyboard shortcuts
   ================================================================ */

(function () {
    'use strict';

    var balls = PT.balls;
    var deleteTimer = null;
    var deleteCandidate = null;
    var deleteStartPoint = null;

    function clearDeleteTimer() {
        if (deleteTimer) {
            clearTimeout(deleteTimer);
            deleteTimer = null;
        }
        deleteCandidate = null;
        deleteStartPoint = null;
    }

    // ── Pointer tool handlers ──

    PT.pointerTool.onMouseDown = function (event) {
        clearDeleteTimer();

        // Calibration mode: handle dragging
        if (PT.calibrationMode) {
            PT.calibrationDragIdx = PT.hitCalibrationHandle(event.point);
            return;
        }

        // Check UI layer first (menu buttons)
        if (PT.appMode === 'menu' || PT.appMode === 'drillList') {
            var uiHit = PT.hitUI(event.point);
            if (uiHit) {
                if (uiHit.action === 'category') {
                    PT.appMode = 'drillList';
                    PT.showDrillList(uiHit.categoryId, 0);
                } else if (uiHit.action === 'loadDrill') {
                    PT.startDrill(uiHit.drillIdx);
                } else if (uiHit.action === 'backToMenu') {
                    PT.enterMenu();
                } else if (uiHit.action === 'prevPage') {
                    PT.showDrillList(PT.drillListCatId, PT.drillListPage - 1);
                } else if (uiHit.action === 'nextPage') {
                    PT.showDrillList(PT.drillListCatId, PT.drillListPage + 1);
                } else if (uiHit.action === 'freeplay') {
                    PT.appMode = 'drill';
                    PT.qrLayer.visible = false;
                    PT.qrLayer.removeChildren();
                    PT.cueOverlay = null;
                    PT.activeDrills = null;
                    PT.activeDrillIdx = 0;
                    PT.activeCategory = null;
                    PT.clearBalls();
                    PT.clearShotLines();
                    PT.rack9Ball();
                    PT.showDrillHUD();
                } else if (uiHit.action === 'newCustomDrill') {
                    if (PT.startCustomDrill) PT.startCustomDrill();
                } else if (uiHit.action === 'resume') {
                    PT.startDrill(PT.activeDrillIdx);
                }
                return;
            }
        }

        // In drill mode — tapping trash icon deletes the selected ball
        if (PT.appMode === 'drill' && PT.hitDeleteIcon && PT.hitDeleteIcon(event.point)) {
            PT.deleteSelectedBall();
            return;
        }

        if (PT.clearDeleteIcon) PT.clearDeleteIcon();

        // In drill mode — dragging cue target, balls, or aiming
        if (PT.appMode === 'drill' && PT.hitCueTarget) {
            var targetHit = PT.hitCueTarget(event.point);
            if (targetHit && PT.cueTarget) {
                PT.deselectBall();
                PT.dragTarget = { type: 'cueTarget' };
                var rail = PT.cfg.railWidth;
                var centerTarget = PT.T(rail + PT.cueTarget.x, rail + PT.cueTarget.y);
                PT.dragOffset = new paper.Point(
                    event.point.x - centerTarget.x,
                    event.point.y - centerTarget.y
                );
                PT.clearShotLines();
                PT.aimState = null;
                return;
            }
        }

        // In drill mode — dragging balls or aiming
        var b = PT.hitBall(event.point);
        if (b) {
            PT.selectBall(b.num);
            PT.dragTarget = b;
            var center = PT.T(b.tableX, b.tableY);
            PT.dragOffset = new paper.Point(
                event.point.x - center.x,
                event.point.y - center.y
            );
            PT.clearShotLines();
            PT.aimState = null;

            // Touch-friendly delete: long-press a selected ball to show trash icon.
            deleteCandidate = b;
            deleteStartPoint = event.point.clone();
            deleteTimer = setTimeout(function () {
                if (deleteCandidate && PT.selectedBall === deleteCandidate.num) {
                    if (PT.showDeleteIcon) PT.showDeleteIcon(deleteCandidate);
                }
                clearDeleteTimer();
            }, 650);
        } else if (balls[0] && Object.keys(balls).length > 1) {
            PT.deselectBall();
            PT.aimState = { aiming: true };
            var tablePos = PT.invT(event.point);
            PT.drawShotLines(balls[0].tableX, balls[0].tableY, tablePos.x, tablePos.y);
        } else {
            PT.deselectBall();
            PT.clearShotLines();
            PT.aimState = null;
        }
    };

    PT.pointerTool.onMouseDrag = function (event) {
        if (deleteCandidate && deleteStartPoint) {
            if (event.point.getDistance(deleteStartPoint) > 10) {
                clearDeleteTimer();
                if (PT.clearDeleteIcon) PT.clearDeleteIcon();
            }
        }

        // Calibration drag
        if (PT.calibrationMode && PT.calibrationDragIdx >= 0) {
            var keys = ['tl', 'tr', 'br', 'bl'];
            PT.calibrationCorners[keys[PT.calibrationDragIdx]] = { x: event.point.x, y: event.point.y };
            PT.drawCalibrationHandles();
            return;
        }

        if (PT.aimState && PT.aimState.aiming && balls[0]) {
            var tablePos = PT.invT(event.point);
            PT.drawShotLines(balls[0].tableX, balls[0].tableY, tablePos.x, tablePos.y);
            return;
        }

        if (!PT.dragTarget) return;
        if (PT.dragTarget.type === 'cueTarget') {
            var adjustedTarget = new paper.Point(
                event.point.x - PT.dragOffset.x,
                event.point.y - PT.dragOffset.y
            );
            var tablePosTarget = PT.invT(adjustedTarget);
            var clampedTarget = PT.clampToPlayingSurface(tablePosTarget.x, tablePosTarget.y);
            var railTarget = PT.cfg.railWidth;
            if (PT.setCueTarget) PT.setCueTarget(clampedTarget.x - railTarget, clampedTarget.y - railTarget);
            return;
        }
        var adjusted = new paper.Point(
            event.point.x - PT.dragOffset.x,
            event.point.y - PT.dragOffset.y
        );
        var tablePos2 = PT.invT(adjusted);
        var clamped = PT.clampToPlayingSurface(tablePos2.x, tablePos2.y);
        PT.dragTarget.tableX = clamped.x;
        PT.dragTarget.tableY = clamped.y;
        PT.dragTarget.group.remove();
        PT.ballLayer.activate();
        PT.dragTarget.group = PT.createBallGroup(PT.dragTarget.num, clamped.x, clamped.y);
        if (PT.updateSelectionRingPosition) {
            PT.updateSelectionRingPosition(PT.dragTarget);
        }
        if (PT.updateDeleteIconPosition) {
            PT.updateDeleteIconPosition(PT.dragTarget);
        }
    };

    PT.pointerTool.onMouseUp = function () {
        clearDeleteTimer();
        if (PT.calibrationMode) {
            PT.calibrationDragIdx = -1;
            return;
        }
        if (PT.aimState) PT.aimState = null;
        PT.dragTarget = null;
        PT.dragOffset = null;
    };

    // ── Keyboard shortcuts ──
    document.addEventListener('keydown', function (e) {
        if (e.key === 'f' || e.key === 'F') PT.enterFullscreen();
        if (e.key === 'p' || e.key === 'P') {
            PT.projectionMode = !PT.projectionMode;
            PT.drawTable();
            PT.redrawBalls();
        }
        if (e.key === 'K' && e.shiftKey) {
            PT.resetCalibration();
            return;
        }
        if (e.key === 'k' || e.key === 'K') {
            if (PT.calibrationMode) {
                PT.exitCalibrationMode(true);
            } else {
                PT.enterCalibrationMode();
            }
            return;
        }

        if (PT.appMode === 'drill') {
            // Edit mode: arrow keys navigate, E exits
            if (PT.editMode) {
                // New drill sub-mode
                if (PT.newDrillMode) {
                    if (e.key === 'ArrowUp')   { e.preventDefault(); PT.newDrillCursor = Math.max(0, PT.newDrillCursor - 1); PT.drawNewDrillPanel(); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); PT.newDrillCursor = Math.min(PT.newDrillFields.length - 1, PT.newDrillCursor + 1); PT.drawNewDrillPanel(); }
                    if (e.key === 'ArrowLeft')  { e.preventDefault(); PT.newDrillAdjust(-1); PT.drawNewDrillPanel(); }
                    if (e.key === 'ArrowRight') { e.preventDefault(); PT.newDrillAdjust(1); PT.drawNewDrillPanel(); }
                    if (e.key === 's' || e.key === 'S') { PT.confirmNewDrill(); }
                    if (e.key === 'Escape') { PT.cancelNewDrill(); }
                    return;
                }
                if (e.key === 'ArrowUp')   { e.preventDefault(); PT.editCursor = Math.max(0, PT.editCursor - 1); PT.refreshEditView(); }
                if (e.key === 'ArrowDown') { e.preventDefault(); PT.editCursor = Math.min(PT.editFields.length - 1, PT.editCursor + 1); PT.refreshEditView(); }
                if (e.key === 'ArrowLeft')  { e.preventDefault(); PT.editAdjust(-1); PT.refreshEditView(); }
                if (e.key === 'ArrowRight') { e.preventDefault(); PT.editAdjust(1); PT.refreshEditView(); }
                if (e.key === 'e' || e.key === 'E' || e.key === 'Escape') { PT.toggleEditMode(); }
                if (e.key === 's' || e.key === 'S') {
                    if (PT.activeDrills && PT.activeDrills.length) PT.saveDrill(PT.showSaveFeedback);
                }
                if (e.key === 'n' || e.key === 'N') { PT.enterNewDrillMode(); }
                // Number keys: drop/select ball in edit mode (Shift+1-6 => 10-15)
                if (e.code && e.code.indexOf('Digit') === 0) {
                    var digit = parseInt(e.code.slice(5), 10);
                    if (!isNaN(digit)) {
                        var ballNum = digit;
                        if (e.shiftKey && digit >= 1 && digit <= 6) ballNum = 9 + digit;
                        PT.dropBall(ballNum);
                    }
                }
                return;
            }
            if (e.key === 'ArrowRight' || e.key === ' ') PT.nextDrill();
            if (e.key === 'ArrowLeft') PT.prevDrill();
            if (e.key === 'm' || e.key === 'M' || e.key === 'Escape') PT.menuBack();
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); PT.deleteSelectedBall(); }
            if (e.key === '9') { PT.activeDrills = null; PT.rack9Ball(); PT.showDrillHUD(); }
            if (e.key === '8') { PT.activeDrills = null; PT.rack8Ball(); PT.showDrillHUD(); }
            if (e.key === 'c' || e.key === 'C') PT.clearBalls();
            if (e.key === 'e' || e.key === 'E') PT.toggleEditMode();
            if (e.key === 'n' || e.key === 'N') {
                // Enter edit mode then immediately start new drill flow
                if (!PT.editMode) PT.toggleEditMode();
                PT.enterNewDrillMode();
            }
        } else if (PT.appMode === 'menu' || PT.appMode === 'drillList') {
            if (e.key === 'ArrowUp') { e.preventDefault(); PT.menuNav('up'); }
            if (e.key === 'ArrowDown') { e.preventDefault(); PT.menuNav('down'); }
            if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); PT.menuSelect(); }
            if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'Backspace') {
                if (PT.appMode === 'drillList') { e.preventDefault(); PT.menuBack(); }
            }
        }
    });
})();

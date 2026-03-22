/* ================================================================
   Pool Trainer — remote.js
   Socket.IO remote control, QR code, command dispatch
   ================================================================ */

(function () {
    'use strict';

    var socket = null;
    var cachedQR = null;
    var appId = 'main-' + Math.random().toString(36).slice(2, 10);

    // QR code on its own layer
    function drawQRCode() {
        PT.qrLayer.removeChildren();
        PT.qrLayer.activate();
        PT.qrLayer.visible = (PT.appMode === 'menu');
        if (PT.appMode !== 'menu') return;

        var fb = PT.getFeltBounds();
        var fw = fb.right - fb.left;
        var fh = fb.bottom - fb.top;
        var qrSize = Math.min(fw, fh) * 0.14;
        var qrX = fb.right - qrSize * 0.8;
        var qrY = fb.top + fh * 0.5;

        function render(qrDataUrl) {
            if (PT.appMode !== 'menu') return;
            PT.qrLayer.activate();
            var raster = new paper.Raster({
                source: qrDataUrl,
                position: new paper.Point(qrX, qrY)
            });
            raster.onLoad = function () {
                raster.size = new paper.Size(qrSize, qrSize);
            };
            new paper.PointText({
                point: new paper.Point(qrX, qrY - qrSize / 2 - Math.min(fw, fh) * 0.015),
                content: '\ud83d\udcf1 Scan to control',
                fillColor: 'rgba(255,255,255,0.4)',
                fontFamily: 'Arial, sans-serif',
                fontSize: Math.min(fw, fh) * 0.018,
                justification: 'center'
            });
        }

        if (cachedQR) { render(cachedQR.qr); }
        else { fetchRemoteQR(function (url) { render(url); }); }
    }

    function fetchRemoteQR(callback) {
        if (cachedQR) { callback(cachedQR.qr, cachedQR.url); return; }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/remote-qr', true);
        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    cachedQR = JSON.parse(xhr.responseText);
                    callback(cachedQR.qr, cachedQR.url);
                } catch (e) {}
            }
        };
        xhr.send();
    }

    function connectRemote() {
        socket = io({ query: { role: 'main' } });

        socket.on('cmd', function (data) {
            handleRemoteCommand(data.action);
        });
    }

    function handleRemoteCommand(action) {
        switch (action) {
            case 'up':         PT.menuNav('up'); return;
            case 'down':       PT.menuNav('down'); return;
            case 'select':     PT.menuSelect(); return;
            case 'back':       PT.menuBack(); return;
            case 'next':       PT.nextDrill(); break;
            case 'prev':       PT.prevDrill(); break;
            case 'menu':       PT.menuBack(); break;
            case 'edit':
                if (PT.toggleEditMode) { PT.toggleEditMode(); }
                break;
            case 'editUp':
                if (PT.editMode) { PT.editCursor = Math.max(0, PT.editCursor - 1); PT.refreshEditView(); }
                break;
            case 'editDown':
                if (PT.editMode) { PT.editCursor = Math.min(PT.editFields.length - 1, PT.editCursor + 1); PT.refreshEditView(); }
                break;
            case 'editLeft':
                if (PT.editMode && PT.editAdjust) { PT.editAdjust(-1); PT.refreshEditView(); }
                break;
            case 'editRight':
                if (PT.editMode && PT.editAdjust) { PT.editAdjust(1); PT.refreshEditView(); }
                break;
            case 'editSave':
                if (PT.saveDrill) { PT.saveDrill(PT.showSaveFeedback); }
                break;
            case 'editDone':
                if (PT.toggleEditMode) { PT.toggleEditMode(); }
                break;
            case 'editNew':
                if (PT.saveAsNewDrill) {
                    var name = prompt('New drill name:');
                    if (name) PT.saveAsNewDrill(name, PT.showSaveFeedback);
                }
                break;
            case 'rack9':
                PT.appMode = 'drill';
                PT.activeDrills = null;
                PT.qrLayer.visible = false;
                PT.qrLayer.removeChildren();
                PT.rack9Ball();
                PT.uiLayer.removeChildren();
                break;
            case 'rack8':
                PT.appMode = 'drill';
                PT.activeDrills = null;
                PT.qrLayer.visible = false;
                PT.qrLayer.removeChildren();
                PT.rack8Ball();
                PT.uiLayer.removeChildren();
                break;
            case 'clear':      PT.clearBalls(); PT.clearShotLines(); break;
            case 'projection':
                PT.projectionMode = !PT.projectionMode;
                PT.drawTable();
                PT.redrawBalls();
                break;
            case 'fullscreen': PT.enterFullscreen(); break;
            case 'requestStatus': break;
        }
        sendRemoteStatus();
    }

    function sendRemoteStatus() {
        if (!socket || !socket.connected) return;
        var text = '';
        if (PT.appMode === 'drill' && PT.activeDrills) {
            var drill = PT.activeDrills[PT.activeDrillIdx];
            text = drill.name + '  (' + (PT.activeDrillIdx + 1) + '/' + PT.activeDrills.length + ')';
            if (PT.activeCategory) text = PT.activeCategory + ': ' + text;
        } else if (PT.appMode === 'drill') {
            text = 'Free Play';
        } else if (PT.appMode === 'menu') {
            text = 'Menu';
        } else if (PT.appMode === 'drillList') {
            text = PT.activeCategory || 'Drills';
        }
        var remoteMode = PT.editMode ? 'edit' : (PT.appMode === 'drill') ? 'drill' : 'menu';
        socket.emit('cmd', {
            type: 'status',
            text: text,
            mode: remoteMode,
            hasDrills: !!(PT.activeDrills && PT.activeDrills.length),
            appId: appId
        });
    }

    function showSaveFeedback(ok, msg) {
        PT.uiLayer.activate();
        var fb = PT.getFeltBounds();
        var fw = fb.right - fb.left;
        var cx = fb.left + fw / 2;
        var cy = fb.top + (fb.bottom - fb.top) * 0.5;
        var toast = new paper.Group();
        var pad = fw * 0.12;
        toast.addChild(new paper.Path.Rectangle({
            from: new paper.Point(cx - pad, cy - pad * 0.35),
            to: new paper.Point(cx + pad, cy + pad * 0.35),
            radius: PT.S(0.3),
            fillColor: ok ? 'rgba(46,204,113,0.9)' : 'rgba(231,76,60,0.9)'
        }));
        toast.addChild(new paper.PointText({
            point: new paper.Point(cx, cy + fw * 0.012),
            content: msg || (ok ? 'Saved!' : 'Error'),
            fillColor: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontSize: Math.max(12, fw * 0.03),
            fontWeight: 'bold',
            justification: 'center'
        }));
        setTimeout(function () { toast.remove(); }, 1500);
    }

    function toggleEditMode() {
        if (PT.appMode !== 'drill') return;
        PT.editMode = !PT.editMode;
        if (PT.editMode) {
            // Ensure overlay exists
            if (!PT.cueOverlay) {
                PT.cueOverlay = { show: true, tip: { x: 0, y: 0 }, power: 0.5 };
            }
            PT.editCursor = 0;
            refreshEditView();
        } else {
            // Exiting: clear edit panel, reload drill to restore aim lines
            if (PT._editPanelGroup) { PT._editPanelGroup.remove(); PT._editPanelGroup = null; }
            if (PT.activeDrills && PT.activeDrills.length) {
                PT.startDrill(PT.activeDrillIdx);
            }
            sendRemoteStatus();
        }
    }

    function refreshEditView() {
        // Redraw edit panel and overlay preview
        if (PT.drawEditPanel) PT.drawEditPanel();
        if (PT.drawEditOverlayPreview) PT.drawEditOverlayPreview();
        sendRemoteStatus();
    }

    // ── Exports ──
    PT.drawQRCode = drawQRCode;
    PT.sendRemoteStatus = sendRemoteStatus;
    PT.connectRemote = connectRemote;
    PT.toggleEditMode = toggleEditMode;
    PT.refreshEditView = refreshEditView;
    PT.showSaveFeedback = showSaveFeedback;
})();

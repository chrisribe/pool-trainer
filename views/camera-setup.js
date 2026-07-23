/* ================================================================
   Pool Trainer - views/camera-setup.js
   Phase 1: Camera permission + feed preview + calibration trigger
   ================================================================ */

(function () {
    'use strict';

    var overlay = null;

    function show() {
        if (overlay) { overlay.style.display = 'flex'; return; }

        overlay = document.createElement('div');
        overlay.id = 'camera-setup-overlay';
        overlay.style.cssText = [
            'position:fixed', 'inset:0',
            'background:rgba(0,0,0,0.82)',
            'display:flex', 'flex-direction:column',
            'align-items:center', 'justify-content:center',
            'z-index:100', 'color:#fff',
            'font-family:Arial,sans-serif', 'gap:18px',
            'padding:24px', 'box-sizing:border-box'
        ].join(';');

        var title = document.createElement('h2');
        title.textContent = 'Camera Setup';
        title.style.margin = '0';

        var instructions = document.createElement('p');
        instructions.style.cssText = 'text-align:center;max-width:320px;opacity:0.8;margin:0;font-size:15px';
        instructions.textContent = 'Mount your phone on a tripod above the table. Grant camera access, confirm the full table is visible.';

        var startBtn = makeBtn('Enable Camera', '#27ae60', function () {
            startBtn.textContent = 'Starting...';
            startBtn.disabled = true;
            PT.camera.start()
                .then(function () {
                    if (PT) { PT.cameraMode = true; PT.drawTable(); PT.redrawBalls(); }
                    statusEl.textContent = 'Camera active. Check the table is fully visible behind this overlay.';
                    statusEl.style.color = '#2ecc71';
                    startBtn.style.display = 'none';
                    calibBtn.style.display = 'inline-block';
                    doneBtn.style.display = 'inline-block';
                })
                .catch(function (err) {
                    statusEl.textContent = 'Camera error: ' + err.message;
                    statusEl.style.color = '#e74c3c';
                    startBtn.textContent = 'Retry';
                    startBtn.disabled = false;
                });
        });

        var calibBtn = makeBtn('Calibrate Corners', '#2980b9', function () {
            hide();
            PT.enterCalibrationMode();
        });
        calibBtn.style.display = 'none';

        var doneBtn = makeBtn('Done', '#555', function () {
            hide();
        });
        doneBtn.style.display = 'none';

        var statusEl = document.createElement('p');
        statusEl.style.cssText = 'font-size:13px;opacity:0.7;margin:0;text-align:center';
        statusEl.textContent = 'Camera not started';

        overlay.appendChild(title);
        overlay.appendChild(instructions);
        overlay.appendChild(startBtn);
        overlay.appendChild(calibBtn);
        overlay.appendChild(doneBtn);
        overlay.appendChild(statusEl);
        document.body.appendChild(overlay);
    }

    function hide() {
        if (overlay) overlay.style.display = 'none';
    }

    function makeBtn(label, bg, onclick) {
        var btn = document.createElement('button');
        btn.textContent = label;
        btn.onclick = onclick;
        btn.style.cssText = [
            'padding:12px 28px',
            'background:' + bg,
            'color:#fff', 'border:none',
            'border-radius:8px', 'font-size:16px',
            'cursor:pointer', 'min-width:200px'
        ].join(';');
        return btn;
    }

    PT.cameraSetup = { show: show, hide: hide };

})();

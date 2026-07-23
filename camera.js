/* ================================================================
   Pool Trainer - camera.js
   Phase 1: getUserMedia feed rendered behind the canvas
   ================================================================ */

(function () {
    'use strict';

    var videoEl = null;
    var stream = null;
    var cameraActive = false;

    function createVideoElement() {
        if (videoEl) return;
        videoEl = document.createElement('video');
        videoEl.setAttribute('autoplay', '');
        videoEl.setAttribute('playsinline', '');
        videoEl.setAttribute('muted', '');
        videoEl.style.cssText = [
            'position:fixed',
            'top:0', 'left:0',
            'width:100%', 'height:100%',
            'object-fit:cover',
            'z-index:-1',
            'opacity:0.55',
            'pointer-events:none'
        ].join(';');
        document.body.insertBefore(videoEl, document.body.firstChild);
    }

    function start() {
        return new Promise(function (resolve, reject) {
            if (cameraActive) { resolve(); return; }
            var constraints = {
                video: {
                    facingMode: { ideal: 'environment' },
                    width:  { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };
            navigator.mediaDevices.getUserMedia(constraints)
                .then(function (s) {
                    stream = s;
                    createVideoElement();
                    videoEl.srcObject = stream;
                    cameraActive = true;
                    resolve(stream);
                })
                .catch(function (err) {
                    console.error('[camera] getUserMedia failed:', err);
                    reject(err);
                });
        });
    }

    function stop() {
        if (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            stream = null;
        }
        if (videoEl) {
            videoEl.srcObject = null;
            videoEl.style.display = 'none';
        }
        cameraActive = false;
    }

    function show() { if (videoEl) videoEl.style.display = 'block'; }
    function hide() { if (videoEl) videoEl.style.display = 'none'; }
    function setOpacity(val) { if (videoEl) videoEl.style.opacity = val; }
    function isActive() { return cameraActive; }

    /** Grab current frame as ImageData (for ball-detector.js) */
    function snapshot(w, h) {
        w = w || 640; h = h || 360;
        if (!videoEl || !cameraActive) return null;
        var off = document.createElement('canvas');
        off.width = w; off.height = h;
        var ctx = off.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h);
    }

    PT.camera = { start, stop, show, hide, setOpacity, snapshot, isActive };

})();

/* ================================================================
   Pool Trainer — init.js
   Startup sequence (runs after all modules are loaded)
   ================================================================ */

(function () {
    'use strict';

    PT.loadCalibration();
    PT.drawTable();
    PT.connectRemote();
    PT.enterMenu();
    paper.view.draw();
})();

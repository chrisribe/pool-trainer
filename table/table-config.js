/**
 * Table dimensions in inches (playing surface only).
 * Rail width, pocket geometry, and diamond positions per WPA specifications
 * (Effective November 2001).
 */
var TABLE_CONFIG = {

    // ── Presets (playing surface dimensions in inches) ──
    tables: {
        '12-foot':  { width: 70, height: 140, label: '12-ft (snooker)' },
        '10-foot':  { width: 56, height: 112, label: '10-ft (oversized)' },
        '9-foot':   { width: 50, height: 100, label: '9-ft (WPA regulation)', sightSpacing: 12.5 },
        '8-foot+':  { width: 46, height: 92,  label: '8-ft+ (WPA pro 8)',     sightSpacing: 11.5 },
        '8-foot':   { width: 44, height: 88,  label: '8-ft (home)' },
        '7-foot+':  { width: 40, height: 80,  label: '7-ft+ (large bar box)' },
        '7-foot':   { width: 38, height: 76,  label: '7-ft (bar box)' },
        '6-foot':   { width: 36, height: 72,  label: '6-ft (small bar box)' }
    },

    // Active table
    active: '8-foot',

    get playWidth()  { return this.tables[this.active].width; },
    get playHeight() { return this.tables[this.active].height; },

    // ── Rail / cushion (WPA Section 6 & 7) ──
    // Total rail width (wood + rubber): 4" to 7.5" per WPA
    // Cushion rubber width (featherstrip to nose): 1 7/8" to 2" per WPA
    railWidth: 5,            // outer wooden rail width (inches)
    cushionWidth: 2,         // rubber cushion nose-to-back (WPA: 1.875"–2.0")

    // ── Pockets (WPA Section 9) ──
    // Mouth = between opposing cushion noses where direction changes into pocket
    // Shelf = from center of mouth line to vertical slate pocket cut
    //
    // Corner: mouth 4.5"–4.625", shelf 1"–2.25", cut angle 142°
    // Side:   mouth 5"–5.125",   shelf 0"–0.375", cut angle 104°
    cornerPocketMouth:  2.28,   // half-mouth: 4.5625" midpoint ÷ 2
    cornerPocketShelf:  1.625,  // midpoint of 1"–2.25"
    cornerPocketRadius: 2.5,    // hole radius: ~5" slate cutout
    sidePocketMouth:    2.53,   // half-mouth: 5.0625" midpoint ÷ 2
    sidePocketShelf:    0.19,   // midpoint of 0"–0.375" — essentially flush!
    sidePocketRadius:   2.5,    // hole radius: ~5" slate cutout

    // ── Diamonds / Sights (WPA Section 6) ──
    // 18 sights, center located 3 11/16" from nose of cushion
    diamondRadius: 0.35,
    sightDistFromNose: 3.6875, // 3 11/16" from cushion nose to sight center

    // ── Ball ──
    ballRadius: 1.125,       // 2.25" diameter standard ball

    // Standard ball colors (projection-optimized: bright on black)
    // Solids 1-7, 8 = black, Stripes 9-15, 0 = cue ball (white)
    ballColors: {
        0:  { fill: '#ffffff', stripe: false, label: ''   },  // cue ball
        1:  { fill: '#ffe033', stripe: false, label: '1'  },  // yellow
        2:  { fill: '#3366ff', stripe: false, label: '2'  },  // blue
        3:  { fill: '#ff3333', stripe: false, label: '3'  },  // red
        4:  { fill: '#9933cc', stripe: false, label: '4'  },  // purple
        5:  { fill: '#ff8c1a', stripe: false, label: '5'  },  // orange
        6:  { fill: '#33cc33', stripe: false, label: '6'  },  // green
        7:  { fill: '#990000', stripe: false, label: '7'  },  // maroon
        8:  { fill: '#222222', stripe: false, label: '8'  },  // black
        9:  { fill: '#ffe033', stripe: true,  label: '9'  },
        10: { fill: '#3366ff', stripe: true,  label: '10' },
        11: { fill: '#ff3333', stripe: true,  label: '11' },
        12: { fill: '#9933cc', stripe: true,  label: '12' },
        13: { fill: '#ff8c1a', stripe: true,  label: '13' },
        14: { fill: '#33cc33', stripe: true,  label: '14' },
        15: { fill: '#990000', stripe: true,  label: '15' }
    },

    // ── Colors (projection-optimized) ──
    colors: {
        rail:        '#1a1a2e',   // very dark — barely visible, provides subtle framing
        cushion:     '#0d7377',   // dark teal — visible but unobtrusive
        pocket:      '#000000',   // black = invisible on felt
        diamond:     '#c0c0c0',   // silver/white dots
        tableLine:   'rgba(255,255,255,0.15)',  // head string, foot spot, etc.
        aimLine:     '#ffffff',
        cueBallPath: '#ffee00',
        objBallPath: '#ff4444',
        pocketPath:  '#00ff88',
        text:        '#ffffff'
    }
};

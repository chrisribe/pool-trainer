/**
 * Drill catalog — index of all available drill sets.
 * Each entry points to a JSON file that can be fetched.
 */
var DRILL_CATALOG = [
    { id: 'straight-shots',  name: 'Straight Shots',  icon: '🎯', file: 'drills/straight-shots.json'  },
    { id: 'cut-shots',       name: 'Cut Shots',       icon: '📐', file: 'drills/cut-shots.json'       },
    { id: 'position-play',   name: 'Position Play',   icon: '🔄', file: 'drills/position-play.json'   },
    { id: 'safety',          name: 'Safety',           icon: '🛡️', file: 'drills/safety.json'          },
    { id: 'custom',          name: 'Custom',           icon: '✏️', file: 'drills/custom.json'          }
];

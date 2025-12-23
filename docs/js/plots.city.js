// js/plots.city.js
// All coordinates are in WORLD PIXELS (same as the 512x512 image).
// Tile size is 16px.

const T = 16;
const P = (id, tx, ty, tw, th) => ({ id, x: tx*T, y: ty*T, w: tw*T, h: th*T });

export const CITY_PLOTS = [
  // Townhall big pad (adjust if needed)
  P("townhall", 12.5, 13.5, 6, 3),

  // Example small pads — adjust to match your exact pads
  P("plot_a", 2.5, 6.5, 2, 2),
  P("plot_b", 11.5, 5.5, 2, 2),
  P("plot_c", 17.5, 5.5, 2, 2),
  P("plot_d", 26.5, 3.5, 2, 2),

  P("plot_e", 22.5, 9.5, 2, 2),
  P("plot_f", 22.5, 14.5, 2, 2),

  
  P("plot_h", 4.5, 18.5, 2, 2),
  P("plot_i", 4.5, 26.5, 2, 2),

  P("plot_j", 23.5, 26.5, 2, 2),
];

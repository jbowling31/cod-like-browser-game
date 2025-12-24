import { initCity } from "./city.js";

window.addEventListener("DOMContentLoaded", () => {
  initCity(
    function syncOverlayToImage() {
  // Make plots layer match the rendered image size EXACTLY
  layer.style.width = `${base.offsetWidth}px`;
  layer.style.height = `${base.offsetHeight}px`;

let moved = false;
let downAtX = 0;
let downAtY = 0;
const CLICK_DRAG_THRESHOLD = 6; // px


  // Also make sure cityContent bounds match the image (important for hit testing)
  // (Not strictly required, but helps keep everything aligned.)
// ? Run once now and again after image is definitely painted
if (base.complete) {
  requestAnimationFrame(() => {
    syncOverlayToImage();
  });
}

base.addEventListener("load", () => {
  requestAnimationFrame(() => {
    syncOverlayToImage();
  });
});
window.addEventListener("resize", () => {
  requestAnimationFrame(() => {
    syncOverlayToImage();
  });
});

}
);
});

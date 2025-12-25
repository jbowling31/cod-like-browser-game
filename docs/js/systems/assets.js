// docs/js/systems/assets.js

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image failed: ${src}`));
    img.src = src;
  });
}

export function tierKeyForLevel(level) {
  if (level >= 20) return "L20";
  if (level >= 15) return "L15";
  if (level >= 10) return "L10";
  if (level >= 5)  return "L5";
  return "L1";
}

// "Maintain L1 if no L5 or higher available"
export async function loadBuildingSprite({ basePath, fileBase, level }) {
  if (!basePath) throw new Error(`loadBuildingSprite: missing basePath`);
  if (!fileBase) throw new Error(`loadBuildingSprite: missing fileBase`);

  const desired = tierKeyForLevel(level);
  const tryKeys = [desired, "L1"];

  for (const key of tryKeys) {
    const src = `${basePath}/${fileBase}_${key}.png`;
    try {
      const img = await loadImage(src);
      return { img, src, keyUsed: key };
    } catch {
      // try next
    }
  }

  throw new Error(`No sprite found for ${fileBase} (tried ${desired} and L1)`);
}

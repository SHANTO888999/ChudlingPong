const MAX_SOURCE_DIM = 1024;

function canvasToNormalizedDataUrl(
  source: CanvasImageSource,
  srcWidth: number,
  srcHeight: number
): string {
  const safeW = Math.max(1, srcWidth || 512);
  const safeH = Math.max(1, srcHeight || 512);
  const scale = Math.min(1, MAX_SOURCE_DIM / Math.max(safeW, safeH));
  const targetW = Math.max(1, Math.round(safeW * scale));
  const targetH = Math.max(1, Math.round(safeH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not prepare image canvas.');
  }
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return canvas.toDataURL('image/png');
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => undefined);
        }
      } catch {
        // Ignore decode warning when image is already loaded
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error('Image failed to decode.'));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Decodes and normalizes any browser-supported image file (respecting EXIF orientation
 * and downscaling giant camera photos so mobile canvases never fail or lag).
 */
export async function loadImageForCrop(file: File): Promise<string> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        return canvasToNormalizedDataUrl(bitmap, bitmap.width, bitmap.height);
      } finally {
        bitmap.close();
      }
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        try {
          return canvasToNormalizedDataUrl(bitmap, bitmap.width, bitmap.height);
        } finally {
          bitmap.close();
        }
      } catch {
        // Fall through to FileReader + HTMLImageElement fallbacks
      }
    }
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadHtmlImage(dataUrl);
    return canvasToNormalizedDataUrl(
      img,
      img.naturalWidth || img.width || 512,
      img.naturalHeight || img.height || 512
    );
  } catch {
    // Fall through to object URL fallback
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(objectUrl);
    return canvasToNormalizedDataUrl(
      img,
      img.naturalWidth || img.width || 512,
      img.naturalHeight || img.height || 512
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/* ============================================================
   KARNI SENA VARANASI — Photo Compressor
   Compresses images client-side before upload.
   Reduces file size ~80% while keeping visual quality.
   ============================================================ */

(function (global) {
  'use strict';

  /**
   * Compress an image file.
   * @param {File}   file        - The image file from <input type="file">
   * @param {Object} [opts]
   * @param {number} [opts.maxWidth=1600]   - Max width in pixels
   * @param {number} [opts.maxHeight=1600]  - Max height in pixels
   * @param {number} [opts.quality=0.82]    - JPEG quality (0-1)
   * @param {string} [opts.outputType='image/jpeg']
   * @returns {Promise<File>} Compressed file
   */
  async function compressImage(file, opts = {}) {
    const {
      maxWidth = 1600,
      maxHeight = 1600,
      quality = 0.82,
      outputType = 'image/jpeg',
    } = opts;

    // Non-image files pass through unchanged
    if (!file.type.startsWith('image/')) return file;

    // Small files (< 200 KB) don't need compression
    if (file.size < 200 * 1024) return file;

    // Load the image
    const img = await loadImage(file);

    // Calculate new dimensions
    let { width, height } = img;
    const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
    width  = Math.round(width  * ratio);
    height = Math.round(height * ratio);

    // Draw to canvas
    const canvas = document.createElement('canvas');
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // Convert back to blob
    const blob = await canvasToBlob(canvas, outputType, quality);

    // Build a new File with a clean name
    const ext = outputType.split('/')[1].replace('jpeg', 'jpg');
    const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
    const newName = `${baseName}_compressed.${ext}`;

    return new File([blob], newName, { type: outputType, lastModified: Date.now() });
  }

  // ============ INTERNAL HELPERS ============

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        type,
        quality
      );
    });
  }

  // ============ PUBLIC API ============
  global.KSImageCompressor = {
    compressImage,
    // Quick helper: returns a data URL preview (used by main.js)
    async preview(file, maxSize = 300) {
      const compressed = await compressImage(file, {
        maxWidth: maxSize,
        maxHeight: maxSize,
        quality: 0.75,
      });
      return await fileToDataURL(compressed);
    },
  };

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

})(window);

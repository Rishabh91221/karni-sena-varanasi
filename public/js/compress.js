/* ============================================================
   KARNI SENA VARANASI — Photo Compressor
   ------------------------------------------------------------
   Client-side image compression before upload.

   Features:
   - Preserves aspect ratio
   - Strips EXIF metadata (GPS, device info, timestamps)
   - Skips small files (< 200 KB) — preserves PNG transparency
   - Skips non-image and oversized files (> 5 MB)
   - Uses high-quality canvas downscaling
   - Fails gracefully — returns original on any error
   - Sanitizes output filenames

   Usage:
   - KSImageCompressor.compressImage(file, opts) → Promise<File>
   - KSImageCompressor.preview(file, maxSize)   → Promise<dataURL>
   ============================================================ */

(function (global) {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const CONFIG = {
    ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
    SMALL_FILE_BYTES:   200 * 1024,       // 200 KB — skip compression below this
    MAX_INPUT_BYTES:    5 * 1024 * 1024,  // 5 MB — matches server-side limit
    DEFAULT_MAX_DIM:    1600,             // px — max width or height
    DEFAULT_QUALITY:    0.82,             // JPEG quality (0-1)
    DEFAULT_OUTPUT:     'image/jpeg',
    MAX_FILENAME_LEN:   50,               // characters — after sanitization
  };

  // ============================================================
  // MAIN COMPRESSOR
  // ============================================================
  /**
   * Compress an image file.
   * @param {File}   file - Input image file.
   * @param {Object} [opts]
   * @param {number} [opts.maxWidth=1600]           - Max width in pixels.
   * @param {number} [opts.maxHeight=1600]          - Max height in pixels.
   * @param {number} [opts.quality=0.82]            - Output quality (0-1).
   * @param {string} [opts.outputType='image/jpeg'] - Output MIME type.
   * @returns {Promise<File>} Compressed file or the original on any failure.
   */
  async function compressImage(file, opts) {
    opts = opts || {};

    // ---- Validate input ----
    if (!file || !(file instanceof File)) {
      throw new Error('Invalid file input provided to compressor.');
    }

    const maxWidth   = clampNumber(opts.maxWidth,   CONFIG.DEFAULT_MAX_DIM, 100, 5000);
    const maxHeight  = clampNumber(opts.maxHeight,  CONFIG.DEFAULT_MAX_DIM, 100, 5000);
    const quality    = clampNumber(opts.quality,    CONFIG.DEFAULT_QUALITY, 0.1, 1.0);
    const outputType = CONFIG.ALLOWED_MIME_TYPES.includes(opts.outputType)
      ? opts.outputType
      : CONFIG.DEFAULT_OUTPUT;

    // ---- Pass through non-image types ----
    if (!CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
      return file;
    }

    // ---- Pass through small files (preserves PNG transparency) ----
    if (file.size < CONFIG.SMALL_FILE_BYTES) {
      return file;
    }

    // ---- Do not attempt to load oversized files ----
    // Return original; server-side validation enforces the 5 MB rule.
    if (file.size > CONFIG.MAX_INPUT_BYTES) {
      return file;
    }

    // ---- Load the image ----
    let img;
    try {
      img = await loadImage(file);
    } catch (err) {
      console.warn('[compressor] Image load failed:', err);
      return file;
    }

    // ---- Calculate new dimensions (aspect-ratio preserved) ----
    const originalWidth  = img.naturalWidth  || img.width  || 0;
    const originalHeight = img.naturalHeight || img.height || 0;

    if (originalWidth === 0 || originalHeight === 0) {
      return file;
    }

    const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight, 1);
    const newWidth  = Math.max(1, Math.round(originalWidth  * ratio));
    const newHeight = Math.max(1, Math.round(originalHeight * ratio));

    // ---- Draw to canvas (strips EXIF metadata) ----
    const canvas = document.createElement('canvas');
    canvas.width  = newWidth;
    canvas.height = newHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    // ---- Convert canvas to File ----
    try {
      const blob = await canvasToBlob(canvas, outputType, quality);

      // Skip the new file if it would be larger than the original
      if (blob.size >= file.size) {
        return file;
      }

      const ext  = outputType === 'image/jpeg' ? 'jpg' : outputType.split('/')[1];
      const name = buildSafeFileName(file.name, ext);

      return new File([blob], name, {
        type: outputType,
        lastModified: Date.now(),
      });
    } catch (err) {
      console.warn('[compressor] Canvas conversion failed:', err);
      return file;
    }
  }

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  /**
   * Load an image from a File object.
   * Ensures the object URL is always revoked, success or failure.
   */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = function (err) {
        URL.revokeObjectURL(url);
        reject(err);
      };

      img.src = url;
    });
  }

  /**
   * Convert a canvas to a Blob.
   */
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('canvas.toBlob returned null'));
        },
        type,
        quality
      );
    });
  }

  /**
   * Read a File as a data URL (used for previews).
   */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = function (e) { resolve(e.target.result); };
      reader.onerror = function (err) { reject(err); };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Build a safe filename from the original name.
   * - Strips the original extension
   * - Removes unsafe characters
   * - Truncates to a max length
   * - Appends the new extension
   */
  function buildSafeFileName(originalName, newExt) {
    const rawBase = (originalName || 'photo').replace(/\.[^.]+$/, '');
    const safeBase = rawBase
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, CONFIG.MAX_FILENAME_LEN);

    const finalBase = safeBase || 'photo';
    return finalBase + '_compressed.' + newExt;
  }

  /**
   * Clamp a numeric value between min and max.
   * Returns the fallback if the input is not a finite number.
   */
  function clampNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  global.KSImageCompressor = {
    compressImage: compressImage,

    /**
     * Generate a small preview data URL for the form UI.
     * @param {File}   file
     * @param {number} [maxSize=300] - Max dimension in pixels.
     * @returns {Promise<string>} Data URL.
     */
    preview: async function (file, maxSize) {
      const size = clampNumber(maxSize, 300, 50, 2000);
      try {
        const compressed = await compressImage(file, {
          maxWidth:  size,
          maxHeight: size,
          quality:   0.75,
        });
        return await fileToDataURL(compressed);
      } catch (err) {
        console.error('[compressor] Preview generation failed:', err);
        return await fileToDataURL(file);
      }
    },
  };

})(typeof window !== 'undefined' ? window : this);

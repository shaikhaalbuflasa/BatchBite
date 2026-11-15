/*
 * BatchBite - product photo upload (Products page, Business Owner)
 * The owner picks a photo from their device instead of pasting a link.
 * The photo is shrunk in the browser (longest side 800 px, JPEG) and saved
 * with the product, so it works without internet and without extra setup.
 * Requirement: FR-4 (product listings with pictures).
 *
 * Used by js/pages/products.js and js/pages/catalogue.js:
 *   ProductPhoto.fieldHtml(currentImage)  -> HTML for the upload field
 *   ProductPhoto.wire(form)               -> hooks up choose / preview / remove
 *   ProductPhoto.img(image, alt, cls)     -> <img> tag, or a placeholder when there is no photo
 */
window.ProductPhoto = (() => {
  const MAX_SIDE = 800;
  const MAX_FILE_MB = 15;
  const E = s => UI.escape(s);

  /** Only photos we created (data:image/...) or normal web links are shown. */
  function safe(src) {
    return typeof src === 'string' && (/^data:image\/(jpeg|png|webp|gif);base64,/.test(src) || /^https?:\/\//i.test(src)) ? src : '';
  }

  function img(src, alt, cls) {
    const s = safe(src);
    return s
      ? '<img class="' + (cls || 'product-photo') + '" src="' + E(s) + '" alt="' + E(alt || 'Product photo') + '" loading="lazy">'
      : '<div class="' + (cls || 'product-photo') + ' no-photo" aria-hidden="true">No photo</div>';
  }

  function fieldHtml(current) {
    return '<div class="field photo-field">' +
      '<label>Photo (optional)</label>' +
      '<input type="hidden" name="image" value="' + E(safe(current)) + '">' +
      '<div class="photo-row">' +
        '<div class="photo-preview">' + img(current, 'Current photo', 'photo-thumb') + '</div>' +
        '<div class="photo-actions">' +
          '<label class="btn btn-secondary btn-sm photo-pick">Upload photo<input type="file" accept="image/*" hidden></label>' +
          '<button type="button" class="link-btn small photo-remove"' + (safe(current) ? '' : ' hidden') + '>Remove photo</button>' +
          '<div class="hint">JPG, PNG or WebP. It is resized automatically.</div>' +
        '</div>' +
      '</div>' +
      '<div class="field-error" data-error-for="image"></div>' +
    '</div>';
  }

  function shrink(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.onload = () => {
        const picture = new Image();
        picture.onerror = () => reject(new Error('That file is not a photo we can open. Try a JPG or PNG.'));
        picture.onload = () => {
          const scale = Math.min(1, MAX_SIDE / Math.max(picture.width, picture.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(picture.width * scale);
          canvas.height = Math.round(picture.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';                       // transparent PNGs get a white background
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        picture.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function wire(form) {
    const hidden = form.querySelector('input[name=image]');
    const fileInput = form.querySelector('.photo-pick input[type=file]');
    const preview = form.querySelector('.photo-preview');
    const removeBtn = form.querySelector('.photo-remove');
    const error = form.querySelector('[data-error-for=image]');
    if (!hidden || !fileInput) return;

    function show(src) {
      hidden.value = src;
      preview.innerHTML = img(src, 'New photo', 'photo-thumb');
      removeBtn.hidden = !src;
    }

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      error.textContent = '';
      if (!file) return;
      if (!/^image\//.test(file.type)) { error.textContent = 'Choose a photo (JPG, PNG or WebP).'; return; }
      if (file.size > MAX_FILE_MB * 1024 * 1024) { error.textContent = 'That photo is over ' + MAX_FILE_MB + ' MB. Choose a smaller one.'; return; }
      preview.innerHTML = '<div class="photo-thumb no-photo">Loading...</div>';
      try { show(await shrink(file)); }
      catch (err) { show(hidden.value); error.textContent = err.message; }
    });
    removeBtn.addEventListener('click', () => show(''));
  }

  return { fieldHtml, wire, img, safe };
})();

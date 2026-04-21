const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const UPLOADS_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
const MARKETPLACE_UPLOAD_DIR = path.join(UPLOADS_ROOT, 'marketplace');
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

fs.mkdirSync(MARKETPLACE_UPLOAD_DIR, { recursive: true });

function sanitizeBaseName(value) {
  return String(value || 'listing-photo')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, MARKETPLACE_UPLOAD_DIR);
  },
  filename: (req, file, callback) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const baseName = sanitizeBaseName(path.basename(file.originalname || '', ext));
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${baseName}-${uniqueSuffix}${ext}`);
  },
});

function fileFilter(req, file, callback) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const error = new Error('Formato de imagem inválido. Use JPEG, PNG ou WEBP.');
    error.status = 400;
    callback(error);
    return;
  }

  callback(null, true);
}

const uploadMarketplacePhoto = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
  fileFilter,
});

module.exports = {
  uploadMarketplacePhoto,
};

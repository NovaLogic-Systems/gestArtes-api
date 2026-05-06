/**
 * @file src/middlewares/marketplaceUpload.middleware.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const UPLOADS_DIR = path.resolve(__dirname, '..', '..', 'uploads', 'marketplace');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeExtension = ['.png', '.jpg', '.jpeg', '.webp'].includes(extension) ? extension : '.jpg';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `listing-${uniqueSuffix}${safeExtension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error('Formato de imagem inválido. Usa PNG, JPG ou WEBP.');
      error.status = 400;
      cb(error);
      return;
    }

    cb(null, true);
  },
});

function attachMarketplacePhoto(req, res, next) {
  upload.single('photo')(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        const sizeError = new Error('Imagem demasiado grande (máximo 5MB).');
        sizeError.status = 400;
        next(sizeError);
        return;
      }

      next(error);
      return;
    }

    if (req.file) {
      req.body.photoUrl = `/uploads/marketplace/${req.file.filename}`;
    }

    next();
  });
}

module.exports = {
  attachMarketplacePhoto,
};


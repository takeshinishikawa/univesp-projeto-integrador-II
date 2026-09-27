import multer from 'multer';
import path from 'node:path';
import { AppError } from '../utils/app-error';

export const TAMANHO_MAX_ARQUIVO_BYTES = 2 * 1024 * 1024;

// Em memória: o arquivo nunca é gravado em disco (dado financeiro sensível).
export const uploadOfx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAX_ARQUIVO_BYTES, files: 1 },
  fileFilter: (_req, arquivo, callback) => {
    if (path.extname(arquivo.originalname).toLowerCase() !== '.ofx') {
      return callback(new AppError(400, 'Envie um arquivo com extensão .ofx'));
    }
    callback(null, true);
  },
}).single('arquivo');

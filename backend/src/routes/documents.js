import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { badRequest } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

const documentFieldsSchema = z.object({
  patientId: z.string().uuid().optional(),
  description: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().trim().max(300).optional()
  )
}).strict();

const listDocumentsSchema = z.object({ patientId: z.string().uuid().optional() });

function createUploadMiddleware(maxUploadBytes) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
      fields: 2,
      parts: 4,
      fieldSize: 2 * 1024
    },
    fileFilter(_request, file, callback) {
      const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!allowed.includes(file.mimetype?.toLowerCase())) {
        return callback(badRequest('O arquivo deve ser PDF, PNG ou JPEG.'));
      }
      callback(null, true);
    }
  }).single('document');

  return (request, response, next) => {
    upload(request, response, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
          ? `O prontuário excede o limite de ${Math.floor(maxUploadBytes / 1024 / 1024)} MiB.`
          : 'Upload multipart inválido.';
        return next(badRequest(message));
      }
      next(error);
    });
  };
}

function attachmentHeader(fileName) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'documento';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function createDocumentsRouter(documents, config) {
  const router = Router();
  const uploadDocument = createUploadMiddleware(config.maxUploadBytes);

  router.post('/', uploadDocument, asyncHandler(async (request, response) => {
    const parsed = documentFieldsSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest('Campos do upload inválidos.', parsed.error.flatten());
    const document = await documents.create(request.user, parsed.data, request.file);
    response.status(201).json({ document });
  }));

  router.get('/', validate(listDocumentsSchema, 'query'), (request, response) => {
    response.json({ documents: documents.list(request.user, request.validatedQuery.patientId) });
  });

  router.get('/:id/integrity', asyncHandler(async (request, response) => {
    response.json(await documents.verify(request.user, request.params.id));
  }));

  router.get('/:id/content', asyncHandler(async (request, response) => {
    const result = await documents.download(request.user, request.params.id);
    response.set({
      'Content-Type': result.document.mimeType,
      'Content-Length': String(result.content.length),
      'Content-Disposition': attachmentHeader(result.document.fileName),
      'X-Content-SHA256': result.document.contentHash
    });
    response.send(result.content);
  }));

  return router;
}

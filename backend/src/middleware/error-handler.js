import { AppError } from '../errors.js';

export function notFoundHandler(request, _response, next) {
  next(new AppError(404, 'NOT_FOUND', `Rota ${request.method} ${request.path} não encontrada.`));
}

export function errorHandler(error, _request, response, _next) {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return response.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido.' } });
  }
  const status = error.status ?? 500;
  if (status >= 500) console.error(error);
  response.status(status).json({
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: status >= 500 ? 'Erro interno do servidor.' : error.message,
      ...(error.details ? { details: error.details } : {})
    }
  });
}

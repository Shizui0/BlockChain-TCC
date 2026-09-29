import { badRequest } from '../errors.js';

export function validate(schema, source = 'body') {
  return (request, _response, next) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      return next(badRequest('Dados de entrada inválidos.', result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message
      }))));
    }
    if (source === 'query') request.validatedQuery = result.data;
    else request[source] = result.data;
    next();
  };
}

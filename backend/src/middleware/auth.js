import jwt from 'jsonwebtoken';
import { forbidden, unauthorized } from '../errors.js';

export function createAuthMiddleware(config, database) {
  return function authenticate(request, _response, next) {
    try {
      const authorization = request.get('authorization');
      const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
      const token = bearerToken ?? request.cookies?.medchain_session;
      if (!token) throw unauthorized();
      const payload = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'], issuer: 'medchain', audience: 'medchain-web'
      });
      const user = database.prepare(`
        SELECT id, email, role, display_name AS displayName
        FROM users WHERE id = ?
      `).get(payload.sub);
      if (!user || user.role !== payload.role) throw unauthorized('Sessão inválida.');
      request.user = user;
      next();
    } catch (error) {
      if (error.status) return next(error);
      next(unauthorized('Sessão inválida ou expirada.'));
    }
  };
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!roles.includes(request.user.role)) return next(forbidden('Papel de usuário insuficiente.'));
    next();
  };
}

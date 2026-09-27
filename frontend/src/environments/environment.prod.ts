export const environment = {
  production: true,
  // Mesma origem: o Nginx do container faz proxy reverso de /api para o backend.
  // Se o backend for publicado em outro domínio, troque pela URL completa (ex.: https://api.exemplo.com/api).
  apiUrl: '/api',
};

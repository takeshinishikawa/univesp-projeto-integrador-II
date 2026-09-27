import { criarApp } from './app';
import { getEnv } from './config/env';

const { PORT } = getEnv();

criarApp().listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

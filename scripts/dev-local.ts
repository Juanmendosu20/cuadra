// Levanta la base local (en memoria) y la app apuntando a ella. Funciona en Windows, Mac y Linux.
// Uso: npm run dev:local  →  http://localhost:3000  (PIN 1234 · clave del entrevistador: local)
import { spawn } from 'node:child_process';

const base = spawn(process.execPath, ['scripts/base-local.ts'], { stdio: 'inherit' });

const app = spawn('npx next dev -p 3000', {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local',
  },
});

const salir = () => {
  base.kill();
  app.kill();
  process.exit();
};
process.on('SIGINT', salir);
process.on('SIGTERM', salir);
app.on('exit', salir);

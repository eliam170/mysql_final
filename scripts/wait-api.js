// Espera a que la API responda antes de arrancar Vite (evita la carrera de inicio)
const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}/api/health`;
const MAX = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 1; i <= MAX; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) {
        console.log(`[OK] API lista tras ${i} intento(s). Arrancando la interfaz...`);
        process.exit(0);
      }
    } catch {
      // todavía no responde
    }
    await sleep(500);
  }
  console.warn('[WARN] La API no respondió a tiempo. La página abrirá y reintentará sola.');
  process.exit(0);
}

main();

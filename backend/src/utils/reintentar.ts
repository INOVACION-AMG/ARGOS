// Reintento simple con backoff para operaciones idempotentes (lecturas,
// subidas con upsert) donde un fallo transitorio de red no debería tumbar
// todo el flujo a la primera. NO usar para operaciones que puedan tener
// efectos secundarios no idempotentes (ej. crear una cotización) -- ahí un
// reintento ciego podría duplicar el efecto en vez de solo repetir la lectura.
export async function conReintento<T>(
  fn: () => Promise<T>,
  opciones: { intentos?: number; esperaMs?: number } = {},
): Promise<T> {
  const intentos = opciones.intentos ?? 3;
  const esperaMs = opciones.esperaMs ?? 500;

  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await fn();
    } catch (err) {
      ultimoError = err;
      if (intento < intentos) {
        await new Promise((resolve) => setTimeout(resolve, esperaMs * intento));
      }
    }
  }
  throw ultimoError;
}

import { amgSupabase } from '../../integrations/amgSupabase';
import type { ServicioTipoAmg, SistemaAmg } from '../../ai/serviciosAmg';

export interface ClienteAmgSimple {
  id: string;
  nombre: string;
}

export interface TecnicoAmgSimple {
  id: string;
  nombre: string;
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(MARCAS_DIACRITICAS, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PALABRAS_VACIAS_CLIENTE = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'para', 'con', 'conjunto', 'residencial', 'edificio', 'ph', 'sas', 'ltda', 's', 'a',
]);

function palabrasClave(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length >= 3 && !PALABRAS_VACIAS_CLIENTE.has(p));
}

// Daniel casi nunca va a escribir el nombre del cliente exactamente como
// está guardado (mismo problema documentado para clientes finales de
// cotizaciones, ver clientes-finales-amg/service.ts) -- coincidencia exacta
// primero, si no por mejor solapamiento de palabras clave.
export async function buscarClienteAmgPorNombre(nombreLibre: string): Promise<ClienteAmgSimple | null> {
  const normalizado = normalizar(nombreLibre);
  if (!normalizado) return null;

  const { data: todos, error } = await amgSupabase().from('clientes').select('id, nombre');
  if (error) throw new Error(`No se pudo buscar el cliente en AMG: ${error.message}`);
  if (!todos || todos.length === 0) return null;

  const exacto = todos.find((c) => normalizar(c.nombre) === normalizado);
  if (exacto) return exacto;

  const palabrasBuscadas = palabrasClave(nombreLibre);
  if (palabrasBuscadas.length === 0) return null;

  let mejor: ClienteAmgSimple | null = null;
  let mejorScore = 0;
  for (const c of todos) {
    const palabrasCliente = new Set(palabrasClave(c.nombre));
    let score = 0;
    for (const p of palabrasBuscadas) if (palabrasCliente.has(p)) score++;
    if (score > mejorScore) {
      mejorScore = score;
      mejor = c;
    }
  }

  if (!mejor || mejorScore < Math.ceil(palabrasBuscadas.length / 2)) return null;
  return mejor;
}

export async function crearClienteAmg(nombre: string, creadoPor: string): Promise<ClienteAmgSimple> {
  const { data, error } = await amgSupabase()
    .from('clientes')
    .insert({ nombre: nombre.trim(), created_by: creadoPor })
    .select('id, nombre')
    .single();
  if (error || !data) throw new Error(`No se pudo crear el cliente en AMG: ${error?.message}`);
  return data;
}

// Lista corta (pocos técnicos activos a la vez) -- se pasa completa a la IA
// para que ella misma resuelva a quién se refiere Daniel (apodos, nombre
// parcial, etc.) en vez de un matching propio, ver ai/serviciosAmg.ts.
export async function listarTecnicosActivosAmg(): Promise<TecnicoAmgSimple[]> {
  const { data, error } = await amgSupabase()
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'tecnico')
    .eq('active', true);
  if (error) throw new Error(`No se pudo listar los técnicos de AMG: ${error.message}`);
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: p.full_name as string }));
}

export interface CrearServicioAmgInput {
  clienteId: string;
  tipo: ServicioTipoAmg;
  sistemas: SistemaAmg[];
  descripcion: string;
  fechaProgramada: string | null;
  tecnicoId: string | null;
  comercialId: string;
}

export async function crearServicioAmg(input: CrearServicioAmgInput): Promise<{ id: string }> {
  const { data, error } = await amgSupabase()
    .from('servicios')
    .insert({
      cliente_id: input.clienteId,
      tipo: input.tipo,
      sistemas: input.sistemas,
      descripcion: input.descripcion,
      fecha_programada: input.fechaProgramada,
      tecnico_asignado_id: input.tecnicoId,
      comercial_id: input.comercialId,
      estado: input.tecnicoId ? 'asignado' : 'pendiente',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`No se pudo crear el servicio en AMG: ${error?.message}`);
  return data;
}

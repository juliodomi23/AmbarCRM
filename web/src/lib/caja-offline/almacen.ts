// Almacenamiento local de la caja sin internet. Separa por clave `orgId:userId`; no cifra (es separación lógica).

export type NombreAlmacen = "meta" | "catalogo" | "cola";

export type Almacen = {
  obtener<T>(almacen: NombreAlmacen, clave: string): Promise<T | undefined>;
  guardar(almacen: NombreAlmacen, clave: string, valor: unknown): Promise<void>;
  borrar(almacen: NombreAlmacen, clave: string): Promise<void>;
  /** Valores cuya clave empieza con `prefijo`, en orden de clave. */
  listar<T>(almacen: NombreAlmacen, prefijo: string): Promise<T[]>;
};

export const DB_NOMBRE = "ambar-caja";
export const ALMACENES: NombreAlmacen[] = ["meta", "catalogo", "cola"];

export const claveIdentidad = (identidad: { orgId: string; userId: string }) => `${identidad.orgId}:${identidad.userId}`;

function pedir<T>(solicitud: IDBRequest<T>) {
  return new Promise<T>((resolver, rechazar) => {
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

function abrir() {
  return new Promise<IDBDatabase>((resolver, rechazar) => {
    const apertura = indexedDB.open(DB_NOMBRE, 1);
    apertura.onupgradeneeded = () => {
      for (const nombre of ALMACENES) if (!apertura.result.objectStoreNames.contains(nombre)) apertura.result.createObjectStore(nombre);
    };
    apertura.onsuccess = () => resolver(apertura.result);
    apertura.onerror = () => rechazar(apertura.error);
  });
}

export function almacenIndexedDB(): Almacen {
  let conexion: Promise<IDBDatabase> | null = null;
  const tienda = async (nombre: NombreAlmacen, modo: IDBTransactionMode) => {
    conexion ??= abrir();
    return (await conexion).transaction(nombre, modo).objectStore(nombre);
  };
  return {
    async obtener<T>(almacen: NombreAlmacen, clave: string) {
      return (await pedir((await tienda(almacen, "readonly")).get(clave))) as T | undefined;
    },
    async guardar(almacen, clave, valor) {
      await pedir((await tienda(almacen, "readwrite")).put(valor, clave));
    },
    async borrar(almacen, clave) {
      await pedir((await tienda(almacen, "readwrite")).delete(clave));
    },
    async listar<T>(almacen: NombreAlmacen, prefijo: string) {
      const rango = IDBKeyRange.bound(prefijo, `${prefijo}￿`);
      return (await pedir((await tienda(almacen, "readonly")).getAll(rango))) as T[];
    },
  };
}

/** Misma interfaz en memoria: pruebas sin navegador. */
export function almacenMemoria(): Almacen {
  const datos: Record<NombreAlmacen, Map<string, unknown>> = { meta: new Map(), catalogo: new Map(), cola: new Map() };
  return {
    async obtener<T>(almacen: NombreAlmacen, clave: string) {
      return structuredClone(datos[almacen].get(clave)) as T | undefined;
    },
    async guardar(almacen, clave, valor) {
      datos[almacen].set(clave, structuredClone(valor));
    },
    async borrar(almacen, clave) {
      datos[almacen].delete(clave);
    },
    async listar<T>(almacen: NombreAlmacen, prefijo: string) {
      return [...datos[almacen].entries()]
        .filter(([clave]) => clave.startsWith(prefijo))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, valor]) => structuredClone(valor) as T);
    },
  };
}

// Tipos compartidos entre el servidor y la caja sin internet (sin dependencias de servidor).

export type ProductoCatalogoCaja = {
  id: string;
  nombre: string;
  sku: string | null;
  codigoBarras: string | null;
  categoria: string | null;
  unidad: string;
  vendePorPeso: boolean;
  stock: string;
  precio: string;
  precioLista: string | null;
  escalas: Array<{ desde: string; precio: string }>;
};

export type PromocionCatalogoCaja = {
  id: string;
  productoId: string | null;
  categoria: string | null;
  tipo: string;
  nombre: string;
  valor: string | null;
  cantidadCompra: number | null;
  cantidadPaga: number | null;
  inicia: string;
  termina: string;
};

export type CatalogoCaja = {
  version: string;
  generadoAt: string;
  zona: string;
  descuentoMaximo: number;
  ventasSinRed: boolean;
  productos: ProductoCatalogoCaja[];
  promociones: PromocionCatalogoCaja[];
};

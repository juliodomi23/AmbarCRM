export type MovimientoRetail = {
  id: string;
  tipo: string;
  cantidad: number;
  existenciaAntes: number;
  existenciaDespues: number;
  motivo: string | null;
  createdAt: string;
  usuario: { nombre: string } | null;
};

export type ProductoRetail = {
  id: string;
  sku: string | null;
  codigoBarras: string | null;
  nombre: string;
  categoria: string | null;
  descripcion: string | null;
  precio: number;
  costo: number;
  stock: number;
  stockMinimo: number;
  moneda: string;
  fotoUrl: string | null;
  activo: boolean;
  movimientos?: MovimientoRetail[];
};

export type ContactoVenta = {
  id: string;
  nombre: string;
  telefono: string | null;
};

export type VentaRetail = {
  id: string;
  folio: string;
  estado: string;
  canal: string;
  metodoPago: string | null;
  subtotal: number;
  descuento: number;
  total: number;
  moneda: string;
  notas: string | null;
  createdAt: string;
  contacto: ContactoVenta | null;
  creadoPor: { id: string; nombre: string } | null;
  partidas: Array<{
    id: string;
    cantidad: number;
    precioUnitario: number;
    total: number;
    producto: { id: string; nombre: string; sku: string | null };
  }>;
};

export type ProveedorRetail = {
  id: string;
  nombre: string;
  contactoNombre: string | null;
  telefono: string | null;
  email: string | null;
  rfc: string | null;
  notas: string | null;
  activo: boolean;
};

export type CompraRetail = {
  id: string;
  folio: string;
  estado: string;
  total: number;
  moneda: string;
  notas: string | null;
  createdAt: string;
  proveedor: ProveedorRetail;
  creadoPor: { id: string; nombre: string } | null;
  partidas: Array<{
    id: string;
    cantidad: number;
    costoUnitario: number;
    total: number;
    producto: { id: string; nombre: string; sku: string | null };
  }>;
};

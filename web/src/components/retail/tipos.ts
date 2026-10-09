import type { DecimalSerializado } from "@/lib/retail-calculos";

export type MovimientoRetail = {
  id: string;
  tipo: string;
  cantidad: DecimalSerializado;
  existenciaAntes: DecimalSerializado;
  existenciaDespues: DecimalSerializado;
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
  precio: DecimalSerializado;
  costo: DecimalSerializado;
  stock: DecimalSerializado;
  stockMinimo: DecimalSerializado;
  unidad: string;
  vendePorPeso: boolean;
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
  turnoId?: string | null;
  folio: string;
  estado: string;
  canal: string;
  metodoPago: string | null;
  subtotal: DecimalSerializado;
  descuento: DecimalSerializado;
  total: DecimalSerializado;
  moneda: string;
  notas: string | null;
  createdAt: string;
  contacto: ContactoVenta | null;
  creadoPor: { id: string; nombre: string } | null;
  partidas: Array<{
    id: string;
    cantidad: DecimalSerializado;
    precioUnitario: DecimalSerializado;
    total: DecimalSerializado;
    producto: { id: string; nombre: string; sku: string | null; unidad: string };
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
  total: DecimalSerializado;
  moneda: string;
  notas: string | null;
  createdAt: string;
  proveedor: ProveedorRetail;
  creadoPor: { id: string; nombre: string } | null;
  partidas: Array<{
    id: string;
    cantidad: DecimalSerializado;
    costoUnitario: DecimalSerializado;
    total: DecimalSerializado;
    producto: { id: string; nombre: string; sku: string | null; unidad: string };
  }>;
};

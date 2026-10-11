import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";
import { sembrarActividadDemo } from "./lib/demo-actividad.mjs";
import { PERFIL_RETAIL } from "./lib/demo-perfiles.mjs";

const { email, password, passwordGenerada } = credencialesDemo("retail@local.test");
const prisma = new PrismaClient();

function fechaMexico(dias, hora) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((parte) => [parte.type, parte.value]),
  );
  const fecha = new Date(
    Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)),
  );
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return new Date(
    `${fecha.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}:00:00-06:00`,
  );
}

const org = await prisma.org.upsert({
  where: { slug: "demo-retail" },
  update: { nombre: "Casa Ámbar Boutique", activo: true },
  create: { nombre: "Casa Ámbar Boutique", slug: "demo-retail" },
});

const catalogo = [
  ["CAM-001", "Camisa lino arena", "Ropa", 899, 410, 18, 5],
  ["BOL-002", "Bolsa piel terracota", "Accesorios", 1890, 920, 7, 3],
  ["VEL-003", "Vela ámbar y cedro", "Hogar", 420, 165, 24, 6],
  ["TAZ-004", "Taza cerámica artesanal", "Hogar", 360, 145, 15, 4],
  ["LIB-005", "Libreta piel reciclada", "Papelería", 295, 105, 3, 5],
  ["PAN-006", "Pantalón sastre negro", "Ropa", 1190, 540, 11, 4],
  ["ARE-007", "Aretes baño de oro", "Accesorios", 540, 190, 20, 5],
  ["DIF-008", "Difusor cítricos 200 ml", "Hogar", 590, 230, 9, 3],
  ["PAÑ-009", "Pañuelo seda botánico", "Accesorios", 680, 285, 13, 4],
  ["TEN-010", "Tenis urbanos blancos", "Calzado", 1490, 710, 6, 3],
];

const ventasDemo = [
  ["DEMO-001", 0, "entregada", "mostrador", "tarjeta", [["CAM-001", 1], ["ARE-007", 1]]],
  ["DEMO-002", 1, "entregada", "whatsapp", "transferencia", [["VEL-003", 2]]],
  ["DEMO-003", 2, "preparando", "tienda_en_linea", "tarjeta", [["BOL-002", 1]]],
  ["DEMO-004", 3, "pagada", "mostrador", "efectivo", [["TAZ-004", 2], ["DIF-008", 1]]],
  ["DEMO-005", 4, "pendiente", "whatsapp", "enlace", [["PAN-006", 1], ["PAÑ-009", 1]]],
  ["DEMO-006", 5, "cancelada", "telefono", "otro", [["TEN-010", 1]]],
  ["DEMO-007", 5, "entregada", "mostrador", "efectivo", [["LIB-005", 1], ["VEL-003", 1]], { dia: -1 }],
  ["DEMO-008", 0, "pagada", "mostrador", "tarjeta", [["ARE-007", 2]], {}],
  ["DEMO-009", 3, "pendiente", "tienda_en_linea", "enlace", [["DIF-008", 1], ["TAZ-004", 1]], { reserva: true, tipoEntrega: "envio", costoEnvio: 65, token: "de009000000000000000000000000009" }],
  ["DEMO-010", 1, "entregada", "tienda_en_linea", "transferencia", [["CAM-001", 1]], { dia: -2, tipoEntrega: "envio", costoEnvio: 65, token: "de010000000000000000000000000010" }],
  ["DEMO-011", 2, "lista", "tienda_en_linea", "tarjeta", [["PAÑ-009", 1]], { tipoEntrega: "recoger", token: "de011000000000000000000000000011" }],
  ["DEMO-012", 4, "cancelada", "tienda_en_linea", "otro", [["LIB-005", 1]], { dia: -3, tipoEntrega: "recoger", token: "de012000000000000000000000000012" }],
];

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(
    "SELECT set_config('app.current_org', $1, true)",
    String(org.id),
  );
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: {
      nombre: "Gerencia Casa Ámbar",
      passwordHash,
      rol: "admin",
      puesto: "Administrador",
      activo: true,
    },
    create: {
      nombre: "Gerencia Casa Ámbar",
      email,
      passwordHash,
      rol: "admin",
      puesto: "Administrador",
    },
  });
  const equipo = [];
  for (const [nombre, correo, puesto] of [
    ["Daniela Soto", "daniela@casa-ambar.demo", "Vendedor de tienda"],
    ["Mateo Ruiz", "mateo@casa-ambar.demo", "Cajero"],
    ["Elena Paz", "elena@casa-ambar.demo", "Encargado de inventario"],
    ["Paula Vega", "paula@casa-ambar.demo", "Encargado de tienda"],
  ]) {
    equipo.push(
      await tx.usuario.upsert({
        where: { orgId_email: { orgId: org.id, email: correo } },
        update: { nombre, puesto, activo: true },
        create: { nombre, email: correo, passwordHash, rol: "agente", puesto },
      }),
    );
  }
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: {
      marcaNombre: "Casa Ámbar Boutique",
      nombreNegocio: "Casa Ámbar Boutique",
      marcaPreset: "retail",
    },
    create: {
      marcaNombre: "Casa Ámbar Boutique",
      nombreNegocio: "Casa Ámbar Boutique",
      marcaPreset: "retail",
    },
  });
  for (const clave of ["clientes", "productos", "compras", "ventas", "caja", "cotizaciones", "pedidos_en_linea"]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true },
      create: { clave, activo: true, config: {} },
    });
  }
  await tx.moduloOrg.update({
    where: { orgId_clave: { orgId: org.id, clave: "caja" } },
    data: { config: { puestosPermitidos: ["Cajero", "Encargado de tienda"], descuentoMaximoCajero: 10, apartadoDiasVigencia: 7 } },
  });
  await tx.moduloOrg.update({
    where: { orgId_clave: { orgId: org.id, clave: "pedidos_en_linea" } },
    data: { config: { permiteEntrega: true, permiteRecoger: true, minimoCompra: "300.00", costoEnvio: "65.00", maxPorTelefono: 3, maxPorIp: 10 } },
  });
  await tx.moduloOrg.update({
    where: { orgId_clave: { orgId: org.id, clave: "cotizaciones" } },
    data: { config: { ivaPorcentaje: "16", preciosConIva: false } },
  });
  await tx.caja.upsert({
    where: { orgId_nombre: { orgId: org.id, nombre: "Caja principal" } },
    update: { sucursal: "Matriz", activa: true },
    create: { nombre: "Caja principal", sucursal: "Matriz" },
  });
  await tx.moduloOrg.upsert({
    where: { orgId_clave: { orgId: org.id, clave: "pacientes" } },
    update: { activo: false },
    create: { clave: "pacientes", activo: false, config: {} },
  });

  const contactos = [];
  const nombres = [
    "Ana Salgado",
    "Mariana León",
    "Carolina Treviño",
    "Sofía Lozano",
    "Jorge Medina",
    "Luisa Ramos",
  ];
  for (let indice = 0; indice < nombres.length; indice++) {
    const telefono = `555400000${indice + 1}`;
    const contacto = await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: {
        nombre: nombres[indice],
        responsableId: equipo[indice % 2].id,
      },
      create: {
        nombre: nombres[indice],
        telefono,
        email: `cliente${indice + 1}@casa-ambar.demo`,
        fuente: indice % 2 === 0 ? "whatsapp" : "manual",
        responsableId: equipo[indice % 2].id,
      },
    });
    contactos.push(contacto);
    await tx.expedientePaciente.upsert({
      where: { contactoId: contacto.id },
      update: {
        antecedentes: indice % 2 === 0 ? "Prefiere novedades por WhatsApp" : "Compra en tienda",
        observaciones: indice === 0 ? "Cliente frecuente" : null,
      },
      create: {
        contactoId: contacto.id,
        antecedentes: indice % 2 === 0 ? "Prefiere novedades por WhatsApp" : "Compra en tienda",
        observaciones: indice === 0 ? "Cliente frecuente" : null,
      },
    });
  }

  const productos = new Map();
  for (let indice = 0; indice < catalogo.length; indice++) {
    const [sku, nombre, categoria, precio, costo, stock, stockMinimo] = catalogo[indice];
    const producto = await tx.producto.upsert({
      where: { orgId_sku: { orgId: org.id, sku } },
      update: { nombre, categoria, precio, costo, stock, stockMinimo, activo: true, visibleEnLinea: true, agotadoManual: false, etiquetasEnLinea: indice < 2 ? ["temporada"] : [] },
      create: {
        sku,
        codigoBarras: `75010000000${String(indice).padStart(2, "0")}`,
        nombre,
        categoria,
        precio,
        costo,
        stock,
        stockMinimo,
        visibleEnLinea: true,
        etiquetasEnLinea: indice < 2 ? ["temporada"] : [],
      },
    });
    productos.set(sku, producto);
  }

  await tx.cotizacion.deleteMany({ where: { folio: { startsWith: "DEMO-COT-" } } });
  const cotizacionesDemo = [
    ["DEMO-COT-001", 0, "enviada", 10, [["CAM-001", 1]], "c07a2ac10de0486a92a29dd10c0ffee1"],
    ["DEMO-COT-002", 2, "aceptada", 12, [["VEL-003", 12]], "c07a2ac10de0486a92a29dd10c0ffee2"],
    ["DEMO-COT-003", 3, "borrador", 15, [["BOL-002", 1], ["ARE-007", 1]], "c07a2ac10de0486a92a29dd10c0ffee3"],
    ["DEMO-COT-004", 1, "rechazada", 5, [["TAZ-004", 4]], "c07a2ac10de0486a92a29dd10c0ffee4"],
    ["DEMO-COT-005", 5, "vencida", -3, [["PAN-006", 1]], "c07a2ac10de0486a92a29dd10c0ffee5"],
  ];
  for (const [folio, contactoIndice, estado, vigenciaDias, partidas, tokenPublico] of cotizacionesDemo) {
    const lineas = partidas.map(([sku, cantidad]) => {
      const producto = productos.get(sku);
      return { producto, cantidad, total: producto.precio.mul(String(cantidad)).toDecimalPlaces(2) };
    });
    const subtotal = lineas.reduce((suma, linea) => suma.plus(linea.total), new Prisma.Decimal(0));
    const impuestos = subtotal.mul("0.16").toDecimalPlaces(2);
    const respondida = estado === "aceptada" || estado === "rechazada";
    await tx.cotizacion.create({
      data: {
        folio, contactoId: contactos[Number(contactoIndice)].id, creadoPorId: admin.id, estado,
        vigencia: fechaMexico(Number(vigenciaDias), 12),
        notas: "Propuesta de ejemplo para revisar el documento público.",
        condiciones: "Vigencia de 10 días. Entrega sujeta a disponibilidad.",
        subtotal, impuestos, total: subtotal.plus(impuestos), ivaPorcentaje: 16, preciosConIva: false,
        tokenPublico, convertirVenta: true,
        respondidoPor: respondida ? contactos[Number(contactoIndice)].nombre : null,
        respondidoAt: respondida ? fechaMexico(-1, 16) : null,
        partidas: {
          create: lineas.map(({ producto, cantidad, total }) => ({
            productoId: producto.id, concepto: producto.nombre, cantidad, precio: producto.precio, descuento: 0, total,
          })),
        },
      },
    });
  }

  await tx.venta.deleteMany({ where: { folio: { startsWith: "DEMO-" } } });
  await tx.compra.deleteMany({ where: { folio: { startsWith: "DEMO-C-" } } });
  await tx.movimientoInventario.deleteMany({
    where: { productoId: { in: [...productos.values()].map((producto) => producto.id) } },
  });
  for (const [sku, producto] of productos) {
    const stock = new Prisma.Decimal(String(catalogo.find((item) => item[0] === sku)?.[5] ?? 0));
    await tx.producto.update({ where: { id: producto.id }, data: { stock } });
    await tx.movimientoInventario.create({
      data: {
        productoId: producto.id,
        usuarioId: admin.id,
        tipo: "entrada",
        cantidad: stock,
        existenciaAntes: 0,
        existenciaDespues: stock,
        motivo: "Inventario inicial de demostración",
      },
    });
    producto.stock = stock;
  }

  const proveedores = [];
  for (const [nombre, contactoNombre, telefono, emailProveedor] of [
    ["Textiles del Norte", "Isabel Peña", "8110002201", "ventas@textiles-norte.demo"],
    ["Taller Cerámico Sur", "René Casas", "8110002202", "pedidos@ceramica-sur.demo"],
    ["Accesorios Central", "Pilar Díaz", "8110002203", "hola@accesorios-central.demo"],
  ]) {
    proveedores.push(
      await tx.proveedor.upsert({
        where: { orgId_nombre: { orgId: org.id, nombre } },
        update: { contactoNombre, telefono, email: emailProveedor, activo: true },
        create: { nombre, contactoNombre, telefono, email: emailProveedor },
      }),
    );
  }

  const comprasDemo = [
    ["DEMO-C-001", 0, "recibida", [["CAM-001", 10, 400], ["TAZ-004", 8, 140]]],
    ["DEMO-C-002", 2, "ordenada", [["BOL-002", 6, 900], ["TEN-010", 4, 690]]],
  ];
  for (let indice = 0; indice < comprasDemo.length; indice++) {
    const [folio, proveedorIndice, estado, partidas] = comprasDemo[indice];
    const aplicaStock = estado === "recibida";
    const total = partidas.reduce(
      (suma, [, cantidad, costo]) => suma.plus(new Prisma.Decimal(String(costo)).mul(String(cantidad)).toDecimalPlaces(2)),
      new Prisma.Decimal(0),
    );
    const compra = await tx.compra.create({
      data: {
        folio,
        proveedorId: proveedores[Number(proveedorIndice)].id,
        creadoPorId: equipo[2].id,
        estado,
        total,
        stockAplicado: aplicaStock,
        createdAt: fechaMexico(-indice, 9 + indice),
      },
    });
    for (const [sku, cantidadValor, costoValor] of partidas) {
      const producto = productos.get(sku);
      const cantidad = new Prisma.Decimal(String(cantidadValor));
      const costo = new Prisma.Decimal(String(costoValor));
      await tx.compraPartida.create({
        data: {
          compraId: compra.id,
          productoId: producto.id,
          cantidad,
          costoUnitario: costo,
          total: costo.mul(cantidad).toDecimalPlaces(2),
        },
      });
      if (aplicaStock) {
        const anterior = producto.stock;
        producto.stock = producto.stock.plus(cantidad);
        producto.costo = costo;
        await tx.producto.update({
          where: { id: producto.id },
          data: { stock: producto.stock, costo },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: producto.id,
            compraId: compra.id,
            usuarioId: equipo[2].id,
            tipo: "compra",
            cantidad,
            existenciaAntes: anterior,
            existenciaDespues: producto.stock,
            motivo: `Compra ${folio}`,
          },
        });
      }
    }
  }

  const caja = await tx.caja.findFirstOrThrow({ where: { nombre: "Caja principal" } });
  await tx.turnoCaja.deleteMany({ where: { cajaId: caja.id } });
  const turnoAyer = await tx.turnoCaja.create({
    data: { cajaId: caja.id, usuarioId: equipo[1].id, fondoInicial: 500, abiertoAt: fechaMexico(-1, 9), cerradoAt: fechaMexico(-1, 20), estado: "cerrado" },
  });
  const turnoHoy = await tx.turnoCaja.create({
    data: { cajaId: caja.id, usuarioId: equipo[1].id, fondoInicial: 500, abiertoAt: fechaMexico(0, 9), estado: "abierto" },
  });
  let efectivoTurnoAyer = new Prisma.Decimal(0);

  const ventasCreadas = new Map();
  for (let indice = 0; indice < ventasDemo.length; indice++) {
    const [folio, contactoIndice, estado, canal, metodoPago, partidas, extra = {}] = ventasDemo[indice];
    const aplicaStock = estado !== "borrador" && estado !== "cancelada" && !extra.reserva;
    let subtotal = new Prisma.Decimal(0);
    for (const [sku, cantidad] of partidas) {
      subtotal = subtotal.plus(productos.get(sku).precio.mul(String(cantidad)).toDecimalPlaces(2));
    }
    const costoEnvio = new Prisma.Decimal(String(extra.costoEnvio ?? 0));
    const creadaAt = fechaMexico(extra.dia ?? (indice < 4 ? 0 : -indice + 3), 10 + (indice % 9));
    const turno = canal === "mostrador" ? (extra.dia === -1 ? turnoAyer : turnoHoy) : null;
    const venta = await tx.venta.create({
      data: {
        folio,
        contactoId: contactos[Number(contactoIndice)].id,
        creadoPorId: equipo[indice % equipo.length].id,
        estado,
        canal,
        metodoPago,
        subtotal,
        costoEnvio,
        total: subtotal.plus(costoEnvio),
        stockAplicado: aplicaStock,
        esCredito: folio === "DEMO-005",
        turnoId: turno?.id ?? null,
        cajaId: turno ? caja.id : null,
        vendidaAt: turno ? creadaAt : null,
        tokenSeguimiento: extra.token ?? (folio === "DEMO-003" ? "de003000000000000000000000000003" : null),
        tipoEntrega: extra.tipoEntrega ?? (canal === "tienda_en_linea" ? "recoger" : null),
        direccionEntrega: extra.tipoEntrega === "envio" ? "Calle Ejemplo 123, Col. Centro (dato ficticio)" : null,
        createdAt: creadaAt,
      },
    });
    if (turno && estado !== "cancelada") {
      await tx.pagoVenta.create({ data: { ventaId: venta.id, metodo: metodoPago, monto: subtotal } });
      if (turno.id === turnoAyer.id && metodoPago === "efectivo") efectivoTurnoAyer = efectivoTurnoAyer.plus(subtotal);
    }
    ventasCreadas.set(folio, venta);
    for (const [sku, cantidadValor] of partidas) {
      const producto = productos.get(sku);
      const cantidad = new Prisma.Decimal(String(cantidadValor));
      await tx.ventaPartida.create({
        data: {
          ventaId: venta.id,
          productoId: producto.id,
          cantidad,
          precioUnitario: producto.precio,
          total: producto.precio.mul(cantidad).toDecimalPlaces(2),
        },
      });
      if (extra.reserva) {
        await tx.reservaPedido.create({ data: { ventaId: venta.id, productoId: producto.id, cantidad, activa: true } });
      }
      if (aplicaStock) {
        const anterior = producto.stock;
        producto.stock = producto.stock.minus(cantidad);
        await tx.producto.update({
          where: { id: producto.id },
          data: { stock: producto.stock },
        });
        await tx.movimientoInventario.create({
          data: {
            productoId: producto.id,
            ventaId: venta.id,
            usuarioId: equipo[indice % equipo.length].id,
            tipo: "venta",
            cantidad: -cantidad,
            existenciaAntes: anterior,
            existenciaDespues: producto.stock,
            motivo: `Venta ${folio}`,
          },
        });
      }
    }
  }

  const esperadoAyer = turnoAyer.fondoInicial.plus(efectivoTurnoAyer);
  await tx.turnoCaja.update({
    where: { id: turnoAyer.id },
    data: { efectivoEsperado: esperadoAyer, efectivoContado: esperadoAyer, diferencia: 0 },
  });

  const ventaCredito = ventasCreadas.get("DEMO-005");
  const cuenta = await tx.cuentaCliente.upsert({
    where: { contactoId: contactos[4].id },
    update: { limiteCredito: 3000, saldo: ventaCredito.total },
    create: { contactoId: contactos[4].id, limiteCredito: 3000, saldo: ventaCredito.total },
  });
  await tx.movimientoCuentaCliente.deleteMany({ where: { cuentaId: cuenta.id } });
  await tx.movimientoCuentaCliente.create({
    data: {
      cuentaId: cuenta.id,
      ventaId: ventaCredito.id,
      usuarioId: equipo[0].id,
      tipo: "cargo",
      monto: ventaCredito.total,
      saldoAntes: 0,
      saldoDespues: ventaCredito.total,
      referencia: ventaCredito.folio,
    },
  });
  await sembrarActividadDemo(tx, org, PERFIL_RETAIL);
});

imprimirCredencialesDemo({
  nombre: "retail",
  slug: "demo-retail",
  email,
  password,
  passwordGenerada,
});
await prisma.$disconnect();

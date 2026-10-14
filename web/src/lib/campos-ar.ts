import type { CampoFormulario, OpcionCampo } from "@/components/modulos/FormularioModulo";
import { ESTADOS_CONTRATO, METODOS_COBRO, TIPOS_CONTRATO } from "./contratos-cobros";

const opciones = (valores: readonly string[]) => valores.map((valor) => ({ valor, etiqueta: valor.replaceAll("_", " ") }));
export function camposContrato(contactos?: OpcionCampo[]): CampoFormulario[] {
  return [
    { nombre: "contactoId", etiqueta: "Cliente", tipo: contactos ? "seleccion" : "contacto", requerido: true, opciones: contactos },
    { nombre: "tipo", etiqueta: "Servicio", tipo: "seleccion", opciones: opciones(TIPOS_CONTRATO) },
    { nombre: "estado", etiqueta: "Estado", tipo: "seleccion", opciones: [{ valor: "", etiqueta: "Por confirmar" }, ...opciones(ESTADOS_CONTRATO)] },
    { nombre: "montoCierre", etiqueta: "Monto de cierre (MXN)", tipo: "dinero", ayuda: "Vacío si falta confirmar. 0 para trueque." },
    { nombre: "anticipoPct", etiqueta: "Anticipo (%)", tipo: "dinero", valorInicial: "50", ayuda: "50 % por defecto. Si falta confirmar el anticipo real, deja vacío el monto de cierre al dar de alta." },
    { nombre: "mensualidad", etiqueta: "Mensualidad (MXN)", tipo: "dinero" },
    { nombre: "diaCobro", etiqueta: "Día de cobro (1–28)", tipo: "numero", ayuda: "Sin día de cobro no se generan mensualidades." },
    { nombre: "inicioMensualidad", etiqueta: "Inicio de mensualidad", tipo: "fecha" },
    { nombre: "fechaBaja", etiqueta: "Fecha de baja", tipo: "fecha" },
    { nombre: "oportunidadId", etiqueta: "ID de oportunidad (opcional)", tipo: "numero" },
    { nombre: "notas", etiqueta: "Notas y datos por confirmar", tipo: "textarea" },
  ];
}

export function camposPago(esAdmin: boolean): CampoFormulario[] {
  return [
    { nombre: "estado", etiqueta: "Acción", tipo: "seleccion", opciones: opciones(esAdmin ? ["pagado", "incobrable", "cancelado"] : ["pagado"]) },
    { nombre: "metodo", etiqueta: "Método de pago", tipo: "seleccion", opciones: opciones(METODOS_COBRO) },
    { nombre: "referencia", etiqueta: "Referencia", tipo: "texto" },
    { nombre: "nota", etiqueta: "Nota", tipo: "textarea", ayuda: "Obligatoria al cancelar o marcar incobrable." },
  ];
}

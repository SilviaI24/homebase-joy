// M-03: dividido por dominio en mutations-cliente/inmueble/visita/prospecto/
// seguimiento.functions.ts + helpers compartidos en mutations-shared.ts. Este
// archivo queda como barrel para no tocar los 15 consumidores que importan
// desde aquí.
export { type CreateClientePayload, createCliente } from "./mutations-cliente.functions";
export { type CreateInmueblePayload, createInmueble } from "./mutations-inmueble.functions";
export {
  type CreateVisitaPayload,
  createVisita,
  updateVisitaEstado,
  type UpdateVisitaPayload,
  updateVisita,
  deleteVisita,
} from "./mutations-visita.functions";
export {
  type AssignClientePayload,
  assignClienteAgentes,
  type ActivarProspectoPayload,
  type CreateProspectoManualPayload,
  createProspectoManual,
  activarProspecto,
} from "./mutations-prospecto.functions";
export {
  ESTADOS_SEGUIMIENTO,
  type EstadoSeguimiento,
  type SeguimientoPayload,
  updateClienteSeguimiento,
  asociarLeadAInmueble,
  checkDuplicates,
  sendWhatsAppReply,
  TIPOS_INTERES,
  type TipoInteres,
  marcarTipoInteresLead,
} from "./mutations-seguimiento.functions";

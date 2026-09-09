// M-03: dividido en src/components/create-dialogs/ (NewClienteDialog,
// NewInmuebleDialog, NewVisitaDialog + primitivos compartidos en shared.tsx
// y catálogo de campos en @/lib/inmueble-schema.ts). Este archivo queda como
// barrel para no tocar los 7 consumidores que importan desde aquí.
export { NewClienteDialog } from "@/components/create-dialogs/NewClienteDialog";
export { NewInmuebleDialog } from "@/components/create-dialogs/NewInmuebleDialog";
export { NewVisitaDialog } from "@/components/create-dialogs/NewVisitaDialog";

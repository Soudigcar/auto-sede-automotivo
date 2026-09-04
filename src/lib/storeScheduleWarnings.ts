export const STORE_SCHEDULE_CONFLICT_WARNING =
  'Atenção: já existe outro Agendamento, Visita ou Tarefa neste horário. O novo compromisso foi salvo mesmo assim.';

export function getStoreScheduleConflictWarning(hasConflict: boolean) {
  return hasConflict ? STORE_SCHEDULE_CONFLICT_WARNING : null;
}

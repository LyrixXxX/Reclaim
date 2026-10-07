import { CpapEquipment, CpapMaintenanceEvent, CpapMaintenanceItem, TrackerState } from '@/models/tracker';

export const DAY_MS = 86_400_000;

export function createCpapCareState(state: TrackerState, today = localDateKey()): TrackerState {
  if (state.cpapEquipment && state.cpapMaintenanceItems && state.cpapMaintenanceEvents) return state;
  const equipment: CpapEquipment[] = state.cpapEquipment ?? [
    { id: 'luna-g3', name: 'Luna G3', kind: 'machine', status: 'current' },
    { id: 'swift-fx-bella', name: 'ResMed Swift FX Bella', kind: 'mask', status: 'current' },
    { id: 'airtouch-n30i', name: 'ResMed AirTouch N30i', kind: 'mask', status: 'upcoming' },
  ];
  const items: CpapMaintenanceItem[] = state.cpapMaintenanceItems ?? [
    item('clean-mask', 'swift-fx-bella', 'Clean mask', 'clean', 7, today, 'Your weekly routine'),
    item('inspect-cushion', 'swift-fx-bella', 'Inspect nasal pillows', 'inspect', 14, today, 'Replace if the seal, shape, comfort, or material deteriorates'),
    item('clean-hose', 'luna-g3', 'Clean hose', 'clean', 7, today, 'Your weekly routine'),
    item('clean-water-tank', 'luna-g3', 'Clean water tank', 'clean', 7, today, 'Your weekly routine'),
    item('inspect-reusable-filter', 'luna-g3', 'Inspect black reusable filter', 'inspect', 7, today, 'Your weekly routine'),
    item('replace-paper-filter', 'luna-g3', 'Replace paper filter', 'replace', 28, undefined, 'Paper / optional ultra-fine filter'),
    item('replace-reusable-filter', 'luna-g3', 'Replace black reusable filter', 'replace', 180, undefined, 'Inspect sooner for damage or blockage'),
    item('n30i-clean-cushion', 'airtouch-n30i', 'Clean AirTouch N30i cushion', 'clean', 7, undefined, 'Your chosen weekly routine; manufacturer instructions are available in the mask guide', false),
    item('n30i-inspect-cushion', 'airtouch-n30i', 'Inspect AirTouch N30i cushion', 'inspect', 14, undefined, 'Inspection reminder—not an automatic expiration date', false),
    item('n30i-clean-frame', 'airtouch-n30i', 'Clean AirTouch N30i frame', 'clean', 7, undefined, 'Weekly cleaning with mild liquid detergent', false),
    item('n30i-inspect-frame', 'airtouch-n30i', 'Inspect AirTouch N30i frame', 'inspect', 90, undefined, 'Replacement timing is adjustable', false),
    item('n30i-inspect-headgear', 'airtouch-n30i', 'Inspect AirTouch N30i headgear', 'inspect', 180, undefined, 'Replacement timing is adjustable', false),
  ];
  return { ...state, cpapEquipment: equipment, cpapMaintenanceItems: items, cpapMaintenanceEvents: state.cpapMaintenanceEvents ?? [] };
}

function item(id: string, equipmentId: string, label: string, category: CpapMaintenanceItem['category'], intervalDays: number, lastCompletedAt?: string, guidance?: string, enabled = true): CpapMaintenanceItem {
  return { id, equipmentId, label, category, intervalDays, lastCompletedAt, guidance, enabled };
}

export function maintenanceDueDate(item: CpapMaintenanceItem) {
  if (!item.enabled || !item.lastCompletedAt) return undefined;
  const due = new Date(`${item.lastCompletedAt.slice(0, 10)}T12:00:00`); due.setDate(due.getDate() + item.intervalDays);
  return localDateKey(due);
}

export function maintenanceStatus(item: CpapMaintenanceItem, today = localDateKey()) {
  if (!item.enabled) return 'paused' as const;
  const due = maintenanceDueDate(item);
  if (!due) return 'not_set' as const;
  if (due < today) return 'overdue' as const;
  if (due === today) return 'due' as const;
  return 'upcoming' as const;
}

export function completeMaintenance(state: TrackerState, itemId: string, completedAt = localDateKey(), eventId = `care-${Date.now()}`): TrackerState {
  if (!(state.cpapMaintenanceItems ?? []).some((item) => item.id === itemId)) return state;
  const event: CpapMaintenanceEvent = { id: eventId, itemId, completedAt };
  return { ...state, cpapMaintenanceItems: state.cpapMaintenanceItems!.map((item) => item.id === itemId ? { ...item, lastCompletedAt: completedAt } : item), cpapMaintenanceEvents: [...(state.cpapMaintenanceEvents ?? []), event] };
}

export function updateMaintenanceInterval(state: TrackerState, itemId: string, intervalDays: number): TrackerState {
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650) return state;
  return { ...state, cpapMaintenanceItems: (state.cpapMaintenanceItems ?? []).map((item) => item.id === itemId ? { ...item, intervalDays } : item) };
}

export function installCpapMask(state: TrackerState, equipmentId: string, installedAt = localDateKey()): TrackerState {
  const selected = (state.cpapEquipment ?? []).find((equipment) => equipment.id === equipmentId && equipment.kind === 'mask');
  if (!selected) return state;
  return {
    ...state,
    cpapEquipment: state.cpapEquipment!.map((equipment) => equipment.kind !== 'mask' ? equipment : equipment.id === equipmentId ? { ...equipment, status: 'current', installedAt } : equipment.status === 'current' ? { ...equipment, status: 'retired' } : equipment),
    cpapMaintenanceItems: (state.cpapMaintenanceItems ?? []).map((item) => item.equipmentId === equipmentId ? { ...item, enabled: true, lastCompletedAt: installedAt } : item),
  };
}

export function localDateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

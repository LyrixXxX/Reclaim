import { completeMaintenance, createCpapCareState, installCpapMask, maintenanceDueDate, maintenanceStatus, updateMaintenanceInterval } from './cpap-maintenance';
import { TrackerState } from '@/models/tracker';

const empty: TrackerState = { trackers: [], checkIns: [] };

describe('CPAP maintenance', () => {
  test('seeds separate equipment and pauses the upcoming mask', () => {
    const state = createCpapCareState(empty, '2026-09-12');
    expect(state.cpapEquipment?.find((item) => item.id === 'airtouch-n30i')?.status).toBe('upcoming');
    expect(state.cpapMaintenanceItems?.find((item) => item.id === 'n30i-clean-cushion')?.enabled).toBe(false);
    expect(state.cpapMaintenanceItems?.find((item) => item.id === 'replace-paper-filter')?.intervalDays).toBe(28);
  });
  test('calculates due dates and completion history', () => {
    let state = createCpapCareState(empty, '2026-09-12');
    state = completeMaintenance(state, 'clean-hose', '2026-09-12', 'event-1');
    const hose = state.cpapMaintenanceItems!.find((item) => item.id === 'clean-hose')!;
    expect(maintenanceDueDate(hose)).toBe('2026-09-19');
    expect(maintenanceStatus(hose, '2026-09-20')).toBe('overdue');
    expect(state.cpapMaintenanceEvents).toContainEqual({ id: 'event-1', itemId: 'clean-hose', completedAt: '2026-09-12' });
  });
  test('updates intervals without losing completion history', () => {
    const state = completeMaintenance(createCpapCareState(empty, '2026-09-12'), 'clean-mask', '2026-09-12', 'event-1');
    const updated = updateMaintenanceInterval(state, 'clean-mask', 10);
    expect(updated.cpapMaintenanceItems?.find((item) => item.id === 'clean-mask')?.intervalDays).toBe(10);
    expect(updated.cpapMaintenanceEvents).toHaveLength(1);
  });
  test('activates a new mask and retires the prior mask', () => {
    const state = installCpapMask(createCpapCareState(empty, '2026-09-12'), 'airtouch-n30i', '2026-09-19');
    expect(state.cpapEquipment?.find((item) => item.id === 'airtouch-n30i')?.status).toBe('current');
    expect(state.cpapEquipment?.find((item) => item.id === 'swift-fx-bella')?.status).toBe('retired');
    expect(state.cpapMaintenanceItems?.find((item) => item.id === 'n30i-clean-cushion')?.lastCompletedAt).toBe('2026-09-19');
  });
});

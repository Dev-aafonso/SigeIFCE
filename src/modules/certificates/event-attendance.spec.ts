import { ActionStatus, RegistrationStatus } from '../../generated/prisma/client';
import { calculateEventAttendance } from './event-attendance';

const active = (id: string, minutes: number, present: boolean, status = ActionStatus.ENCERRADA) => ({
  status: RegistrationStatus.ACTIVE,
  action: { id, durationMinutes: minutes, status },
  presence: present ? { id: `presence-${id}` } : null,
});

describe('RN23 — presença consolidada por evento', () => {
  it('soma carga horária frequentada e inscrita e calcula 75%', () => {
    expect(calculateEventAttendance([
      active('a', 120, true), active('b', 60, false), active('c', 60, true),
    ])).toEqual({ enrolledMinutes: 240, attendedMinutes: 180, attendancePercent: 75, enrolledActions: 3, attendedActions: 2 });
  });

  it('não contabiliza inscrição cancelada nem ação cancelada', () => {
    const cancelled = { ...active('b', 600, true), status: RegistrationStatus.CANCELLED };
    expect(calculateEventAttendance([active('a', 60, true), cancelled, active('c', 600, true, ActionStatus.CANCELADA)]).enrolledMinutes).toBe(60);
  });

  it('não divide por zero quando não há inscrições elegíveis', () => {
    expect(calculateEventAttendance([]).attendancePercent).toBe(0);
  });

  it('não duplica ações e descarta carga horária inválida', () => {
    const result = calculateEventAttendance([active('a', 90, true), active('a', 90, true), active('b', -30, true)]);
    expect(result.enrolledMinutes).toBe(90);
    expect(result.attendedMinutes).toBe(90);
  });
});

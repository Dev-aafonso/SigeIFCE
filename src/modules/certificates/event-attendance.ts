import { ActionStatus, RegistrationStatus } from '../../generated/prisma/client';

export type AttendanceRegistration = {
  status: RegistrationStatus;
  action: { id: string; status: ActionStatus; durationMinutes: number };
  presence: { id: string } | null;
};

export type EventAttendanceSummary = {
  enrolledMinutes: number;
  attendedMinutes: number;
  attendancePercent: number;
  enrolledActions: number;
  attendedActions: number;
};

/**
 * Consolidates attendance by eligible enrolled actions, not by individual certificate.
 * Cancelled registrations and actions contribute neither to the denominator nor numerator.
 * Invalid or duplicate action records must not inflate the total.
 */
export function calculateEventAttendance(
  registrations: readonly AttendanceRegistration[],
): EventAttendanceSummary {
  const seenActions = new Set<string>();
  let enrolledMinutes = 0;
  let attendedMinutes = 0;
  let enrolledActions = 0;
  let attendedActions = 0;

  for (const registration of registrations) {
    if (registration.status !== RegistrationStatus.ACTIVE || registration.action.status === ActionStatus.CANCELADA) continue;
    const { id, durationMinutes } = registration.action;
    if (!id || seenActions.has(id) || !Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) continue;
    seenActions.add(id);
    enrolledMinutes += durationMinutes;
    enrolledActions += 1;
    if (registration.presence !== null) {
      attendedMinutes += durationMinutes;
      attendedActions += 1;
    }
  }

  return {
    enrolledMinutes,
    attendedMinutes,
    attendancePercent: enrolledMinutes > 0 ? Number(((attendedMinutes / enrolledMinutes) * 100).toFixed(2)) : 0,
    enrolledActions,
    attendedActions,
  };
}

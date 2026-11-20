'use client';
import { CalendarView } from '@/components/pwm/CalendarView';
import { PageHeader } from '@/components/pwm/ui';

export default function HrCalendar() {
  return (
    <div>
      <PageHeader title="HR calendar" sub="Holidays, approved leave, contract expiries, probation ends, review deadlines and interviews in one view." />
      <CalendarView endpoint="/admin/pwm/calendar" />
    </div>
  );
}

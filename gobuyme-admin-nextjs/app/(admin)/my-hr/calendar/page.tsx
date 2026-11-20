'use client';
import { CalendarView } from '@/components/pwm/CalendarView';
import { PageHeader } from '@/components/pwm/ui';

export default function MyCalendar() {
  return (
    <div>
      <PageHeader title="Calendar" sub="Public holidays, your leave, and who in your department is away. Colleagues' leave shows as away only." />
      <CalendarView endpoint="/my-hr/calendar" />
    </div>
  );
}

// Suggestions for improving how the department works, from its own recorded numbers (PRD phase 4: automated
// workflow improvements). Fixed rules, no model: every suggestion shows the figures that triggered it.

export interface WorkflowMetrics {
  approvals: { reviewed: number; avgHours: number | null; queueNow: number; oldestHours: number | null; revisionRatePct: number | null; rejectRatePct: number | null };
  publishing: { published: number; failed: number };
  tasks: { open: number; overdue: number; completed: number; completedLate: number };
  inbox: { answered: number; missedTarget: number; byBand: { band: string; received: number; missed: number }[] };
  coverage: { accounts: number; withoutAssignee: number; assignedButQuiet: { name: string; days: number }[]; staleReadings: number };
  assets: { expiringSoon: number; expired: number };
  windowDays: number;
}

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export interface Finding { key: string; severity: Severity; title: string; evidence: string; suggestion: string; link: string }

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const RANK: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const workflowFindings = (m: WorkflowMetrics): Finding[] => {
  const out: Finding[] = [];
  const w = `in the last ${m.windowDays} days`;

  // Approval flow
  if (m.approvals.reviewed >= 5 && m.approvals.avgHours !== null && m.approvals.avgHours > 24) {
    out.push({ key: 'approvals-slow', severity: m.approvals.avgHours > 48 ? 'HIGH' : 'MEDIUM', title: 'Content waits too long for a decision', link: '/smois/approvals',
      evidence: `Reviews took ${m.approvals.avgHours} hours on average ${w} (${m.approvals.reviewed} reviews); ${m.approvals.queueNow} waiting now${m.approvals.oldestHours !== null ? `, the oldest ${m.approvals.oldestHours} hours` : ''}.`,
      suggestion: 'Name a second reviewer, or shorten the approval reminder time in Social Settings, so posts are not held up.' });
  } else if (m.approvals.queueNow >= 3 && (m.approvals.oldestHours ?? 0) > 24) {
    out.push({ key: 'approvals-queue', severity: 'MEDIUM', title: 'A queue is building in approvals', link: '/smois/approvals',
      evidence: `${m.approvals.queueNow} items are waiting, the oldest for ${m.approvals.oldestHours} hours.`, suggestion: 'Clear the oldest items first, or ask another approver to help.' });
  }
  if (m.approvals.reviewed >= 8 && m.approvals.revisionRatePct !== null && m.approvals.revisionRatePct >= 40) {
    out.push({ key: 'revisions-high', severity: 'MEDIUM', title: 'Many posts come back for changes', link: '/smois/approvals',
      evidence: `${m.approvals.revisionRatePct}% of ${m.approvals.reviewed} reviews ${w} asked for changes.`, suggestion: 'Agree a short checklist (tone, links, media, length) before submitting, and add recurring feedback to the saved guidance.' });
  }

  // Publishing
  const failRate = pct(m.publishing.failed, m.publishing.published + m.publishing.failed);
  if (m.publishing.failed >= 2 && failRate !== null && failRate >= 10) {
    out.push({ key: 'publish-failures', severity: failRate >= 25 ? 'HIGH' : 'MEDIUM', title: 'Posts are failing to publish', link: '/smois/publishing?status=PUBLISH_FAILED',
      evidence: `${m.publishing.failed} failed against ${m.publishing.published} published ${w} (${failRate}%).`, suggestion: 'Look at the recorded errors for a pattern (image size, expired link, platform rules) and add it to the checklist.' });
  }

  // Tasks
  const overduePct = pct(m.tasks.overdue, m.tasks.open);
  if (m.tasks.open >= 4 && overduePct !== null && overduePct >= 25) {
    out.push({ key: 'tasks-overdue', severity: overduePct >= 50 ? 'HIGH' : 'MEDIUM', title: 'Too many tasks are overdue', link: '/smois/tasks?view=overdue',
      evidence: `${m.tasks.overdue} of ${m.tasks.open} open tasks are past their deadline (${overduePct}%).`, suggestion: 'Rebalance the workload or move deadlines that were unrealistic, so overdue stays meaningful.' });
  }
  const latePct = pct(m.tasks.completedLate, m.tasks.completed);
  if (m.tasks.completed >= 8 && latePct !== null && latePct >= 40) {
    out.push({ key: 'tasks-late', severity: 'LOW', title: 'Finished tasks are often late', link: '/smois/tasks?view=done',
      evidence: `${m.tasks.completedLate} of ${m.tasks.completed} completed tasks ${w} were finished after the deadline.`, suggestion: 'Deadlines may be set too tightly: compare typical completion time with what you ask for.' });
  }

  // Inbox
  const missRate = pct(m.inbox.missedTarget, m.inbox.answered);
  if (m.inbox.answered >= 8 && missRate !== null && missRate >= 25) {
    out.push({ key: 'inbox-slow', severity: missRate >= 50 ? 'HIGH' : 'MEDIUM', title: 'Replies are missing the response target', link: '/smois/inbox',
      evidence: `${m.inbox.missedTarget} of ${m.inbox.answered} answered conversations ${w} missed their target (${missRate}%).`, suggestion: 'Check who owns the queue at those times, and consider saved replies for the most common questions.' });
  }
  const worst = [...m.inbox.byBand].filter((b) => b.received >= 5).map((b) => ({ ...b, rate: pct(b.missed, b.received) ?? 0 })).sort((a, b) => b.rate - a.rate)[0];
  if (worst && worst.rate >= 40) {
    out.push({ key: 'inbox-hours', severity: 'MEDIUM', title: `Replies slip in the ${worst.band.toLowerCase()}`, link: '/smois/inbox',
      evidence: `${worst.missed} of ${worst.received} conversations received in that part of the day missed their target (${worst.rate}%).`, suggestion: 'Rotate cover for that period, or set expectations for it in your auto-reply.' });
  }

  // Coverage
  if (m.coverage.withoutAssignee > 0) {
    out.push({ key: 'accounts-unassigned', severity: 'HIGH', title: 'Accounts with nobody assigned', link: '/smois/accounts',
      evidence: `${m.coverage.withoutAssignee} of ${m.coverage.accounts} accounts have no current assignee.`, suggestion: 'Assign at least a primary manager so content, replies and readings have an owner.' });
  }
  for (const q of m.coverage.assignedButQuiet.slice(0, 3)) {
    out.push({ key: `quiet-${q.name}`, severity: 'LOW', title: `${q.name} has gone quiet`, link: '/smois/calendar',
      evidence: `No post has gone out on ${q.name} for ${q.days} days although it has an assigned manager.`, suggestion: 'Check the calendar for gaps and plan the next posts.' });
  }
  if (m.coverage.staleReadings > 0) {
    out.push({ key: 'readings-stale', severity: 'LOW', title: 'Growth figures are going stale', link: '/smois/analytics',
      evidence: `${m.coverage.staleReadings} of ${m.coverage.accounts} accounts have no reading in the last 7 days.`, suggestion: 'Record the latest follower and reach figures so comparisons and forecasts stay trustworthy.' });
  }

  // Library
  if (m.assets.expired > 0 || m.assets.expiringSoon > 0) {
    out.push({ key: 'assets-expiry', severity: m.assets.expired > 0 ? 'MEDIUM' : 'LOW', title: 'Library assets need renewing', link: '/smois/media',
      evidence: `${m.assets.expired} expired and ${m.assets.expiringSoon} expiring within two weeks.`, suggestion: 'Renew the usage rights or add a replacement version before content is planned around them.' });
  }

  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
};

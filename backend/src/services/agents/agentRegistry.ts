import { AgentMode } from '@prisma/client';
import { AgentActionType } from './agentActions';

// Static definition of each agent: what it may do and its default behaviour. The live settings
// (mode, which actions run without approval, thresholds) are stored in AgentConfig and edited by
// a super admin in Admin → Agents; anything not stored falls back to these defaults.

export interface AgentDefinition {
  key: string;
  name: string;
  description: string;
  actions: AgentActionType[];
  defaults: {
    mode: AgentMode;
    autoActions: AgentActionType[];
    settings: Record<string, number>;
  };
  /** Human labels + bounds for each numeric setting, for validation and the settings form. */
  settingsSpec: Record<string, { label: string; min: number; max: number }>;
}

export const DISPATCH_WATCHER = 'dispatch_watcher';
export const TICKET_TRIAGER = 'ticket_triager';

export const AGENTS: Record<string, AgentDefinition> = {
  [DISPATCH_WATCHER]: {
    key: DISPATCH_WATCHER,
    name: 'Dispatch watcher',
    description:
      'Checks every minute for orders waiting on a rider, deliveries that have stalled, and vendors running late. '
      + 'Alerts nearby riders, then proposes an assignment, then a cancellation if nobody can take the order.',
    actions: ['NOTIFY_RIDERS', 'ASSIGN_RIDER', 'CANCEL_ORDER', 'FOLLOW_UP'],
    defaults: {
      // AUTO with only rider alerts allowed: pushing a job to nearby riders is harmless and time
      // critical; assigning and cancelling wait for a person until the owner says otherwise.
      mode: AgentMode.AUTO,
      autoActions: ['NOTIFY_RIDERS'],
      settings: {
        notifyAfterMinutes: 5,
        suggestAssignAfterMinutes: 10,
        suggestCancelAfterMinutes: 25,
        deliveryStallMinutes: 60,
        preparingStallMinutes: 45,
        notifyRadiusKm: 8,
        maxRidersPerAlert: 10,
        lookbackHours: 6,
        suggestionTtlMinutes: 60,
      },
    },
    settingsSpec: {
      notifyAfterMinutes: { label: 'Alert nearby riders after (min)', min: 1, max: 120 },
      suggestAssignAfterMinutes: { label: 'Suggest a rider after (min)', min: 1, max: 180 },
      suggestCancelAfterMinutes: { label: 'Suggest cancelling after (min)', min: 5, max: 240 },
      deliveryStallMinutes: { label: 'Flag delivery stalled after (min)', min: 15, max: 480 },
      preparingStallMinutes: { label: 'Flag vendor slow after (min)', min: 10, max: 480 },
      notifyRadiusKm: { label: 'Rider alert radius (km)', min: 1, max: 50 },
      maxRidersPerAlert: { label: 'Max riders per alert', min: 1, max: 50 },
      lookbackHours: { label: 'Ignore orders older than (hours)', min: 1, max: 72 },
      suggestionTtlMinutes: { label: 'Suggestions expire after (min)', min: 5, max: 1440 },
    },
  },
  [TICKET_TRIAGER]: {
    key: TICKET_TRIAGER,
    name: 'Ticket triager',
    description:
      'Reads each new support ticket with the order\'s history, corrects its category and priority, writes a short '
      + 'briefing for staff, drafts a reply, and suggests goodwill credit when the service clearly failed. '
      + 'Replies and credit always wait for a person.',
    actions: ['TRIAGE_TICKET', 'SEND_TICKET_REPLY', 'ISSUE_TICKET_CREDIT'],
    defaults: {
      mode: AgentMode.AUTO,
      autoActions: ['TRIAGE_TICKET'],
      settings: {
        lookbackHours: 24,
        maxTicketsPerRun: 5,
        maxSuggestedCredit: 2000,
        suggestionTtlMinutes: 720,
      },
    },
    settingsSpec: {
      lookbackHours: { label: 'Only triage tickets newer than (hours)', min: 1, max: 168 },
      maxTicketsPerRun: { label: 'Max tickets per minute', min: 1, max: 20 },
      maxSuggestedCredit: { label: 'Max credit it may suggest (₦)', min: 0, max: 50000 },
      suggestionTtlMinutes: { label: 'Suggestions expire after (min)', min: 30, max: 4320 },
    },
  },
};

import cron from 'node-cron';
import { runTicketTriagerTick } from '../services/agents/ticketTriager';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// Runs the ticket triager agent every minute. Turn it off from Admin → Agents (mode OFF);
// TICKET_TRIAGER_ENABLED=false stops the job entirely on this server.
let running = false;

export const startTicketTriagerJob = (): void => {
  if (process.env.TICKET_TRIAGER_ENABLED === 'false') {
    logger.info('Ticket triager job disabled (TICKET_TRIAGER_ENABLED=false)');
    return;
  }
  cron.schedule('* * * * *', async () => {
    if (running) return; // model calls can be slow; never overlap ticks
    running = true;
    try {
      await runTicketTriagerTick();
    } catch (err) {
      recordError('ticket-triager', 'Ticket triager tick failed', err);
    } finally {
      running = false;
    }
  });
  logger.info('Ticket triager agent scheduled (every minute)');
};

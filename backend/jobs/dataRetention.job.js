import supabase from '../config/supabase.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';

/**
 * Deleting records that are past their retention period.
 *
 * Every rule here is a hard DELETE, not an archive. `ARCHIVE_STATUSES` sat
 * unused beneath this for the life of the file and the log line still said
 * "Archived": the name promised something the code never did, on seven tables
 * including `bookings`.
 *
 * `statusColumn` is the column each table actually has. `payments` has
 * `payment_status` and no `status`, and `chat_sessions` has neither, so those
 * two rules errored on every run - the retention they describe was never
 * applied, and the failure was only ever a console line.
 */
const RETENTION_RULES = {
  inquiries: { years: 7, statusColumn: 'status', status: ['archived', 'rejected'] },
  payments: { years: 10, statusColumn: 'payment_status', status: ['completed', 'failed'] },
  audit_logs: { years: 2, statusColumn: null, status: null },
  chat_sessions: { years: 1, statusColumn: null, status: null },
  application_drafts: { years: 0.5, statusColumn: null, status: null },
  visa_applications: { years: 10, statusColumn: 'status', status: ['completed', 'rejected', 'archived'] },
  bookings: { years: 7, statusColumn: 'status', status: ['completed', 'cancelled'] }
};

/**
 * Only production deletes.
 *
 * Local development and production share one database, and this job was started
 * under a bare `NODE_ENV !== 'test'` in `backend/server.js` - which is what
 * `npm run dev` launches. Every developer's laptop was therefore running a hard
 * DELETE across seven production tables every 24 hours. The two jobs beside it,
 * `bookingQueue` and `abandonedCheckout`, were both given this guard for exactly
 * this reason; the one that deletes never got it.
 *
 * `BOOKING_QUEUE_ENV` names production explicitly (utils/queueEnvironment.js):
 * NODE_ENV cannot be used, because `npm start` sets it to production on any
 * machine.
 */
export const retentionMayDelete = (env = process.env) => queueEnvironment(env) === 'production';

export async function archiveOldRecords({ env = process.env } = {}) {
  const results = {};

  if (!retentionMayDelete(env)) {
    console.log(`[Retention] Not deleting: this is '${queueEnvironment(env)}', not production`);
    return results;
  }

  for (const [table, config] of Object.entries(RETENTION_RULES)) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - config.years);

      let query = supabase
        .from(table)
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (config.statusColumn && config.status?.length > 0) {
        query = query.in(config.statusColumn, config.status);
      }

      const { data, error } = await query.select('id');

      if (error) {
        console.error(`[Retention] Error archiving ${table}:`, error.message);
        results[table] = { success: false, error: error.message };
      } else {
        const count = data?.length || 0;
        // Said "Archived" for a hard DELETE, on seven tables including bookings.
        console.log(`[Retention] Deleted ${count} records from ${table}`);
        results[table] = { success: true, deleted: count };
      }
    } catch (err) {
      console.error(`[Retention] Exception for ${table}:`, err.message);
      results[table] = { success: false, error: err.message };
    }
  }

  return results;
}

export async function softDeleteUserData(userId, scheduleDays = 30) {
  const scheduledDeletion = new Date();
  scheduledDeletion.setDate(scheduledDeletion.getDate() + scheduleDays);

  await supabase.from('users')
    .update({
      deletion_scheduled_at: scheduledDeletion.toISOString(),
      data_status: 'pending_deletion'
    })
    .eq('id', userId);

  await supabase.from('audit_logs').insert([{
    actor_id: 'system',
    actor_type: 'system',
    action: 'scheduled_deletion',
    target_type: 'user',
    target_id: userId,
    metadata: { scheduled_deletion: scheduledDeletion.toISOString(), days: scheduleDays }
  }]);

  console.log(`[Retention] User ${userId} scheduled for deletion in ${scheduleDays} days`);
}

export async function processScheduledDeletions({ env = process.env } = {}) {
  const now = new Date().toISOString();

  // Erases a person's records. Same guard as archiveOldRecords, for the same
  // reason: this ran on every developer's laptop against the shared database.
  if (!retentionMayDelete(env)) {
    console.log(`[Retention] Not processing deletions: this is '${queueEnvironment(env)}', not production`);
    return;
  }

  const { data: users } = await supabase
    .from('users')
    .select('id, email')
    .lte('deletion_scheduled_at', now)
    .eq('data_status', 'pending_deletion');

  if (!users?.length) {
    console.log('[Retention] No scheduled deletions to process');
    return;
  }

  for (const user of users) {
    await performHardDelete(user.id);
  }

  console.log(`[Retention] Processed ${users.length} scheduled deletions`);
}

async function performHardDelete(userId) {
  // `payments` is deliberately absent: RETENTION_RULES keeps it for 10 years,
  // and this deleted a user's payment records the moment their deletion came
  // due - the financial record a refund dispute or an audit is settled from.
  // A deletion request does not shorten a statutory retention period.
  const tables = ['inquiries', 'chat_sessions', 'application_drafts', 'visa_applications'];

  for (const table of tables) {
    await supabase.from(table).delete().eq('user_id', userId);
  }

  await supabase.from('users')
    .update({ 
      email: `deleted_${userId.slice(0,8)}@deleted.local`,
      name: 'Deleted User',
      deleted_at: new Date().toISOString(),
      data_status: 'deleted'
    })
    .eq('id', userId);

  console.log(`[Retention] Hard deleted all data for user ${userId}`);
}

export async function generateRetentionReport() {
  const report = {
    generated_at: new Date().toISOString(),
    tables: {}
  };

  for (const [table, config] of Object.entries(RETENTION_RULES)) {
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - config.years);

    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .lt('created_at', cutoffDate.toISOString());

    const { count: total } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    report.tables[table] = {
      total_records: total || 0,
      eligible_for_deletion: count || 0,
      retention_years: config.years
    };
  }

  return report;
}

export function startDataRetentionJob(intervalHours = 24) {
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`[Retention] Starting data retention job (every ${intervalHours} hours)`);

  setInterval(async () => {
    try {
      console.log('[Retention] Running scheduled archival...');
      await archiveOldRecords();
      await processScheduledDeletions();
    } catch (err) {
      console.error('[Retention] Job failed:', err);
    }
  }, intervalMs);
}
import supabase from '../config/supabase.js';

const RETENTION_RULES = {
  inquiries: { years: 7, status: ['archived', 'rejected'] },
  payments: { years: 10, status: ['completed', 'failed'] },
  audit_logs: { years: 2, status: null },
  chat_sessions: { years: 1, status: ['completed'] },
  application_drafts: { years: 0.5, status: null },
  visa_applications: { years: 10, status: ['completed', 'rejected', 'archived'] },
  bookings: { years: 7, status: ['completed', 'cancelled'] }
};

const ARCHIVE_STATUSES = ['archived', 'deleted'];

export async function archiveOldRecords() {
  const results = {};

  for (const [table, config] of Object.entries(RETENTION_RULES)) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - config.years);

      let query = supabase
        .from(table)
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (config.status && config.status.length > 0) {
        query = query.in('status', config.status);
      }

      const { data, error } = await query.select('id');

      if (error) {
        console.error(`[Retention] Error archiving ${table}:`, error.message);
        results[table] = { success: false, error: error.message };
      } else {
        const count = data?.length || 0;
        console.log(`[Retention] Archived ${count} records from ${table}`);
        results[table] = { success: true, archived: count };
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

export async function processScheduledDeletions() {
  const now = new Date().toISOString();

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
  const tables = ['inquiries', 'payments', 'chat_sessions', 'application_drafts', 'visa_applications'];

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
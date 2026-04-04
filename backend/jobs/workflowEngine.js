/**
 * backend/jobs/workflowEngine.js
 * Phase 6 — Automated Workflows
 * 
 * Runs as a periodic job (call startWorkflowEngine() from server.js).
 * Handles: assignment, escalation, SLA breach alerts, data retention.
 */

import supabase from '../config/supabase.js';
import { sendEmail } from '../services/emailService.js';

// ─── Config ───────────────────────────────────────────────────
const SLA_HOURS      = { visa: 72, flight: 24, hotel: 24, package: 48 };
const DEFAULT_SLA    = 72;
const CHECK_INTERVAL = 15 * 60 * 1000; // every 15 minutes

// ─── Helpers ──────────────────────────────────────────────────
const hoursElapsed = (date) => (Date.now() - new Date(date).getTime()) / 3_600_000;

async function logAudit(action, targetId, metadata = {}) {
  try {
    await supabase.from('audit_logs').insert([{
      actor_id:    null,
      actor_type:  'system',
      action,
      target_type: 'inquiry',
      target_id:   targetId,
      metadata,
    }]);
  } catch (e) {
    console.error('[Workflow] Audit log failed:', e.message);
  }
}

// ─── Workflow 1: Auto-assign unassigned inquiries ─────────────
async function autoAssignInquiries() {
  try {
    const { data: unassigned, error } = await supabase
      .from('inquiries')
      .select('id, inquiry_type, customer_name')
      .eq('status', 'pending')
      .is('assigned_admin', null)
      .lte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()); // older than 30 min

    if (error || !unassigned?.length) return;

    // Find admin with fewest active assignments
    const { data: admins } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('role', 'admin');

    if (!admins?.length) return;

    const { data: activeCounts } = await supabase
      .from('inquiries')
      .select('assigned_admin')
      .not('assigned_admin', 'is', null)
      .not('status', 'in', '("approved","rejected","cancelled","archived")');

    const countMap = {};
    (activeCounts || []).forEach(r => {
      countMap[r.assigned_admin] = (countMap[r.assigned_admin] || 0) + 1;
    });

    const sortedAdmins = admins.sort((a, b) => (countMap[a.id] || 0) - (countMap[b.id] || 0));

    for (let i = 0; i < unassigned.length; i++) {
      const admin = sortedAdmins[i % sortedAdmins.length];
      await supabase.from('inquiries').update({
        assigned_admin: admin.id,
        status:         'in_progress',
        updated_at:     new Date().toISOString(),
      }).eq('id', unassigned[i].id);

      await logAudit('auto_assigned', unassigned[i].id, { assigned_to: admin.id });
      console.log(`[Workflow] Assigned inquiry ${unassigned[i].id.slice(-8)} to ${admin.name}`);
    }
  } catch (e) {
    console.error('[Workflow] Auto-assign error:', e.message);
  }
}

// ─── Workflow 2: SLA breach notifications ─────────────────────
async function checkSLABreaches() {
  try {
    const { data: active, error } = await supabase
      .from('inquiries')
      .select('id, inquiry_type, status, customer_name, customer_email, created_at, assigned_admin, sla_breach_notified')
      .not('status', 'in', '("approved","rejected","cancelled","archived")');

    if (error || !active?.length) return;

    for (const inq of active) {
      const elapsed = hoursElapsed(inq.created_at);
      const sla     = SLA_HOURS[inq.inquiry_type] ?? DEFAULT_SLA;

      if (elapsed > sla && !inq.sla_breach_notified) {
        // Mark as notified
        await supabase.from('inquiries').update({
          sla_breach_notified: true,
          updated_at:          new Date().toISOString(),
        }).eq('id', inq.id);

        // Notify admin/supervisor
        const adminEmail = process.env.ADMIN_EMAIL || 'jetsetters721@gmail.com';
        await sendEmail({
          to:      adminEmail,
          subject: `🚨 SLA Breach — ${inq.customer_name} (${inq.inquiry_type})`,
          html: `
            <h2>SLA Breach Alert</h2>
            <p>Inquiry <strong>${inq.id.slice(0, 8)}</strong> for <strong>${inq.customer_name}</strong> has exceeded its SLA of ${sla} hours.</p>
            <p><strong>Time elapsed:</strong> ${elapsed.toFixed(1)} hours</p>
            <p><strong>Type:</strong> ${inq.inquiry_type}</p>
            <p><strong>Status:</strong> ${inq.status}</p>
            <p>Please review and action this inquiry immediately.</p>
          `,
        });

        await logAudit('sla_breach_detected', inq.id, { elapsed_hours: elapsed.toFixed(1), sla_hours: sla });
        console.log(`[Workflow] SLA breach notification sent for inquiry ${inq.id.slice(-8)}`);
      }
    }
  } catch (e) {
    console.error('[Workflow] SLA check error:', e.message);
  }
}

// ─── Workflow 3: 48h no-response escalation ───────────────────
async function checkEscalations() {
  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3_600_000).toISOString();

    const { data: stale, error } = await supabase
      .from('inquiries')
      .select('id, customer_name, inquiry_type, assigned_admin')
      .eq('status', 'in_progress')
      .lt('updated_at', fortyEightHoursAgo)
      .is('escalated', null);

    if (error || !stale?.length) return;

    for (const inq of stale) {
      await supabase.from('inquiries').update({
        escalated:  true,
        priority:   'urgent',
        updated_at: new Date().toISOString(),
      }).eq('id', inq.id);

      const adminEmail = process.env.ADMIN_EMAIL || 'jetsetters721@gmail.com';
      await sendEmail({
        to:      adminEmail,
        subject: `⚠️ Escalation — ${inq.customer_name} (48h no action)`,
        html: `
          <h2>Inquiry Escalation</h2>
          <p>Inquiry <strong>${inq.id.slice(0, 8)}</strong> for <strong>${inq.customer_name}</strong> has been in-progress for over 48 hours without update.</p>
          <p><strong>Type:</strong> ${inq.inquiry_type}</p>
          <p>This inquiry has been automatically escalated to urgent priority.</p>
        `,
      });

      await logAudit('escalated', inq.id, { reason: '48h_no_action' });
      console.log(`[Workflow] Escalated inquiry ${inq.id.slice(-8)}`);
    }
  } catch (e) {
    console.error('[Workflow] Escalation error:', e.message);
  }
}

// ─── Workflow 4: Data retention cleanup ───────────────────────
async function runDataRetention() {
  try {
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 3_600_000).toISOString();

    const { data: deleted, error } = await supabase
      .from('inquiries')
      .delete()
      .eq('status', 'anonymized')
      .lt('updated_at', threeYearsAgo)
      .select('id');

    if (!error && deleted?.length) {
      console.log(`[Workflow] Data retention: deleted ${deleted.length} anonymised record(s)`);
    }

    // Clean expired password reset tokens
    await supabase
      .from('password_resets')
      .delete()
      .lt('expires_at', new Date().toISOString());

  } catch (e) {
    console.error('[Workflow] Data retention error:', e.message);
  }
}

// ─── Engine Start ─────────────────────────────────────────────
let _timer = null;

export async function startWorkflowEngine() {
  console.log('[Workflow] Engine started — interval:', CHECK_INTERVAL / 60_000, 'min');

  const runAll = async () => {
    console.log(`[Workflow] Running checks at ${new Date().toISOString()}`);
    await Promise.allSettled([
      autoAssignInquiries(),
      checkSLABreaches(),
      checkEscalations(),
    ]);
  };

  // Also run data retention once daily at startup (nightly effectively)
  const now = new Date();
  if (now.getHours() === 2) await runDataRetention();

  await runAll();
  _timer = setInterval(runAll, CHECK_INTERVAL);
}

export function stopWorkflowEngine() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log('[Workflow] Engine stopped');
  }
}

export {
  autoAssignInquiries,
  checkSLABreaches,
  checkEscalations,
  runDataRetention,
};

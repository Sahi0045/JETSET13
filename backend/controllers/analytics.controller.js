/**
 * backend/controllers/analytics.controller.js
 * Analytics & Reporting — Phase 3
 * Routes: GET /api/analytics/*  (admin only)
 */

import supabase from '../config/supabase.js';
import { withCache, TTL, CacheKeys } from '../services/cache.service.js';

// ─── Helpers ──────────────────────────────────────────────────
const getPeriod = (query) => query.period || 'month'; // 'day'|'week'|'month'|'year'

const periodTrunc = (period) => {
  const map = { day: 'day', week: 'week', month: 'month', year: 'year' };
  return map[period] || 'month';
};

// ─── Conversion Funnel ────────────────────────────────────────
// GET /api/analytics/conversion
export const getConversionRates = async (req, res) => {
  try {
    const period = getPeriod(req.query);
    const cacheKey = `analytics:conversion:${period}`;

    const data = await withCache(cacheKey, TTL.ANALYTICS_DASH, async () => {
      // Count inquiries created (top of funnel)
      const { data: inquiries, error: iErr } = await supabase
        .from('inquiries')
        .select('id, status, created_at', { count: 'exact' });

      if (iErr) throw new Error(iErr.message);

      // Count paid bookings (bottom of funnel). Real paid transactions live in
      // the `bookings` table (payment_status = 'paid'); the legacy `payments`
      // table is unused for direct hosted-checkout bookings.
      const { data: payments, error: pErr } = await supabase
        .from('bookings')
        .select('id, payment_status, total_amount, created_at');

      if (pErr) throw new Error(pErr.message);

      const total         = inquiries?.length || 0;
      const approved      = inquiries?.filter(i => i.status === 'approved').length || 0;
      const rejected      = inquiries?.filter(i => i.status === 'rejected').length || 0;
      const pending       = inquiries?.filter(i => ['pending', 'in_progress'].includes(i.status)).length || 0;
      const isPaid        = (p) => p.payment_status === 'paid';
      const paid          = payments?.filter(isPaid).length || 0;
      const totalRevenue  = payments?.filter(isPaid).reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0) || 0;

      return {
        funnel: {
          applications_submitted: total,
          applications_approved:  approved,
          applications_rejected:  rejected,
          applications_pending:   pending,
          payments_completed:     paid,
        },
        rates: {
          approval_rate:    total > 0 ? ((approved / total) * 100).toFixed(1) : 0,
          rejection_rate:   total > 0 ? ((rejected / total) * 100).toFixed(1) : 0,
          payment_rate:     approved > 0 ? ((paid / approved) * 100).toFixed(1) : 0,
          overall_conversion: total > 0 ? ((paid / total) * 100).toFixed(1) : 0,
        },
        revenue: {
          total: totalRevenue.toFixed(2),
          avg_per_application: total > 0 ? (totalRevenue / total).toFixed(2) : 0,
        },
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics conversion error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Processing Times ─────────────────────────────────────────
// GET /api/analytics/processing-times
export const getProcessingTimes = async (req, res) => {
  try {
    const data = await withCache('analytics:processing_times', TTL.ANALYTICS_DASH, async () => {
      const { data: rows, error } = await supabase
        .from('inquiries')
        .select('inquiry_type, status, created_at, updated_at')
        .in('status', ['approved', 'rejected']);

      if (error) throw new Error(error.message);

      // Group by type and compute averages
      const grouped = {};
      (rows || []).forEach(r => {
        const type = r.inquiry_type || 'general';
        const hours = (new Date(r.updated_at) - new Date(r.created_at)) / 3_600_000;
        if (!grouped[type]) grouped[type] = [];
        grouped[type].push(hours);
      });

      const result = Object.entries(grouped).map(([type, times]) => {
        times.sort((a, b) => a - b);
        const avg = times.reduce((s, t) => s + t, 0) / times.length;
        const p95 = times[Math.floor(times.length * 0.95)] ?? times[times.length - 1];
        return {
          inquiry_type: type,
          count: times.length,
          avg_hours: avg.toFixed(1),
          p95_hours: p95?.toFixed(1) ?? 'N/A',
          min_hours: times[0]?.toFixed(1) ?? 'N/A',
          max_hours: times[times.length - 1]?.toFixed(1) ?? 'N/A',
        };
      });

      return result;
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics processing times error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Revenue Tracking ─────────────────────────────────────────
// GET /api/analytics/revenue?period=month
export const getRevenue = async (req, res) => {
  try {
    const period = getPeriod(req.query);
    const cacheKey = `analytics:revenue:${period}`;

    const data = await withCache(cacheKey, TTL.ANALYTICS_DASH, async () => {
      const { data: payments, error } = await supabase
        .from('bookings')
        .select('total_amount, payment_status, created_at')
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      // Group by period
      const periodMap = {};
      (payments || []).forEach(p => {
        const date   = new Date(p.created_at);
        let key;
        if (period === 'day')   key = date.toISOString().split('T')[0];
        else if (period === 'week') {
          const week = Math.ceil(date.getDate() / 7);
          key = `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
        } else if (period === 'year') key = `${date.getFullYear()}`;
        else key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!periodMap[key]) periodMap[key] = { period: key, total: 0, count: 0 };
        periodMap[key].total += parseFloat(p.total_amount) || 0;
        periodMap[key].count += 1;
      });

      const series = Object.values(periodMap)
        .sort((a, b) => a.period.localeCompare(b.period))
        .map(r => ({
          ...r,
          total: r.total.toFixed(2),
          avg:   r.count > 0 ? (r.total / r.count).toFixed(2) : '0.00',
        }));

      const grandTotal = (payments || []).reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);

      return {
        series,
        summary: {
          grand_total:       grandTotal.toFixed(2),
          transaction_count: (payments || []).length,
          avg_transaction:   payments?.length > 0 ? (grandTotal / payments.length).toFixed(2) : '0.00',
        },
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics revenue error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Agent Performance ────────────────────────────────────────
// GET /api/analytics/agent-performance
export const getAgentPerformance = async (req, res) => {
  try {
    const data = await withCache('analytics:agent_performance', TTL.ANALYTICS_DASH, async () => {
      const { data: inquiries, error } = await supabase
        .from('inquiries')
        .select('assigned_admin, status, created_at, updated_at')
        .not('assigned_admin', 'is', null);

      if (error) throw new Error(error.message);

      const grouped = {};
      (inquiries || []).forEach(inq => {
        const agentId = inq.assigned_admin;
        if (!grouped[agentId]) grouped[agentId] = { agent_id: agentId, processed: 0, approved: 0, rejected: 0, total_hours: 0 };
        grouped[agentId].processed += 1;
        if (inq.status === 'approved') grouped[agentId].approved += 1;
        if (inq.status === 'rejected') grouped[agentId].rejected += 1;
        if (inq.updated_at && inq.created_at) {
          grouped[agentId].total_hours += (new Date(inq.updated_at) - new Date(inq.created_at)) / 3_600_000;
        }
      });

      return Object.values(grouped).map(a => ({
        ...a,
        avg_processing_hours: a.processed > 0 ? (a.total_hours / a.processed).toFixed(1) : '0',
        approval_rate: a.processed > 0 ? ((a.approved / a.processed) * 100).toFixed(1) : '0',
      }));
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Analytics agent performance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── SLA Tracking ─────────────────────────────────────────────
// GET /api/analytics/sla
export const getSLAStatus = async (req, res) => {
  try {
    const { data: inquiries, error } = await supabase
      .from('inquiries')
      .select('id, inquiry_type, status, customer_name, created_at')
      .not('status', 'in', '("approved","rejected","cancelled","archived")');

    if (error) throw new Error(error.message);

    // SLA targets in hours per type
    const SLA_HOURS = { visa: 72, flight: 24, hotel: 24, package: 48 };
    const DEFAULT_SLA = 72;

    const now = Date.now();
    const rows = (inquiries || []).map(inq => {
      const elapsed    = (now - new Date(inq.created_at).getTime()) / 3_600_000;
      const sla        = SLA_HOURS[inq.inquiry_type] ?? DEFAULT_SLA;
      const pct        = ((elapsed / sla) * 100).toFixed(0);
      const is_breached = elapsed > sla;
      const is_warning  = !is_breached && elapsed > sla * 0.8;

      return {
        id:              inq.id,
        customer_name:   inq.customer_name,
        inquiry_type:    inq.inquiry_type,
        status:          inq.status,
        hours_elapsed:   elapsed.toFixed(1),
        sla_hours:       sla,
        sla_pct:         Math.min(parseInt(pct), 100),
        is_breached,
        is_warning,
        created_at:      inq.created_at,
      };
    });

    const summary = {
      total_active:  rows.length,
      breached:      rows.filter(r => r.is_breached).length,
      at_risk:       rows.filter(r => r.is_warning).length,
      on_track:      rows.filter(r => !r.is_breached && !r.is_warning).length,
    };

    res.json({ success: true, data: { inquiries: rows, summary } });
  } catch (error) {
    console.error('SLA status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Dashboard Overview (all metrics in one call) ─────────────
// GET /api/analytics/dashboard
export const getDashboardOverview = async (req, res) => {
  try {
    const [inquiryRes, paymentRes] = await Promise.all([
      supabase.from('inquiries').select('status, created_at', { count: 'exact' }),
      supabase.from('bookings').select('total_amount, payment_status', { count: 'exact' }).eq('payment_status', 'paid'),
    ]);

    if (inquiryRes.error) throw new Error(inquiryRes.error.message);
    if (paymentRes.error) throw new Error(paymentRes.error.message);

    const inquiries = inquiryRes.data || [];
    const payments  = paymentRes.data || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayInquiries = inquiries.filter(i => new Date(i.created_at) >= today);

    const data = {
      totals: {
        inquiries:        inquiries.length,
        inquiries_today:  todayInquiries.length,
        pending:          inquiries.filter(i => i.status === 'pending').length,
        in_progress:      inquiries.filter(i => i.status === 'in_progress').length,
        approved:         inquiries.filter(i => i.status === 'approved').length,
        rejected:         inquiries.filter(i => i.status === 'rejected').length,
        revenue:          payments.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0).toFixed(2),
        transactions:     payments.length,
      },
    };

    res.json({ success: true, data });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

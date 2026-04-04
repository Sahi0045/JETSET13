/**
 * backend/middleware/auditLog.middleware.js
 * Phase 7 — Audit Logging
 * 
 * Wraps any route to record who did what to which entity.
 * Usage in a route file:
 *   router.put('/:id/status', protect, auditLog('inquiry_status_update', 'inquiry'), updateInquiry);
 */

import supabase from '../config/supabase.js';

/**
 * Creates an Express middleware that logs an audit event after the route handler responds.
 * 
 * @param {string} action      - Human-readable action name e.g. 'application_approved'
 * @param {string} targetType  - Entity type e.g. 'inquiry' | 'user' | 'payment'
 * @param {Function} [getTargetId] - Optional fn(req) => string to extract target ID
 */
export function auditLog(action, targetType, getTargetId = null) {
  return async (req, res, next) => {
    // Wrap res.json to intercept response and capture data
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Fire audit log asynchronously — don't block or fail the response
      setImmediate(async () => {
        try {
          const targetId = getTargetId
            ? getTargetId(req)
            : (req.params?.id ?? body?.data?.id ?? null);

          const actorId   = req.user?.id ?? null;
          const actorType = req.user?.role === 'admin' ? 'admin'
            : req.user ? 'user' : 'system';

          // Only log successful responses (2xx)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            await supabase.from('audit_logs').insert([{
              actor_id:    actorId,
              actor_type:  actorType,
              action,
              target_type: targetType,
              target_id:   targetId,
              metadata: {
                method:     req.method,
                path:       req.originalUrl,
                body_keys:  req.body ? Object.keys(req.body) : [],
                user_agent: req.headers?.['user-agent']?.substring(0, 120),
                status:     res.statusCode,
              },
              ip_address:  req.ip ?? req.headers?.['x-forwarded-for'] ?? null,
            }]);
          }
        } catch (err) {
          // Silent fail — never disrupt a response due to audit logging
          console.error('[AuditLog] Failed to write audit entry:', err.message);
        }
      });

      return originalJson(body);
    };

    next();
  };
}

/**
 * Convenience: log bulk operations with an array of target IDs.
 */
export function bulkAuditLog(action, targetType) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      setImmediate(async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const ids       = req.body?.ids ?? [];
            const actorId   = req.user?.id ?? null;
            const actorType = req.user?.role === 'admin' ? 'admin' : 'user';

            const entries = ids.map(id => ({
              actor_id:    actorId,
              actor_type:  actorType,
              action,
              target_type: targetType,
              target_id:   id,
              metadata: {
                bulk: true,
                total_affected: ids.length,
                new_value: req.body?.status ?? req.body?.update ?? null,
              },
              ip_address: req.ip ?? null,
            }));

            if (entries.length > 0) {
              await supabase.from('audit_logs').insert(entries);
            }
          }
        } catch (err) {
          console.error('[AuditLog] Bulk audit failed:', err.message);
        }
      });

      return originalJson(body);
    };

    next();
  };
}

/**
 * Query audit logs (admin panel).
 * GET /api/audit-logs?target_type=inquiry&target_id=xxx&limit=50
 */
export const getAuditLogs = async (req, res) => {
  try {
    const { target_type, target_id, actor_id, action, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (target_type) query = query.eq('target_type', target_type);
    if (target_id)   query = query.eq('target_id',   target_id);
    if (actor_id)    query = query.eq('actor_id',    actor_id);
    if (action)      query = query.ilike('action',   `%${action}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    res.json({ success: true, data });
  } catch (error) {
    console.error('Audit log query error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

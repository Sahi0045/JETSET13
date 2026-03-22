import supabase from "../config/supabase.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Validate if a string is a valid UUID.
 */
function isValidUUID(uuid) {
  if (!uuid || typeof uuid !== "string") return false;
  const regex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

/**
 * Generate a unique application reference in the format VISA-YYYY-NNNNN.
 * Uses the highest existing serial for the year and increments it, so it is
 * safe even when records have been deleted or multiple submissions race.
 */
async function generateApplicationRef() {
  const year = new Date().getFullYear();
  const prefix = `VISA-${year}-`;

  try {
    // Find the highest existing ref for this year
    const { data, error } = await supabase
      .from("visa_applications")
      .select("application_ref")
      .ilike("application_ref", `${prefix}%`)
      .order("application_ref", { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextSerial = 1;
    if (data && data.length > 0) {
      const lastRef = data[0].application_ref; // e.g. "VISA-2026-00004"
      const lastSerial = parseInt(lastRef.replace(prefix, ""), 10);
      if (!isNaN(lastSerial)) {
        nextSerial = lastSerial + 1;
      }
    }

    return `${prefix}${String(nextSerial).padStart(5, "0")}`;
  } catch {
    // Fallback: timestamp + random to avoid collisions
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `${prefix}${Date.now().toString().slice(-4)}${rand.toString().slice(-1)}`;
  }
}

// ─── VisaApplication Model ───────────────────────────────────────────────────

class VisaApplication {
  /**
   * Create a new visa application.
   * @param {Object} data - Application fields.
   * @returns {Object} Created record.
   */
  static async create(data) {
    try {
      const application_ref = await generateApplicationRef();

      // Determine price based on tier
      const tierPrices = { standard: 49, express: 89, premium: 149 };
      const amount = tierPrices[data.serviceTier] || 49;

      // Build initial timeline event
      const timeline = [
        {
          status: "submitted",
          date: new Date().toISOString(),
          note: "Application received and submitted successfully.",
          by: "System",
        },
      ];

      // Build initial documents array from provided document names
      const documents = Array.isArray(data.documents)
        ? data.documents
        : [
            { name: "Passport Bio Page", status: "pending", file_url: null },
            { name: "Passport Photos", status: "pending", file_url: null },
            { name: "Bank Statements", status: "pending", file_url: null },
          ];

      const record = {
        application_ref,
        user_id: isValidUUID(data.userId) ? data.userId : null,
        status: "submitted",
        priority: data.priority || "normal",
        service_tier: data.serviceTier || "standard",
        personal_info: data.personalInfo || {},
        travel_details: data.travelDetails || {},
        documents,
        timeline,
        payment_status: data.paymentStatus || "pending",
        amount,
        assigned_agent: data.assignedAgent || null,
        notes: data.notes || null,
      };

      const { data: created, error } = await supabase
        .from("visa_applications")
        .insert([record])
        .select()
        .single();

      if (error) {
        console.error("Supabase error creating visa application (FULL):", JSON.stringify(error, null, 2));
        throw new Error(error.message);
      }

      return created;
    } catch (err) {
      console.error("VisaApplication.create error:", err);
      throw err;
    }
  }

  /**
   * Get all visa applications with optional filters and pagination.
   * @param {Object} filters - { status, serviceTier, priority, destination, assignedAgent }
   * @param {Object} options - { limit, offset, orderBy }
   * @returns {{ applications: Array, total: number }}
   */
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase
        .from("visa_applications")
        .select("*", { count: "exact" });

      if (filters.status) query = query.eq("status", filters.status);
      if (filters.serviceTier)
        query = query.eq("service_tier", filters.serviceTier);
      if (filters.priority) query = query.eq("priority", filters.priority);
      if (filters.paymentStatus)
        query = query.eq("payment_status", filters.paymentStatus);
      if (filters.destination) {
        query = query.ilike(
          "travel_details->>destination",
          `%${filters.destination}%`,
        );
      }
      if (filters.assignedAgent) {
        query = query.eq("assigned_agent", filters.assignedAgent);
      }

      // Sorting
      const [col, dir] = (options.orderBy || "created_at:desc").split(":");
      query = query.order(col, { ascending: dir === "asc" });

      // Pagination
      if (options.limit) query = query.limit(Number(options.limit));
      if (options.offset && options.limit) {
        query = query.range(
          Number(options.offset),
          Number(options.offset) + Number(options.limit) - 1,
        );
      }

      const { data, error, count } = await query;

      if (error) {
        console.error("Supabase error fetching visa applications:", error);
        throw new Error(error.message);
      }

      return { applications: data || [], total: count || 0 };
    } catch (err) {
      console.error("VisaApplication.findAll error:", err);
      throw err;
    }
  }

  /**
   * Get a single application by primary key id.
   */
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from("visa_applications")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(error.message);
      }
      return data;
    } catch (err) {
      console.error("VisaApplication.findById error:", err);
      throw err;
    }
  }

  /**
   * Get an application by its reference string (e.g. VISA-2026-00001).
   */
  static async findByRef(ref) {
    try {
      const { data, error } = await supabase
        .from("visa_applications")
        .select("*")
        .ilike("application_ref", ref.trim())
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      console.error("VisaApplication.findByRef error:", err);
      throw err;
    }
  }

  /**
   * Get all applications belonging to a specific user.
   */
  static async findByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from("visa_applications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    } catch (err) {
      console.error("VisaApplication.findByUserId error:", err);
      throw err;
    }
  }

  /**
   * Search applications by email stored inside personal_info JSONB.
   */
  static async findByEmail(email) {
    try {
      const { data, error } = await supabase
        .from("visa_applications")
        .select("*")
        .ilike("personal_info->>email", email.trim())
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    } catch (err) {
      console.error("VisaApplication.findByEmail error:", err);
      throw err;
    }
  }

  /**
   * Update an application record.
   * @param {string} id - Application UUID.
   * @param {Object} updateData - Fields to update.
   */
  static async update(id, updateData) {
    try {
      // Only allow known columns to be updated
      const allowed = [
        "status",
        "priority",
        "service_tier",
        "personal_info",
        "travel_details",
        "documents",
        "timeline",
        "payment_status",
        "amount",
        "assigned_agent",
        "notes",
      ];
      const clean = {};
      allowed.forEach((key) => {
        if (updateData[key] !== undefined) clean[key] = updateData[key];
      });

      if (Object.keys(clean).length === 0) {
        throw new Error("No valid fields to update");
      }

      const { data, error } = await supabase
        .from("visa_applications")
        .update(clean)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") throw new Error("Application not found");
        throw new Error(error.message);
      }
      return data;
    } catch (err) {
      console.error("VisaApplication.update error:", err);
      throw err;
    }
  }

  /**
   * Append a new event to the application's timeline JSONB array.
   * @param {string} id - Application UUID.
   * @param {{ status: string, note: string, by: string }} event
   */
  static async addTimelineEvent(id, event) {
    try {
      // Fetch current timeline
      const app = await VisaApplication.findById(id);
      if (!app) throw new Error("Application not found");

      const currentTimeline = Array.isArray(app.timeline) ? app.timeline : [];
      const newEvent = {
        status: event.status,
        date: new Date().toISOString(),
        note: event.note || "",
        by: event.by || "System",
      };
      const updatedTimeline = [...currentTimeline, newEvent];

      return await VisaApplication.update(id, {
        timeline: updatedTimeline,
        status: event.status || app.status,
      });
    } catch (err) {
      console.error("VisaApplication.addTimelineEvent error:", err);
      throw err;
    }
  }

  /**
   * Update a specific document's status or file_url.
   * @param {string} id - Application UUID.
   * @param {string} docName - Document name to match.
   * @param {{ status: string, file_url: string }} docUpdate
   */
  static async updateDocument(id, docName, docUpdate) {
    try {
      const app = await VisaApplication.findById(id);
      if (!app) throw new Error("Application not found");

      const docs = Array.isArray(app.documents) ? [...app.documents] : [];
      const idx = docs.findIndex((d) => d.name === docName);

      if (idx === -1) {
        // Append new document entry
        docs.push({ name: docName, ...docUpdate });
      } else {
        docs[idx] = { ...docs[idx], ...docUpdate };
      }

      return await VisaApplication.update(id, { documents: docs });
    } catch (err) {
      console.error("VisaApplication.updateDocument error:", err);
      throw err;
    }
  }

  /**
   * Cancel an application (sets status to 'cancelled').
   */
  static async cancel(id) {
    try {
      return await VisaApplication.addTimelineEvent(id, {
        status: "cancelled",
        note: "Application cancelled by applicant.",
        by: "Applicant",
      });
    } catch (err) {
      console.error("VisaApplication.cancel error:", err);
      throw err;
    }
  }

  /**
   * Delete an application entirely.
   */
  static async delete(id) {
    try {
      const { error } = await supabase
        .from("visa_applications")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
      return true;
    } catch (err) {
      console.error("VisaApplication.delete error:", err);
      throw err;
    }
  }

  /**
   * Get aggregate statistics: total, by status, by service tier, by month.
   */
  static async getStats() {
    try {
      const { data, error } = await supabase
        .from("visa_applications")
        .select("status, service_tier, payment_status, created_at, amount");

      if (error) throw new Error(error.message);

      const rows = data || [];
      const stats = {
        total: rows.length,
        byStatus: {},
        byTier: {},
        totalRevenue: 0,
        pendingRevenue: 0,
        recent30Days: 0,
      };

      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      rows.forEach((r) => {
        stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
        stats.byTier[r.service_tier] = (stats.byTier[r.service_tier] || 0) + 1;
        if (r.payment_status === "paid")
          stats.totalRevenue += Number(r.amount) || 0;
        if (r.payment_status === "pending")
          stats.pendingRevenue += Number(r.amount) || 0;
        if (new Date(r.created_at) > cutoff) stats.recent30Days += 1;
      });

      stats.totalRevenue = parseFloat(stats.totalRevenue.toFixed(2));
      stats.pendingRevenue = parseFloat(stats.pendingRevenue.toFixed(2));

      return stats;
    } catch (err) {
      console.error("VisaApplication.getStats error:", err);
      throw err;
    }
  }
}

// ─── VisaConsultation Model ──────────────────────────────────────────────────

class VisaConsultation {
  /**
   * Book a new consultation slot.
   */
  static async create(data) {
    try {
      const record = {
        user_id: isValidUUID(data.userId) ? data.userId : null,
        consultant_name: data.consultantName,
        consultant_role: data.consultantRole,
        booking_date: data.bookingDate,
        booking_time: data.bookingTime,
        status: "confirmed",
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        amount: data.amount || 49.0,
        meeting_link: data.meetingLink || null,
        notes: data.notes || null,
      };

      const { data: created, error } = await supabase
        .from("visa_consultations")
        .insert([record])
        .select()
        .single();

      if (error) {
        console.error("Supabase error creating consultation:", error);
        throw new Error(error.message);
      }
      return created;
    } catch (err) {
      console.error("VisaConsultation.create error:", err);
      throw err;
    }
  }

  /**
   * List all consultations with optional filters.
   * @param {Object} filters - { status, date, consultantName }
   * @param {Object} options - { limit, offset, orderBy }
   */
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase
        .from("visa_consultations")
        .select("*", { count: "exact" });

      if (filters.status) query = query.eq("status", filters.status);
      if (filters.date) query = query.eq("booking_date", filters.date);
      if (filters.consultantName) {
        query = query.ilike("consultant_name", `%${filters.consultantName}%`);
      }

      const [col, dir] = (options.orderBy || "created_at:desc").split(":");
      query = query.order(col, { ascending: dir === "asc" });

      if (options.limit) query = query.limit(Number(options.limit));
      if (options.offset && options.limit) {
        query = query.range(
          Number(options.offset),
          Number(options.offset) + Number(options.limit) - 1,
        );
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { consultations: data || [], total: count || 0 };
    } catch (err) {
      console.error("VisaConsultation.findAll error:", err);
      throw err;
    }
  }

  /**
   * Get a consultation by UUID.
   */
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from("visa_consultations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(error.message);
      }
      return data;
    } catch (err) {
      console.error("VisaConsultation.findById error:", err);
      throw err;
    }
  }

  /**
   * Get all consultations for a user.
   */
  static async findByUserId(userId) {
    try {
      const { data, error } = await supabase
        .from("visa_consultations")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    } catch (err) {
      console.error("VisaConsultation.findByUserId error:", err);
      throw err;
    }
  }

  /**
   * Get all consultations by customer email (for non-authenticated tracking).
   */
  static async findByEmail(email) {
    try {
      const { data, error } = await supabase
        .from("visa_consultations")
        .select("*")
        .ilike("customer_email", email.trim())
        .order("created_at", { ascending: false });

      if (error) throw new Error(error.message);
      return data || [];
    } catch (err) {
      console.error("VisaConsultation.findByEmail error:", err);
      throw err;
    }
  }

  /**
   * Update a consultation (status, meeting_link, notes, etc.)
   */
  static async update(id, updateData) {
    try {
      const allowed = [
        "status",
        "consultant_name",
        "consultant_role",
        "booking_date",
        "booking_time",
        "amount",
        "meeting_link",
        "notes",
      ];
      const clean = {};
      allowed.forEach((key) => {
        if (updateData[key] !== undefined) clean[key] = updateData[key];
      });

      if (Object.keys(clean).length === 0)
        throw new Error("No valid fields to update");

      const { data, error } = await supabase
        .from("visa_consultations")
        .update(clean)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116")
          throw new Error("Consultation not found");
        throw new Error(error.message);
      }
      return data;
    } catch (err) {
      console.error("VisaConsultation.update error:", err);
      throw err;
    }
  }

  /**
   * Cancel a consultation.
   */
  static async cancel(id) {
    try {
      return await VisaConsultation.update(id, { status: "cancelled" });
    } catch (err) {
      console.error("VisaConsultation.cancel error:", err);
      throw err;
    }
  }

  /**
   * Get consultation statistics.
   */
  static async getStats() {
    try {
      const { data, error } = await supabase
        .from("visa_consultations")
        .select("status, amount, created_at");

      if (error) throw new Error(error.message);

      const rows = data || [];
      const stats = {
        total: rows.length,
        byStatus: {},
        totalRevenue: 0,
        recent30Days: 0,
      };
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      rows.forEach((r) => {
        stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
        if (r.status === "confirmed" || r.status === "completed") {
          stats.totalRevenue += Number(r.amount) || 0;
        }
        if (new Date(r.created_at) > cutoff) stats.recent30Days += 1;
      });

      stats.totalRevenue = parseFloat(stats.totalRevenue.toFixed(2));
      return stats;
    } catch (err) {
      console.error("VisaConsultation.getStats error:", err);
      throw err;
    }
  }
}

// ─── VisaRequirements Model ──────────────────────────────────────────────────

class VisaRequirements {
  /**
   * List all requirements with optional filters and search.
   */
  static async findAll(filters = {}, options = {}) {
    try {
      let query = supabase
        .from("visa_requirements")
        .select("*", { count: "exact" });

      if (filters.nationality) {
        query = query.ilike("nationality", `%${filters.nationality}%`);
      }
      if (filters.destination) {
        query = query.ilike("destination", `%${filters.destination}%`);
      }
      if (typeof filters.active === "boolean") {
        query = query.eq("active", filters.active);
      }
      if (filters.search) {
        query = query.or(
          `nationality.ilike.%${filters.search}%,destination.ilike.%${filters.search}%,visa_type.ilike.%${filters.search}%`,
        );
      }

      const [col, dir] = (options.orderBy || "nationality:asc").split(":");
      query = query.order(col, { ascending: dir !== "desc" });

      if (options.limit) query = query.limit(Number(options.limit));

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { requirements: data || [], total: count || 0 };
    } catch (err) {
      console.error("VisaRequirements.findAll error:", err);
      throw err;
    }
  }

  /**
   * Check eligibility for a specific nationality → destination pair.
   */
  static async check(nationality, destination) {
    try {
      const { data, error } = await supabase
        .from("visa_requirements")
        .select("*")
        .ilike("nationality", nationality.trim())
        .ilike("destination", destination.trim())
        .eq("active", true)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      console.error("VisaRequirements.check error:", err);
      throw err;
    }
  }

  /**
   * Get a single requirement by UUID.
   */
  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from("visa_requirements")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null;
        throw new Error(error.message);
      }
      return data;
    } catch (err) {
      console.error("VisaRequirements.findById error:", err);
      throw err;
    }
  }

  /**
   * Create a new requirement.
   */
  static async create(data) {
    try {
      const record = {
        nationality: data.nationality,
        destination: data.destination,
        visa_required:
          data.visaRequired !== undefined ? data.visaRequired : true,
        visa_type: data.visaType,
        processing_time: data.processingTime || data.processing || null,
        validity: data.validity || null,
        max_stay: data.maxStay || null,
        entry_type: data.entryType || "Single",
        fee: Number(data.fee) || 0,
        active: data.active !== undefined ? data.active : true,
        notes: data.notes || null,
        official_url: data.officialUrl || data.official_url || null,
      };

      const { data: created, error } = await supabase
        .from("visa_requirements")
        .insert([record])
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            `A requirement for ${data.nationality} → ${data.destination} already exists.`,
          );
        }
        throw new Error(error.message);
      }
      return created;
    } catch (err) {
      console.error("VisaRequirements.create error:", err);
      throw err;
    }
  }

  /**
   * Update a requirement by UUID.
   */
  static async update(id, data) {
    try {
      const allowed = [
        "nationality",
        "destination",
        "visa_required",
        "visa_type",
        "processing_time",
        "validity",
        "max_stay",
        "entry_type",
        "fee",
        "active",
        "notes",
        "official_url",
      ];
      const camelToSnake = {
        visaRequired: "visa_required",
        visaType: "visa_type",
        processingTime: "processing_time",
        processing: "processing_time",
        maxStay: "max_stay",
        entryType: "entry_type",
        officialUrl: "official_url",
      };

      const clean = {};
      Object.entries(data).forEach(([k, v]) => {
        const key = camelToSnake[k] || k;
        if (allowed.includes(key)) clean[key] = v;
      });

      if (Object.keys(clean).length === 0)
        throw new Error("No valid fields to update");

      const { data: updated, error } = await supabase
        .from("visa_requirements")
        .update(clean)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") throw new Error("Requirement not found");
        throw new Error(error.message);
      }
      return updated;
    } catch (err) {
      console.error("VisaRequirements.update error:", err);
      throw err;
    }
  }

  /**
   * Delete a requirement by UUID.
   */
  static async delete(id) {
    try {
      const { error } = await supabase
        .from("visa_requirements")
        .delete()
        .eq("id", id);

      if (error) throw new Error(error.message);
      return true;
    } catch (err) {
      console.error("VisaRequirements.delete error:", err);
      throw err;
    }
  }
}

// ─── VisaMessage Model ───────────────────────────────────────────────────────

class VisaMessage {
  /**
   * Get all messages for an application, ordered oldest-first.
   */
  static async findByApplication(applicationId) {
    try {
      const { data, error } = await supabase
        .from("visa_messages")
        .select("*")
        .eq("application_id", applicationId)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      return data || [];
    } catch (err) {
      console.error("VisaMessage.findByApplication error:", err);
      throw err;
    }
  }

  /**
   * Send a new message.
   */
  static async create(data) {
    try {
      const record = {
        application_id: data.applicationId,
        sender_type: data.senderType || "customer",
        sender_name: data.senderName || null,
        sender_email: data.senderEmail || null,
        content: data.content,
        attachment_url: data.attachmentUrl || null,
        attachment_name: data.attachmentName || null,
        is_read: false,
      };

      const { data: created, error } = await supabase
        .from("visa_messages")
        .insert([record])
        .select()
        .single();

      if (error) throw new Error(error.message);
      return created;
    } catch (err) {
      console.error("VisaMessage.create error:", err);
      throw err;
    }
  }

  /**
   * Mark all messages in an application as read for a given sender_type.
   * (e.g. mark all customer messages as read when admin opens the thread)
   */
  static async markRead(applicationId, senderType) {
    try {
      const query = supabase
        .from("visa_messages")
        .update({ is_read: true })
        .eq("application_id", applicationId)
        .eq("is_read", false);

      if (senderType) {
        query.neq("sender_type", senderType); // mark the *other* side as read
      }

      const { error } = await query;
      if (error) throw new Error(error.message);
      return true;
    } catch (err) {
      console.error("VisaMessage.markRead error:", err);
      throw err;
    }
  }

  /**
   * Count unread messages per application for admin.
   */
  static async getUnreadCounts() {
    try {
      const { data, error } = await supabase
        .from("visa_messages")
        .select("application_id")
        .eq("is_read", false)
        .eq("sender_type", "customer");

      if (error) throw new Error(error.message);

      const counts = {};
      (data || []).forEach((row) => {
        counts[row.application_id] = (counts[row.application_id] || 0) + 1;
      });
      return counts;
    } catch (err) {
      console.error("VisaMessage.getUnreadCounts error:", err);
      throw err;
    }
  }

  /**
   * Get a list of applications that have messages (for the messaging hub).
   * Returns application stubs enriched with latest message and unread count.
   */
  static async getThreadSummaries(limit = 20) {
    try {
      // Get latest message per application
      const { data, error } = await supabase
        .from("visa_messages")
        .select(
          `
          application_id,
          content,
          sender_type,
          sender_name,
          is_read,
          created_at
        `,
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw new Error(error.message);

      // Deduplicate by application_id keeping the latest
      const seen = new Set();
      const threads = [];
      for (const row of data || []) {
        if (!seen.has(row.application_id)) {
          seen.add(row.application_id);
          threads.push(row);
        }
        if (threads.length >= limit) break;
      }

      // Enrich with application data
      if (threads.length === 0) return [];

      const appIds = threads.map((t) => t.application_id);
      const { data: apps, error: appErr } = await supabase
        .from("visa_applications")
        .select("id, application_ref, personal_info, status")
        .in("id", appIds);

      if (appErr) throw new Error(appErr.message);

      const appMap = {};
      (apps || []).forEach((a) => {
        appMap[a.id] = a;
      });

      return threads.map((t) => ({
        applicationId: t.application_id,
        applicationRef: appMap[t.application_id]?.application_ref || "—",
        applicantName: (() => {
          const pi = appMap[t.application_id]?.personal_info || {};
          return `${pi.firstName || ""} ${pi.lastName || ""}`.trim() || "—";
        })(),
        applicantEmail: appMap[t.application_id]?.personal_info?.email || "—",
        applicationStatus: appMap[t.application_id]?.status || "unknown",
        latestMessage: t.content,
        latestSenderType: t.sender_type,
        latestAt: t.created_at,
        hasUnread: !t.is_read && t.sender_type === "customer",
      }));
    } catch (err) {
      console.error("VisaMessage.getThreadSummaries error:", err);
      throw err;
    }
  }
}

export { VisaApplication, VisaConsultation, VisaRequirements, VisaMessage };

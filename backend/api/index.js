// Unified Vercel serverless function handler
// This consolidates all API routes into a single function to avoid the 12-function limit

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import route handlers
import authRoutes from "../routes/auth.routes.js";
import userRoutes from "../routes/user.routes.js";
import emailRoutes from "../routes/email.routes.js";
import flightRoutes from "../routes/flight.routes.js";
import hotelRoutes from "../routes/hotel.routes.js";
import paymentRoutes from "../routes/payment.routes.js";
import inquiryRoutes from "../routes/inquiry.routes.js";
import quoteRoutes from "../routes/quote.routes.js";
import cruiseRoutes from "../routes/cruise.routes.js";
import packageRoutes from "../routes/package.routes.js";
import supabaseAuthRoutes from "../routes/supabaseAuth.js";
import geoRoutes from "../routes/geo.routes.js";
import adminRoutes from "../routes/admin.routes.js";
import currencyRoutes from "../routes/currency.routes.js";
import couponRoutes from "../routes/coupon.routes.js";
import subscriptionRoutes from "../routes/subscription.routes.js";
import visaRoutes from "../routes/visa.routes.js";
import analyticsRoutes from "../routes/analytics.routes.js";
import templateRoutes from "../routes/template.routes.js";
import bulkUploadRoutes from "../routes/bulkUpload.routes.js";
import featureFlagRoutes from "../routes/featureFlag.routes.js";
import airportRoutes from "../routes/airport.routes.js";
import pushRoutes from "../routes/push.routes.js";
import gdprRoutes from "../routes/gdpr.routes.js";
import chatRoutes from "./chat/index.js";

// Shared stability modules (same behavior across all 3 entry points)
import "../bootstrap/httpDefaults.js"; // global axios timeout safety net
import { validateEnv } from "../config/validateEnv.js";
import { initMonitoring } from "../services/monitoring.js";
import {
  apiLimiter,
  authLimiter,
  securityHeaders,
  responseCompression,
  buildCorsOptions,
} from "../middleware/security.js";
import { notFoundHandler, errorHandler } from "../middleware/errorHandler.js";
import { readinessHandler } from "../middleware/health.js";
import { generateCallbackTemplate, generateAdminCallbackNotificationTemplate } from "../services/email/templates.js";

// Validate config (don't process.exit in serverless — just surface the gap) + init monitoring
validateEnv({ exitOnError: false });
initMonitoring();

const app = express();

// Behind Vercel's proxy — trust the first hop so client IPs / rate limiting are correct
app.set("trust proxy", 1);

// Security headers + response compression (before routes)
app.use(securityHeaders);
app.use(responseCompression);

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(cors(buildCorsOptions()));

// Global rate limiting (general API + stricter on auth)
app.use(apiLimiter);
app.use(["/api/auth", "/auth", "/api/supabase-auth", "/supabase-auth"], authLimiter);

// Mount API routes - use both /api/* and /* patterns for flexibility
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/flights", flightRoutes);
app.use("/api/hotels", hotelRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/cruises", cruiseRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/supabase-auth", supabaseAuthRoutes);
app.use("/api/geo", geoRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/currency", currencyRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/visa", visaRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/bulk", bulkUploadRoutes);
app.use("/api/feature-flags", featureFlagRoutes);
app.use("/api/airports", airportRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/gdpr", gdprRoutes);

// Also mount without /api prefix for rewrite compatibility
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/email", emailRoutes);
app.use("/flights", flightRoutes);
app.use("/hotels", hotelRoutes);
app.use("/payments", paymentRoutes);
app.use("/inquiries", inquiryRoutes);
app.use("/quotes", quoteRoutes);
app.use("/cruises", cruiseRoutes);
app.use("/packages", packageRoutes);
app.use("/supabase-auth", supabaseAuthRoutes);
app.use("/geo", geoRoutes);
app.use("/admin", adminRoutes);
app.use("/currency", currencyRoutes);
app.use("/coupons", couponRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/visa", visaRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/templates", templateRoutes);
app.use("/push", pushRoutes);
app.use("/bulk", bulkUploadRoutes);
app.use("/feature-flags", featureFlagRoutes);
app.use("/airports", airportRoutes);
app.use("/chat", chatRoutes);
app.use("/gdpr", gdprRoutes);

// Direct send-email endpoint (must match server.js implementation)
app.post("/api/send-email", async (req, res) => {
  try {
    console.log("📧 Direct email endpoint hit with data:", req.body);

    if (!process.env.RESEND_API_KEY) {
      console.error("📧 ERROR: Missing Resend API key");
      return res.status(500).json({ success: false, error: "Missing email API key" });
    }

    let resend;
    try {
      // Use dynamic import for Resend to handle potential ESM/CJS issues in serverless
      const { Resend: ResendClient } = await import("resend");
      resend = new ResendClient(process.env.RESEND_API_KEY);
    } catch (importError) {
      console.error("📧 ERROR: Failed to initialize Resend:", importError);
      return res.status(500).json({ success: false, error: "Failed to initialize email service" });
    }

    const { name, email, phone, type = "callback", details = {} } = req.body;
    const adminEmail = "jetsetters721@gmail.com";
    const preferredTime = details.preferredTime || "Not specified";
    const message = details.message || "";

    const callbackData = { name, email, phone, preferredTime, message };
    const customerHtml = generateCallbackTemplate(callbackData, type);
    const adminHtml = generateAdminCallbackNotificationTemplate(callbackData, type);

    const results = [];

    if (email) {
      try {
        const customerResult = await resend.emails.send({
          from: "Jetsetters <noreply@jetsetterss.com>",
          to: [email],
          subject: `✅ Your ${type.charAt(0).toUpperCase() + type.slice(1)} Callback Request - Confirmed!`,
          html: customerHtml,
        });
        console.log("📧 Customer email sent:", customerResult);
        results.push({ recipient: "customer", data: customerResult });
      } catch (err) {
        console.warn("⚠️ Customer email failed:", err.message);
      }
    }

    try {
      const adminResult = await resend.emails.send({
        from: "Jetsetters Notifications <noreply@jetsetterss.com>",
        to: [adminEmail],
        subject: `🆕 New ${type.toUpperCase()} Callback Request from ${name}`,
        html: adminHtml,
      });
      console.log("📧 Admin email sent:", adminResult);
      results.push({ recipient: "admin", data: adminResult });
    } catch (err) {
      console.warn("⚠️ Admin email failed:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: results.length > 0
        ? `Emails sent to: ${results.map(r => r.recipient).join(", ")}`
        : "Callback saved but no emails could be sent",
      data: results,
    });
  } catch (error) {
    console.error("📧 Error in send-email endpoint:", error);
    return res.status(200).json({
      success: true,
      message: "Callback saved, but email service encountered an error",
      error: error.message,
    });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
// Deep readiness check (pings Supabase + Redis)
app.get("/api/health/ready", readinessHandler);
app.get("/health/ready", readinessHandler);

// 404 for unmatched routes (must come before the error handler)
app.use(notFoundHandler);

// Central error handler (must be last) — logs, reports 5xx to monitoring
app.use(errorHandler);

// Export for Vercel serverless
export default app;

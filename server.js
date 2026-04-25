import dotenv from "dotenv";
// Load environment variables as early as possible
dotenv.config();
// Also try to load from backend/.env if the main one doesn't exist
dotenv.config({ path: "./backend/.env" });

// After loading env vars, import the rest of dependencies
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import authRoutes from "./backend/routes/auth.routes.js";
import userRoutes from "./backend/routes/user.routes.js";
import emailRoutes from "./backend/routes/email.routes.js";
import flightRoutes from "./backend/routes/flight.routes.js";
import hotelRoutes from "./backend/routes/hotel.routes.js";
import paymentRoutes from "./backend/routes/payment.routes.js";
import inquiryRoutes from "./backend/routes/inquiry.routes.js";
import quoteRoutes from "./backend/routes/quote.routes.js";
import cruiseRoutes from "./backend/routes/cruise.routes.js";
import supabaseAuthRoutes from "./backend/routes/supabaseAuth.js";
import geoRoutes from "./backend/routes/geo.routes.js";
import adminRoutes from "./backend/routes/admin.routes.js";
import visaRoutes from "./backend/routes/visa.routes.js";
import chatRoutes from "./backend/api/chat/index.js";
import couponRoutes from "./backend/routes/coupon.routes.js";
import subscriptionRoutes from "./backend/routes/subscription.routes.js";
import supabase from "./backend/config/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Log key environment information for debugging
console.log("Environment:", {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  AMADEUS_KEYS_SET: !!(
    process.env.AMADEUS_API_KEY && process.env.AMADEUS_API_SECRET
  ),
  REACT_APP_KEYS_SET: !!(
    process.env.REACT_APP_AMADEUS_API_KEY &&
    process.env.REACT_APP_AMADEUS_API_SECRET
  ),
});

const PORT = process.env.PORT || 5004;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "x-csrf-token",
    ],
  }),
);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/hotels", hotelRoutes);
app.use("/api/flights", flightRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/inquiries", inquiryRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/cruises", cruiseRoutes);
app.use("/api/supabase", supabaseAuthRoutes);
app.use("/api/geo", geoRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/visa", visaRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/subscription", subscriptionRoutes);

// Test endpoint
app.get("/api/test", (req, res) => {
  res.json({ message: "API is working!" });
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date(),
    env: process.env.NODE_ENV,
    apiKeys: {
      amadeus:
        !!process.env.AMADEUS_API_KEY ||
        !!process.env.REACT_APP_AMADEUS_API_KEY,
    },
  });
});

// Direct send-email endpoint (must be before the /api/* 404 catch-all)
app.post("/api/send-email", async (req, res) => {
  try {
    console.log("📧 Direct email endpoint hit with data:", req.body);

    if (!process.env.RESEND_API_KEY) {
      console.error("📧 ERROR: Missing Resend API key");
      return res.status(500).json({ success: false, error: "Missing email API key" });
    }

    let resend;
    try {
      const { Resend } = await import("resend");
      resend = new Resend(process.env.RESEND_API_KEY);
    } catch (importError) {
      console.error("📧 ERROR: Failed to initialize Resend:", importError);
      return res.status(500).json({ success: false, error: "Failed to initialize email service" });
    }

    const { name, email, phone, type = "callback", details = {} } = req.body;
    const adminEmail = "jetsetters721@gmail.com";
    const preferredTime = details.preferredTime || "Not specified";
    const message = details.message || "";

    const customerHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0066b2, #1e88e5); padding: 28px 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 22px;">🛳️ Your Callback Request Is Confirmed!</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Jetsetters Travel Experts</p>
        </div>
        <div style="padding: 24px; background-color: #f9f9f9;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${name}</strong>,</p>
          <p style="font-size: 15px; color: #555; line-height: 1.6;">Thank you for reaching out! We've received your <strong>${type}</strong> callback request and our travel specialist will contact you soon.</p>
          <div style="background: white; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0066b2;">
            <h3 style="margin: 0 0 14px; font-size: 14px; text-transform: uppercase; color: #0066b2;">Your Request Summary</h3>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Phone:</strong> ${phone}</p>
            ${email ? `<p style="margin: 6px 0; font-size: 14px;"><strong>Email:</strong> ${email}</p>` : ""}
            <p style="margin: 6px 0; font-size: 14px;"><strong>Preferred Call Time:</strong> ${preferredTime}</p>
            ${message ? `<p style="margin: 6px 0; font-size: 14px;"><strong>Message:</strong> ${message}</p>` : ""}
          </div>
          <p style="font-size: 14px; color: #666;">Questions? Reach us at <strong>support@jetsetterss.com</strong> or <strong>(877) 538-7380</strong>.</p>
          <p style="font-size: 15px; color: #333;">Best regards,<br>The Jetsetters Team 🌍</p>
        </div>
        <div style="padding: 16px; text-align: center; font-size: 12px; color: #999; background: #f1f1f1; border-radius: 0 0 12px 12px;">
          <p style="margin: 0;">© 2026 Jetsetters. All rights reserved.</p>
        </div>
      </div>
    `;

    const adminHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">🔔 New Callback Request</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px;">${type.toUpperCase()} Inquiry</p>
        </div>
        <div style="padding: 16px 24px; background: #fffbeb; border-left: 4px solid #eab308;">
          <p style="margin: 0; font-size: 14px; font-weight: 600; color: #713f12;">⚡ Action Required: Please call the customer within 24 hours</p>
        </div>
        <div style="padding: 24px; background: #f9f9f9;">
          <div style="background: #e0f2fe; padding: 18px; border-radius: 10px;">
            <h3 style="margin: 0 0 14px; font-size: 13px; color: #0369a1; text-transform: uppercase;">Customer Details</h3>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Name:</strong> ${name}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Email:</strong> ${email || "Not provided"}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Phone:</strong> ${phone}</p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Preferred Call Time:</strong> ${preferredTime}</p>
            ${message ? `<p style="margin: 6px 0; font-size: 14px;"><strong>Message:</strong> ${message}</p>` : ""}
            <p style="margin: 6px 0; font-size: 14px;"><strong>Submitted:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
          </div>
        </div>
        <div style="padding: 14px; text-align: center; font-size: 12px; color: #999; background: #f1f1f1; border-radius: 0 0 12px 12px;">
          <p style="margin: 0;">Jetsetters Admin Notification</p>
        </div>
      </div>
    `;

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

// 404 handler for API routes (must be before static file serving)
app.use("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route ${req.method} ${req.path} not found`,
    path: req.path,
    method: req.method,
  });
});

// Middleware to set proper MIME types for assets
app.use((req, res, next) => {
  if (req.path.endsWith(".js")) {
    res.type("application/javascript");
  } else if (req.path.endsWith(".css")) {
    res.type("text/css");
  } else if (req.path.endsWith(".wasm")) {
    res.type("application/wasm");
  }
  next();
});

// Serve static files from dist (works in both dev and production)
const distPath = path.join(__dirname, "dist");
app.use(
  express.static(distPath, {
    // Cache settings for static assets
    maxAge: process.env.NODE_ENV === "production" ? "1y" : "0",
    etag: false,
  }),
);

// Serve index.html for SPA routing (catch-all)
app.get("*", (req, res) => {
  // Don't serve index.html for API requests
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      message: `API route ${req.method} ${req.path} not found`,
    });
  }

  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) {
      console.error("Error serving index.html:", err);
      res.status(500).send("Internal Server Error");
    }
  });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Test Supabase connection
const testSupabaseConnection = async (retryCount = 0, maxRetries = 5) => {
  try {
    console.log(
      `📡 Testing Supabase connection (attempt ${retryCount + 1}/${maxRetries + 1})...`,
    );
    const { data, error } = await supabase
      .from("users")
      .select("count")
      .single();

    if (error) {
      if (retryCount < maxRetries) {
        console.warn(
          `⚠️ Supabase connection error: ${error.message}. Retrying in 3 seconds...`,
        );
        setTimeout(
          () => testSupabaseConnection(retryCount + 1, maxRetries),
          3000,
        );
        return false;
      } else {
        console.error(
          "❌ Failed to connect to Supabase after multiple attempts:",
          error.message,
        );
        console.log(
          "The server will continue running, but database operations may fail.",
        );
        console.log("Possible issues:");
        console.log("  - Supabase credentials in .env file may be incorrect");
        console.log("  - Supabase service may be down or unreachable");
        console.log(
          "  - Required tables may not exist in your Supabase project",
        );
        console.log(
          'You can use "node setup-supabase-tables.js" to create the required tables.',
        );
        return false;
      }
    }

    console.log("✅ Supabase connection established successfully.");
    return true;
  } catch (error) {
    if (retryCount < maxRetries) {
      console.warn(
        `⚠️ Error connecting to Supabase: ${error.message}. Retrying in 3 seconds...`,
      );
      setTimeout(
        () => testSupabaseConnection(retryCount + 1, maxRetries),
        3000,
      );
      return false;
    } else {
      console.error(
        "❌ Failed to connect to Supabase after multiple attempts:",
        error.message,
      );
      console.log(
        "The server will continue running, but database operations may fail.",
      );
      return false;
    }
  }
};

// Initialize Supabase connection on startup
testSupabaseConnection();

// Debug middleware for email routes
app.use("/api/email/*", (req, res, next) => {
  console.log(`🔍 Email route accessed: ${req.method} ${req.originalUrl}`);
  console.log("🔍 Request headers:", req.headers);
  console.log("🔍 Request body:", req.body);
  next();
});

// For local development
if (
  process.env.NODE_ENV !== "test" &&
  (process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === undefined)
) {
  const findAvailablePort = async (startPort) => {
    const maxPort = 65535;
    let port = parseInt(startPort, 10);

    while (port <= maxPort) {
      try {
        await new Promise((resolve, reject) => {
          const server = app
            .listen(port)
            .once("listening", () => {
              server.close();
              resolve();
            })
            .once("error", (err) => {
              if (err.code === "EADDRINUSE") {
                reject(err);
              } else {
                reject(err);
              }
            });
        });
        return port;
      } catch (err) {
        if (err.code === "EADDRINUSE") {
          console.log(`⚠️ Port ${port} is in use, trying next port...`);
          port++;
          continue;
        }
        throw err;
      }
    }
    throw new Error("No available ports found");
  };

  const startServer = async () => {
    try {
      const port = await findAvailablePort(PORT);
      const server = app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);

        // Re-apply CORS middleware with updated settings
        app.use((req, res, next) => {
          res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
          res.header(
            "Access-Control-Allow-Methods",
            "GET,PUT,POST,DELETE,OPTIONS,PATCH",
          );
          res.header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, Accept, Origin, X-Requested-With, x-csrf-token",
          );
          res.header("Access-Control-Allow-Credentials", "true");
          res.header("Access-Control-Expose-Headers", "set-cookie");

          if (req.method === "OPTIONS") {
            return res.sendStatus(200);
          }
          next();
        });
      });
    } catch (error) {
      console.error("❌ Failed to start server:", error);
      process.exit(1);
    }
  };

  startServer();
}

// For Vercel serverless deployment
export default app;

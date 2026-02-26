import crypto from "crypto";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { SystemConfig } from "../models/SystemConfig";

export const ADMIN_CONFIG_KEYS = {
  SETUP_TOKEN: "admin_setup_token",
} as const;

/**
 * Seeds the first admin account on startup if none exists.
 *
 * Flow:
 *  1. Check if any user with role='admin' exists → if yes, return early.
 *  2. Generate a random placeholder email + a one-time setup token.
 *  3. Create the admin user (requiresSetup=true, random password so no one can log in yet).
 *  4. Store the setup token in SystemConfig under key 'admin_setup_token'.
 *  5. Log the admin ID + instructions to complete setup at /admin/setup.
 *
 * The admin must visit /admin/setup and exchange the setup token for a real
 * email + password before they can use the dashboard.
 */
export async function seedAdminAccount(): Promise<void> {
  try {
    const existingAdmin = await User.findOne({ role: "admin" }).lean();
    if (existingAdmin) {
      console.log("[adminSeed] Admin account already exists — skipping seed.");
      return;
    }

    // Generate credentials
    const placeholderEmail = `admin-${Date.now()}@placeholder.local`;
    const setupToken = crypto.randomBytes(32).toString("hex");
    // Random 64-char password — unusable in practice (admin must use setupToken)
    const randomPassword = crypto.randomBytes(32).toString("base64");
    const hashedPassword = await bcrypt.hash(randomPassword, 12);

    // Create admin user directly (bypass the pre-save hook — already hashed above)
    const admin = await User.create({
      email: placeholderEmail,
      password: hashedPassword,
      name: "Admin",
      role: "admin",
      requiresSetup: true,
    });

    // Store setup token in SystemConfig (upsert — safe to re-run)
    await SystemConfig.updateOne(
      { key: ADMIN_CONFIG_KEYS.SETUP_TOKEN },
      {
        $set: {
          value: setupToken,
          description:
            "One-time setup token for the admin account. Consumed on /admin/setup.",
        },
      },
      { upsert: true },
    );

    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║              ADMIN ACCOUNT CREATED                  ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  Admin ID    : ${String(admin._id).padEnd(38)}║`);
    console.log(`║  Setup Token : ${setupToken.slice(0, 38)}║`);
    console.log(`║              : ${setupToken.slice(38).padEnd(38)}║`);
    console.log("║                                                      ║");
    console.log("║  Visit /admin/setup to complete setup.               ║");
    console.log("╚══════════════════════════════════════════════════════╝");
  } catch (err) {
    // Non-fatal — log and continue server startup
    console.error("[adminSeed] Failed to seed admin account (non-fatal):", err);
  }
}

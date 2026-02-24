import mongoose from "mongoose";
import { env } from "./env";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectDB(attempt = 1): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("[db] MongoDB connected successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[db] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${message}`,
    );

    if (attempt >= MAX_RETRIES) {
      console.error("[db] Max retries reached. Exiting.");
      process.exit(1);
    }

    console.log(`[db] Retrying in ${RETRY_DELAY_MS / 1000}s...`);
    await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
    return connectDB(attempt + 1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("[db] MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("[db] MongoDB error:", err);
});

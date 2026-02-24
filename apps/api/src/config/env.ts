import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  GOOGLE_GENERATIVE_AI_API_KEY: z
    .string()
    .min(1, "GOOGLE_GENERATIVE_AI_API_KEY is required"),
  PORT: z.string().default("5006"),
  NEXT_PUBLIC_API_URL: z.string().default("http://localhost:3000"),
  // Optional — fallback for trend research
  TAVILY_API_KEY: z.string().optional(),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    result.error.issues.forEach((issue) => {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    });
    console.error(
      "\nCopy .env.example to .env and fill in the required values.",
    );
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();

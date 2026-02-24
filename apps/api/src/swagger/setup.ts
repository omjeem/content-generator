import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Router } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "LinkedIn Content Suggestion API",
      version: "1.0.0",
      description: `
## LinkedIn AI Content Suggestion Agent — API Documentation

A multi-agent AI pipeline that analyses your LinkedIn presence and generates
personalised content ideas using Mastra AI + Google Gemini.

### How the pipeline works
1. **POST /api/persona/analyze** — Agent 1 scrapes your LinkedIn (or accepts manual paste) and derives your writing style, tone, and topics
2. **POST /api/onboarding/chat** — Agent 2 conducts an interview to learn your goals, audience, and content pillars (persists across sessions)
3. **GET /api/trends** — Agent 3 fetches trending topics in your niche via Google Trends
4. **POST /api/suggestions/generate** — Orchestrator runs all agents and Agent 4 generates 5–10 personalised post ideas

### Authentication
All routes (except \`/api/auth/register\` and \`/api/auth/login\`) require a JWT.
You can authenticate using either:
- **Cookie**: \`token\` (httpOnly, set automatically on login)
- **Header**: \`Authorization: Bearer <token>\`
      `,
      contact: { name: "API Support" },
    },
    servers: [
      { url: "http://localhost:3001", description: "Local development" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "token",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        UserPersona: {
          type: "object",
          properties: {
            _id: { type: "string" },
            userId: { type: "string" },
            linkedinUrl: { type: "string" },
            writingStyle: {
              type: "string",
              example: "conversational, story-driven",
            },
            tone: { type: "string", example: "professional yet approachable" },
            topics: {
              type: "array",
              items: { type: "string" },
              example: ["AI", "leadership", "startups"],
            },
            postFormats: {
              type: "array",
              items: { type: "string" },
              example: ["carousel", "text-post"],
            },
            goals: { type: "string" },
            targetAudience: { type: "string" },
            industry: { type: "string" },
            contentPillars: { type: "array", items: { type: "string" } },
            postingFrequency: { type: "string", example: "3x per week" },
            interviewComplete: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Suggestion: {
          type: "object",
          properties: {
            topic: { type: "string", example: "The future of remote work" },
            angle: {
              type: "string",
              example: "Why async-first teams outperform sync-heavy ones",
            },
            format: {
              type: "string",
              enum: ["carousel", "text-post", "poll", "video-script", "list"],
            },
            hook: {
              type: "string",
              example: "We hired 12 people without a single Zoom call.",
            },
            whyItFits: {
              type: "string",
              example: "Matches your data-driven tone and leadership pillar",
            },
          },
        },
        ContentSuggestion: {
          type: "object",
          properties: {
            _id: { type: "string" },
            userId: { type: "string" },
            generatedAt: { type: "string", format: "date-time" },
            trendsUsed: { type: "array", items: { type: "string" } },
            suggestions: {
              type: "array",
              items: { $ref: "#/components/schemas/Suggestion" },
            },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: { type: "string" },
          },
        },
      },
      responses: {
        ValidationError: {
          description: "Validation failed",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        Unauthorized: {
          description: "Authentication required",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Authentication required. Please log in." },
            },
          },
        },
      },
    },
    tags: [
      { name: "Auth", description: "Register, login, and manage sessions" },
      { name: "Persona", description: "Analyse LinkedIn profile (Agent 1)" },
      {
        name: "Onboarding",
        description: "Interview agent with persistent memory (Agent 2)",
      },
      { name: "Trends", description: "Real-time trend research (Agent 3)" },
      {
        name: "Suggestions",
        description: "AI content idea generation (Agent 4 + Orchestrator)",
      },
    ],
  },
  apis: ["./src/routes/*.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export function createSwaggerRouter() {
  const router = Router();

  // Serve raw OpenAPI JSON spec
  router.get("/openapi.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });

  // Serve Swagger UI
  router.use(
    "/",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: "LinkedIn Content API Docs",
      customCss: `
        .swagger-ui .topbar { background-color: #0077B5; }
        .swagger-ui .topbar-wrapper img { display: none; }
        .swagger-ui .topbar-wrapper::before {
          content: 'LinkedIn Content Suggestion API';
          color: white;
          font-size: 1.2rem;
          font-weight: bold;
        }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      },
    }),
  );

  return router;
}

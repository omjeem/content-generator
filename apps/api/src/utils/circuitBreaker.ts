/**
 * Circuit Breaker — Phase 4 #13
 *
 * Protects downstream services (LLM calls) from cascading failures.
 *
 * States:
 *   CLOSED     → requests pass through; failures are counted
 *   OPEN       → requests fail immediately with a descriptive error
 *   HALF_OPEN  → limited requests are allowed to test recovery
 *
 * Config comes from PIPELINE.CIRCUIT_BREAKER in config/constants.ts:
 *   failureThreshold: 5    — consecutive failures before opening
 *   cooldownMs: 60_000     — how long to stay open before half-open
 *   halfOpenRequests: 1    — how many trial requests in half-open
 */

import { PIPELINE } from "../config/constants";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenRequests: number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(
    name: string,
    config: CircuitBreakerConfig = PIPELINE.CIRCUIT_BREAKER,
  ) {
    this.name = name;
    this.config = config;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws immediately if the circuit is open and cooldown hasn't elapsed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;

      if (elapsed < this.config.cooldownMs) {
        const remainingSec = Math.ceil(
          (this.config.cooldownMs - elapsed) / 1000,
        );
        throw new Error(
          `AI service temporarily unavailable. Retrying in ${remainingSec}s.`,
        );
      }

      // Cooldown elapsed → transition to half-open
      this.state = "half-open";
      this.halfOpenAttempts = 0;
      console.log(`[circuit-breaker:${this.name}] OPEN → HALF_OPEN`);
    }

    if (
      this.state === "half-open" &&
      this.halfOpenAttempts >= this.config.halfOpenRequests
    ) {
      throw new Error(
        `AI service temporarily unavailable. Recovery test in progress.`,
      );
    }

    try {
      if (this.state === "half-open") {
        this.halfOpenAttempts++;
      }

      const result = await fn();

      // Success → reset to closed
      if (this.state !== "closed") {
        console.log(
          `[circuit-breaker:${this.name}] ${this.state.toUpperCase()} → CLOSED (recovered)`,
        );
      }
      this.state = "closed";
      this.consecutiveFailures = 0;
      this.halfOpenAttempts = 0;

      return result;
    } catch (err) {
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();

      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.state = "open";
        console.error(
          `[circuit-breaker:${this.name}] OPEN after ${this.consecutiveFailures} consecutive failures`,
        );
      } else if (this.state === "half-open") {
        // Half-open test failed → back to open
        this.state = "open";
        console.error(
          `[circuit-breaker:${this.name}] HALF_OPEN → OPEN (recovery test failed)`,
        );
      }

      throw err;
    }
  }

  /** Current state for diagnostics */
  getState(): CircuitState {
    return this.state;
  }

  /** Reset to closed (e.g. for testing) */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = 0;
  }
}

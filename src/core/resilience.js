import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import pRetry from "p-retry";

const CIRCUIT_FILE = join(process.cwd(), "data", "circuit-breaker-state.json");

export class CircuitBreaker {
  static state = existsSync(CIRCUIT_FILE)
    ? JSON.parse(readFileSync(CIRCUIT_FILE, "utf-8"))
    : {};

  static FAILURE_THRESHOLD = 3;
  static COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

  static isOpen(serviceName) {
    const service = this.state[serviceName];
    if (!service) return false;
    if (service.open && Date.now() - service.openedAt < this.COOLDOWN_MS) {
      return true;
    }
    // Reset if cooldown expired
    if (service.open && Date.now() - service.openedAt >= this.COOLDOWN_MS) {
      this.state[serviceName] = { failures: 0, open: false, openedAt: null };
      this.save();
      return false;
    }
    return false;
  }

  static recordFailure(serviceName) {
    if (!this.state[serviceName]) {
      this.state[serviceName] = { failures: 0, open: false, openedAt: null };
    }
    this.state[serviceName].failures++;
    if (this.state[serviceName].failures >= this.FAILURE_THRESHOLD) {
      this.state[serviceName].open = true;
      this.state[serviceName].openedAt = Date.now();
      console.log(
        `   🔴 Circuit breaker OPENED for ${serviceName} — skipping for 24h`,
      );
    }
    this.save();
  }

  static recordSuccess(serviceName) {
    if (this.state[serviceName]) {
      this.state[serviceName].failures = Math.max(
        0,
        this.state[serviceName].failures - 1,
      );
      this.save();
    }
  }

  static save() {
    writeFileSync(CIRCUIT_FILE, JSON.stringify(this.state, null, 2));
  }
}

export class ResilienceManager {
  constructor() {
    this.defaultRetryOptions = {
      retries: 3,
      minTimeout: 2000,
      maxTimeout: 30000,
      factor: 2,
      onFailedAttempt: (error) => {
        console.log(
          `      ⚠️ Attempt ${error.attemptNumber} failed: ${error.message}`,
        );
      },
    };
  }

  async withRetry(fn, serviceName) {
    try {
      const result = await pRetry(
        async (attemptNumber) => {
          try {
            return await fn();
          } catch (error) {
            // Don't retry on auth errors
            if (error.status === 401 || error.status === 403) {
              throw new pRetry.AbortError(error);
            }
            throw error;
          }
        },
        {
          ...this.defaultRetryOptions,
          onFailedAttempt: (error) => {
            console.log(
              `      ⚠️ [${serviceName}] Attempt ${error.attemptNumber} failed`,
            );
          },
        },
      );

      CircuitBreaker.recordSuccess(serviceName);
      return result;
    } catch (error) {
      CircuitBreaker.recordFailure(serviceName);
      throw error;
    }
  }
}

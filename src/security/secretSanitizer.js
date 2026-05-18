// Overrides console methods to scrub secrets from all log output.
const SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  "AMAZON_SECRET_KEY",
  "AMAZON_ACCESS_KEY",
  "MEDIUM_API_TOKEN",
  "DEVTO_API_KEY",
  "HASHNODE_API_TOKEN",
  "TWITTER_API_SECRET",
  "TWITTER_ACCESS_SECRET",
  "LINKEDIN_CLIENT_SECRET",
  "GUMROAD_ACCESS_TOKEN",
  "RESEND_API_KEY",
  "DUBCO_API_KEY",
  "GITHUB_TOKEN",
];

const secretValues = SECRET_KEYS.map((k) => process.env[k]).filter(
  (v) => typeof v === "string" && v.length > 5,
);

export function installSecretSanitizer() {
  const originalLog = console.log;
  const originalError = console.error;

  function scrub(msg) {
    let s = String(msg);
    secretValues.forEach((val) => {
      // Replace full value and substrings (like QUERTY-xxx)
      s = s.replaceAll(val, "***");
      if (val.length > 10) {
        s = s.replaceAll(val.slice(0, 10), "***");
      }
    });
    return s;
  }

  console.log = (...args) => originalLog(...args.map(scrub));
  console.error = (...args) => originalError(...args.map(scrub));

  // Also prevent accidental dumping of env
  process.env = new Proxy(process.env, {
    get(target, prop) {
      return target[prop];
    },
    set(target, prop) {
      console.log("   ❌ Attempt to modify process.env blocked");
      return true;
    },
    ownKeys(target) {
      return Object.keys(target).filter((k) => !SECRET_KEYS.includes(k));
    },
  });
}

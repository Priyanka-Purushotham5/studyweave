let text = "";
for await (const chunk of process.stdin) text += chunk;
const { services: s } = JSON.parse(text);
const requireValue = (ok, message) => {
  if (!ok) throw new Error(message);
};
requireValue(
  s["ai-service"] && s.api && s.caddy,
  "Compose must contain ai-service, api and caddy",
);
requireValue(
  !s["ai-service"].ports?.length && !s.api.ports?.length,
  "Only Caddy may publish API/AI traffic",
);
requireValue(
  s.api.environment.AI_SERVICE_URL === "http://ai-service:8000",
  "API must call A by internal service name",
);
requireValue(
  !s.api.environment.GEMINI_API_KEY && !s.caddy.environment.GEMINI_API_KEY,
  "Gemini key must be scoped only to A",
);
requireValue(
  s.api.environment.NODE_ENV === "production" &&
    s.api.environment.ENABLE_DEV_SEED === "false",
  "Production must disable the dev seed route",
);
const ai = s["ai-service"].environment ?? {};
requireValue(
  ai.FAKE_GEMINI === "1" ||
    (ai.GEMINI_API_KEY && !ai.GEMINI_API_KEY.includes("REPLACE_")),
  "Provide a real Gemini key or explicitly select FAKE_GEMINI=1",
);
requireValue(
  !s.api.environment.MONGODB_URI.includes("USER:PASSWORD"),
  "Replace the Atlas URI placeholder",
);
requireValue(
  s.caddy.environment.API_PASSWORD_HASH.startsWith("$2"),
  "Generate a Caddy password hash",
);
requireValue(
  !s.caddy.environment.DOMAIN.endsWith(".example.com"),
  "Set a real domain",
);
console.log("Production Compose preflight passed; no credentials were printed");

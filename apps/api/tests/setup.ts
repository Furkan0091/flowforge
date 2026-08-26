process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ||
  process.env.DATABASE_URL ||
  "postgresql://flowforge:flowforge@localhost:5432/flowforge_test?schema=public";
process.env.JWT_SECRET = process.env.JWT_SECRET || "flowforge-test-secret";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.EMAIL_MODE = process.env.EMAIL_MODE || "mock";

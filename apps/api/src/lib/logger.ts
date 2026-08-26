function ts(): string {
  return new Date().toISOString();
}

function write(level: string, msg: string, meta?: unknown): void {
  const line = `[${ts()}] ${level.toUpperCase()} ${msg}`;
  if (meta !== undefined && meta !== null) {
    let extra: string;
    try {
      extra = JSON.stringify(meta);
    } catch {
      extra = String(meta);
    }
    if (process.env.NODE_ENV !== "test") {
      // eslint-disable-next-line no-console
      console.log(`${line} ${extra}`);
    }
    return;
  }
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => write("info", msg, meta),
  warn: (msg: string, meta?: unknown) => write("warn", msg, meta),
  error: (msg: string, meta?: unknown) => write("error", msg, meta),
  debug: (msg: string, meta?: unknown) => write("debug", msg, meta),
};

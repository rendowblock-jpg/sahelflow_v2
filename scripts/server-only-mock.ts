// Mock for the `server-only` package.
// The real package throws when imported on the client. In vitest (node
// environment), we're always server-side, so this is a no-op.
export {};

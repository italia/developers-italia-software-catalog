import { app } from "./app";

const port = Number(process.env.API_PORT ?? 3001);

export default {
  port,
  fetch: app.fetch,
};

console.log(`api listening on http://localhost:${port}`);

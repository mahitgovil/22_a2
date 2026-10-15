import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApp } from './app.js';
import { startPingSimulator } from './pings.js';

const app = createApp();

// If the web app has been built (web/dist), serve it from the same port.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`GigTask API listening on http://localhost:${port}`);
  if (process.env.SIMULATE_PINGS === '1') startPingSimulator();
});

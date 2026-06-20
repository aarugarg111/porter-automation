// src/index.ts
import express from 'express';
import { getDb } from './db/index.js';
import { seedHome } from './db/seed.js';
import { MockMessenger } from './messenger/mock.js';
import { captureRouter } from './api/capture.js';
import { readRouter } from './api/read.js';
const db = getDb(); seedHome(db);
const app = express(); app.use(express.json());
app.use(readRouter(db)); app.use(captureRouter(db, new MockMessenger()));
const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`cockpit on :${port}`));

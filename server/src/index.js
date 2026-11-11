import { config } from './config.js';
import { openDatabase } from './db.js';
import { createApp } from './app.js';

const db = openDatabase();
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
  console.log(`[server] AI ${config.llm.apiKey ? `enabled (model: ${config.llm.model})` : 'disabled - set OPENCODE_API_KEY in .env'}`);
});

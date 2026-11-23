import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const { app, db, chain } = createApp(config);
const server = app.listen(config.port, config.host, () => {
  console.log(`EduCert Backend: http://${config.host}:${config.port}/api/v1`);
});
function shutdown() { server.close(() => { chain.close(); db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

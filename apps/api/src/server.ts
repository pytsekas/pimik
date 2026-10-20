import { createApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});

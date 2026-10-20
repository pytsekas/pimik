import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { initFirebase } from './firebase.ts';
import { PhotoIndexRepo } from './repo/photoIndex.ts';
import { PostRepo } from './repo/posts.ts';
import { TermRepo } from './repo/terms.ts';
import { PhotoStore } from './storage/bucket.ts';

const config = loadConfig();
const { db, auth } = initFirebase(config);
const photoStore = new PhotoStore(config);
if (config.storageEmulatorHost) {
  await photoStore.ensureBucket();
}
const app = createApp({
  config,
  posts: new PostRepo(db),
  categories: new TermRepo(db, 'categories'),
  tags: new TermRepo(db, 'tags'),
  photoIndex: new PhotoIndexRepo(db),
  auth,
  photoStore,
});

app.listen(config.port, () => {
  console.log(`api listening on http://localhost:${config.port}`);
});

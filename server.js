/**
 * Optional entry for hosts that run `node server.js` after `npm run build`.
 * The canonical production command is `npm start` → `node dist/index.cjs`.
 * This file loads the same bundled Express app without duplicating source.
 */
import "./dist/index.cjs";

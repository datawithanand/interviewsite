require('dotenv').config();
const createApp = require('./app');

const app = createApp();
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ServiceNow Interview Questions API listening on port ${PORT}`);
});

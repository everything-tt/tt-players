const fs = require('node:fs');

const input = fs.readFileSync(0, 'utf8').trim();
const entries = input ? JSON.parse(input) : [];
const scope = process.env.REPORT_SCOPE;
const timezone = process.env.REPORT_TIMEZONE;
const counts = { bug: 0, feature: 0, general: 0 };

for (const entry of entries) {
  counts[entry.message_type] = (counts[entry.message_type] || 0) + 1;
}

console.log('# Feedback Backlog Report');
console.log('');
console.log(`Scope: ${scope}`);
console.log(`Timezone: ${timezone}`);
console.log(`Total received: ${entries.length}`);
console.log('');
console.log('## Summary');
console.log('');
console.log(`- Bugs: ${counts.bug || 0}`);
console.log(`- Features: ${counts.feature || 0}`);
console.log(`- General: ${counts.general || 0}`);

if (entries.length === 0) {
  console.log('');
  console.log('No unlinked feedback was found for this scope.');
  process.exit(0);
}

console.log('');
console.log('## Entries');

entries.forEach((entry, index) => {
  const name = entry.name || 'Anonymous';
  const email = entry.email || 'No email';
  const message = String(entry.message).replace(/\r\n/g, '\n').trim();

  console.log('');
  console.log(`### ${index + 1}. ${entry.message_type} - ${entry.received_at}`);
  console.log('');
  console.log(`From: ${name} (${email})`);
  console.log('');
  console.log(message);
});

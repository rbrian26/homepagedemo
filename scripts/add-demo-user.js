#!/usr/bin/env node
// Usage: node scripts/add-demo-user.js "Chris Reite" "Penn State" [expires YYYY-MM-DD]
// Prints the JSON entry to add to TA_DEMO_USERS, plus a ready-to-send invite email.
const [name, org, expires] = process.argv.slice(2);
if (!name || !org) { console.error('Usage: add-demo-user.js "Full Name" "Organization" [YYYY-MM-DD]'); process.exit(1); }
const words = ['maple', 'river', 'harbor', 'cedar', 'lantern', 'summit', 'meadow', 'compass', 'willow', 'ember', 'tidewater', 'granite', 'orchard', 'beacon'];
const pick = () => words[require('crypto').randomInt(words.length)];
const pw = `${pick()}-${pick()}-${require('crypto').randomInt(10, 100)}`;
const entry = { pw, name, org, ...(expires ? { expires } : {}) };
const first = name.split(' ')[0];
console.log('\n1) Add this object to the TA_DEMO_USERS array in Cloudflare:\n');
console.log(JSON.stringify(entry));
console.log(`\n2) Invite email:\n
Subject: Threat assessment training preview for ${org}

Hi ${first},

Here's the private preview we talked about: the full threat assessment series, the Campus Safety Culture shorts, and licensing options.

https://blueseatstudios.com/ta-demo/
Your password: ${pw}

Feel free to ask me for a password for any colleagues who should see it. Happy to walk through it on a call too: calendly.com/rachelbrian

Rachel
`);

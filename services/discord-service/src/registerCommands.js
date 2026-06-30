import 'dotenv/config';
import fetch from 'node-fetch';

/**
 * One-time (or whenever-you-change-commands) setup script — registers the
 * slash commands with Discord so they show up in the server's command list.
 * This is separate from the running server because command registration is
 * an infrequent admin action, not something that should happen on every boot.
 *
 * Usage:
 *   DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... node src/registerCommands.js
 * or just:
 *   npm run register-commands   (reads .env)
 */

const commands = [
  {
    name: 'report',
    description: 'File a report. Leave text empty to get a form.',
    options: [
      {
        name: 'text',
        description: 'What are you reporting?',
        type: 3, // STRING
        required: false,
      },
    ],
  },
  {
    name: 'status',
    description: 'Check the bot status and acknowledge it.',
  },
];

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  const appId = process.env.DISCORD_APPLICATION_ID;

  if (!token || !appId) {
    console.error('Missing DISCORD_BOT_TOKEN or DISCORD_APPLICATION_ID in environment.');
    process.exit(1);
  }

  const url = `https://discord.com/api/v10/applications/${appId}/commands`;

  const res = await fetch(url, {
    method: 'PUT', // PUT replaces the entire global command set — idempotent, safe to re-run.
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Failed to register commands (${res.status}):`, body);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Registered ${data.length} global command(s):`, data.map((c) => `/${c.name}`).join(', '));
  console.log('Note: global commands can take up to 1 hour to appear. For instant testing during');
  console.log('development, register guild-specific commands instead (see README.md).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

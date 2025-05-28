// Load environment variables from the .env file
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits
} = require('discord.js');
const { GoogleAuth } = require('google-auth-library');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Static data caching
const FACTS = [
  "Zero was invented by Indian mathematicians.",
  "A circle has infinite lines of symmetry.",
  "Euler's identity: e^(iπ) + 1 = 0."
];
const QUOTES = [
  "Mathematics is the language… - Galileo",
  "Pure mathematics is…the poetry of logical ideas. - Einstein",
  "Do not worry about your difficulties… - Einstein"
];
const PUZZLES = [
  "I am a 3-digit number. Tens = ones + 5; hundreds = tens – 8.",
  "Next in sequence: 1, 4, 9, 16, 25, __?",
  "17 sheep, all but 9 run away. How many remain?"
];

// Config/constants
const TOKEN = process.env.BOT_TOKEN;
const STARTUP_IGNORE = 1000; // ms

// Client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});
let readyAt;

client.once('ready', () => {
  readyAt = Date.now();
  console.log(`Logged in as ${client.user.tag}`);
});

// Format uptime in d/h/m
const formatUptime = ms => {
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d ${h}h ${m}m`;
};

// Graceful restart
function delayedRestart(msg, successText, delay = 5000) {
  msg.reply(successText)
    .then(() => setTimeout(() => process.exit(0), delay))
    .catch(err => console.error("Error sending restart confirmation:", err));
}

// Handle AI prompt via Vertex AI
const handlePrompt = async msg => {
  const prompt = msg.content.replace(/^<@!?\d+>/, '').trim();
  if (!prompt) return;

  try {
    const mathPrompt =
      `Answer the following math query concisely in one line as a math bot: ${prompt}`;

    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/generative-language']
    });
    const authClient = await auth.getClient();
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const response = await authClient.request({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        prompt: { text: mathPrompt },
        candidateCount: 1,
        temperature: 0.0,
        maxOutputTokens: 30
      }
    });

    const reply = response.data.candidates?.[0]?.output;
    if (!reply) return msg.reply("❌ I couldn't think of a reply.");
    return msg.reply(reply.split('\n')[0]);

  } catch (e) {
    console.error('Vertex AI error:', e);
    return msg.reply('❌ Error fetching response from Vertex AI.');
  }
};

// Command handlers
const handlers = {
  help: msg => {
    const isOwner = msg.author.id === msg.guild?.ownerId;
    const base =
      "**Commands:**\n" +
      "• Utility: ping, hello, uptime\n" +
      "• Fun: mathfact, quote, mathpuzzle\n" +
      "• Info: serverinfo, userinfo\n" +
      "• AI: Mention the bot and ask anything!\n";
    const mod = isOwner ? "• Mod: clear, mute, warn, kick, ban\n" : '';
    const admin = isOwner ? "• Admin: restart, hardreset" : '';

    return msg.reply(base + mod + admin);
  },

  hello: msg => msg.reply('Hello!'),
  ping: msg => msg.reply(`Pong! ${Date.now() - msg.createdTimestamp}ms`),
  uptime: msg => msg.reply(`Uptime: ${formatUptime(Date.now() - readyAt)}`),

  mathfact: msg =>
    msg.reply(`🧮 **Did you know?**\n${
      FACTS[Math.floor(Math.random() * FACTS.length)]
    }`),

  quote: msg =>
    msg.reply(`📜 **Thought of the day:**\n"${
      QUOTES[Math.floor(Math.random() * QUOTES.length)]
    }"`),

  mathpuzzle: msg =>
    msg.reply(`🧩 **Try this puzzle:**\n${
      PUZZLES[Math.floor(Math.random() * PUZZLES.length)]
    }`),

  clear: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return msg.reply("❌ You don't have permission to clear messages.");

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0)
      return msg.reply("Please provide a valid number of messages to delete.");

    try {
      await msg.channel.bulkDelete(amount, true);
      return msg.reply(`🗑️ Deleted ${amount} messages.`);
    } catch (e) {
      console.error('Error clearing messages:', e);
      return msg.reply("❌ An error occurred while trying to delete messages.");
    }
  },

  restart: async msg => {
    if (msg.guild && msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ You don't have permission to restart the bot.");

    await msg.reply("🔄 Restarting the bot, please wait...");
    delayedRestart(msg, '✅ Restart completed!');
  },

  hardreset: async msg => {
    if (msg.guild && msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ You don't have permission to hard reset the bot.");

    await msg.reply("🔄 Hard reset in progress, please wait...");

    try {
      const { stdout, stderr } = await execPromise('git pull');
      if (stderr) await msg.reply(`⚠️ Warning during git pull: ${stderr}`);

      delayedRestart(msg, `✅ Hard reset completed! ${stdout}`);
    } catch (e) {
      console.error('Error during hardreset:', e);
      return msg.reply(`❌ Error during hard reset: ${e.message}`);
    }
  }
};

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (Date.now() - (readyAt || 0) < STARTUP_IGNORE) return;

  // AI: mention-based prompt
  if (msg.mentions.has(client.user) && !msg.content.startsWith('!')) {
    return handlePrompt(msg);
  }

  // Command prefix
  if (!msg.content.startsWith('!')) return;

  const [cmd, ...args] = msg.content.slice(1).trim().split(/ +/);
  const h = handlers[cmd.toLowerCase()];

  try {
    if (h) return h(msg, args);
    return msg.reply("❓ Unknown command. See !help.");
  } catch {
    return msg.reply("❌ An error occurred.");
  }
});

client.login(TOKEN);
```

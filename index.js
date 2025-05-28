// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
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
    const mathPrompt = `Answer the following math query concisely in one line as a math bot: ${prompt}`;
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/generative-language'] });
    const authClient = await auth.getClient();
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
    msg.reply(reply.split('\n')[0]);

  } catch (e) {
    console.error('Vertex AI error:', e);
    msg.reply('❌ Error fetching response from Vertex AI.');
  }
};

// Command handlers
const handlers = {
  help: msg => {
    const isOwner = msg.author.id === msg.guild?.ownerId;
    let reply = "**Commands:** • Utility: ping, hello, uptime • Fun: mathfact, quote, mathpuzzle • Info: serverinfo, userinfo • AI: Mention the bot and ask anything!";
    if (isOwner) reply += " • Mod: clear, mute, warn, kick, ban • Admin: restart, hardreset";
    msg.reply(reply);
  },

  hello: msg => msg.reply('Hello!'),
  ping: msg => msg.reply(`Pong! ${Date.now() - msg.createdTimestamp}ms`),
  uptime: msg => msg.reply(`Uptime: ${formatUptime(Date.now() - readyAt)}`),

  mathfact: msg => msg.reply(`🧼 **Did you know?** ${FACTS[Math.floor(Math.random() * FACTS.length)]}`),
  quote: msg => msg.reply(`📜 **Thought of the day:** \"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}\"`),
  mathpuzzle: msg => msg.reply(`🧹 **Try this puzzle:** ${PUZZLES[Math.floor(Math.random() * PUZZLES.length)]}`),

  serverinfo: msg => {
    const { name, memberCount, createdAt } = msg.guild;
    msg.reply(`🏢 **Server Name:** ${name}\n📅 **Created On:** ${createdAt.toDateString()}\n👥 **Members:** ${memberCount}`);
  },

  userinfo: msg => {
    const user = msg.mentions.users.first() || msg.author;
    msg.reply(`👤 **User:** ${user.tag}\n🆔 **ID:** ${user.id}\n📅 **Created On:** ${user.createdAt.toDateString()}`);
  },

  clear: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return msg.reply("❌ You don't have permission to clear messages.");
    }
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
      return msg.reply("Please provide a valid number of messages to delete.");
    }
    try {
      await msg.channel.bulkDelete(amount, true);
      msg.reply(`🗑️ Deleted ${amount} messages.`);
    } catch (e) {
      console.error('Error clearing messages:', e);
      msg.reply("❌ An error occurred while trying to delete messages.");
    }
  },

  mute: msg => msg.reply("🔇 Mute command not yet implemented."),
  warn: msg => msg.reply("⚠️ Warn command not yet implemented."),
  kick: msg => msg.reply("🥾 Kick command not yet implemented."),
  ban: msg => msg.reply("🔨 Ban command not yet implemented."),

  restart: async msg => {
    if (msg.guild && msg.author.id !== msg.guild.ownerId) {
      return msg.reply("❌ You don't have permission to restart the bot.");
    }
    await msg.reply("🔄 Restarting the bot, please wait...");
    delayedRestart(msg, '✅ Restart completed!');
  },

  hardreset: async msg => {
    if (msg.guild && msg.author.id !== msg.guild.ownerId) {
      return msg.reply("❌ You don't have permission to hard reset the bot.");
    }
    await msg.reply("🔄 Hard reset in progress, please wait...");
    try {
      const { stdout, stderr } = await execPromise('git pull');
      if (stderr) await msg.reply(`⚠️ Warning during git pull: ${stderr}`);
      delayedRestart(msg, `✅ Hard reset completed! ${stdout}`);
    } catch (e) {
      console.error('Error during hardreset:', e);
      msg.reply(`❌ Error during hard reset: ${e.message}`);
    }
  }
};

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (Date.now() - (readyAt || 0) < STARTUP_IGNORE) return;

  if (msg.mentions.has(client.user) && !msg.content.startsWith('!')) {
    return handlePrompt(msg);
  }

  if (!msg.content.startsWith('!')) return;
  const [cmd, ...args] = msg.content.slice(1).trim().split(/ +/);
  const h = handlers[cmd.toLowerCase()];
  if (h) return h(msg, args);
  msg.reply("❓ Unknown command. See !help.");
});

client.login(TOKEN);

// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const OpenAI = require('openai');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Static cache
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
const STARTUP_IGNORE = 1000;  // ms
const RESTART_DELAY = 1000;   // ms

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

client.once('ready', () => {
  readyAt = Date.now();
  console.log(`Logged in as ${client.user.tag}`);
});

const delayExit = () => setTimeout(() => process.exit(0), RESTART_DELAY);
const parseMinutes = str => {
  const m = parseInt(str);
  return isNaN(m) ? null : m * 60 * 1000;
};
const formatUptime = ms => {
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d ${h}h ${m}m`;
};

const handlePrompt = async msg => {
  const prompt = msg.content.replace(/^<@!?\d+>/, '').trim();
  if (!prompt) return;
  try {
    const res = await openai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-3.5-turbo"
    });
    const reply = res.choices?.[0]?.message?.content;
    if (!reply) return msg.reply("❌ I couldn't think of a reply.");
    return msg.reply(reply);
  } catch (e) {
    console.error("OpenAI error:", e);
    return msg.reply("❌ Error fetching response.");
  }
};

const handlers = {
  help: msg => {
    const isOwner = msg.author.id === msg.guild?.ownerId;
    return msg.reply(
      "**Commands:**\n" +
      "• Utility: ping, hello, uptime\n" +
      "• Fun: mathfact, quote, mathpuzzle\n" +
      "• Info: serverinfo, userinfo\n" +
      "• AI: Mention the bot and ask anything!\n" +
      (isOwner ? "• Mod: clear, mute, warn, kick, ban" : '')
    );
  },

  hello: msg => msg.reply("Hello!"),
  ping: msg => msg.reply(`Pong! ${Date.now() - msg.createdTimestamp}ms`),
  uptime: msg => msg.reply(`Uptime: ${formatUptime(Date.now() - readyAt)}`),

  mathfact: msg =>
    msg.reply(`🧮 **Did you know?**\n${FACTS[Math.floor(Math.random() * FACTS.length)]}`),

  quote: msg =>
    msg.reply(`📜 **Thought of the day:**\n\"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}\"`),

  mathpuzzle: msg =>
    msg.reply(`🧩 **Try this puzzle:**\n${PUZZLES[Math.floor(Math.random() * PUZZLES.length)]}`)
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
  try {
    if (h) return h(msg, args);
    return msg.reply("❓ Unknown command. See !help.");
  } catch {
    return msg.reply("❌ An error occurred.");
  }
});

client.login(TOKEN);

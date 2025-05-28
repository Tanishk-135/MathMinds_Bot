// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleAuth } = require('google-auth-library');

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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

let readyAt = Date.now();

client.once('ready', () => {
  readyAt = Date.now();
  console.log(`Logged in as ${client.user.tag}`);
});

const formatUptime = ms => {
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d ${h}h ${m}m`;
};

// Handle AI prompt via Vertex AI
taskPrompt = async msg => {
  const prompt = msg.content.replace(/^<@!?(\d+)>/, '').trim();
  if (!prompt) return;

  try {
    const mathPrompt = `Answer the following math query concisely in one line as a math bot: ${prompt}`;
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/generative-language'] });
    const authClient = await auth.getClient();
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

    const res = await authClient.request({
      url,
      method: 'POST',
      data: {
        contents: [{ parts: [{ text: mathPrompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 30 }
      }
    });

    const reply = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ AI did not return a valid response.';
    msg.reply(reply);
  } catch (error) {
    console.error("Error calling Vertex AI:", error);
    msg.reply("⚠️ Failed to get a response from the AI. Check API key and project.");
  }
};

// Command Handlers
const handlers = {
  help: msg => msg.reply("Available commands: !help, !fact, !quote, !puzzle, !uptime"),
  fact: msg => msg.reply(FACTS[Math.floor(Math.random() * FACTS.length)]),
  quote: msg => msg.reply(QUOTES[Math.floor(Math.random() * QUOTES.length)]),
  puzzle: msg => msg.reply(PUZZLES[Math.floor(Math.random() * PUZZLES.length)]),
  uptime: msg => msg.reply(`🤖 Uptime: ${formatUptime(Date.now() - readyAt)}`)
};

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (Date.now() - readyAt < STARTUP_IGNORE) return;

  if (msg.mentions.has(client.user) && !msg.content.startsWith('!')) {
    return taskPrompt(msg);
  }

  if (!msg.content.startsWith('!')) return;
  const [cmd, ...args] = msg.content.slice(1).trim().split(/ +/);
  const h = handlers[cmd.toLowerCase()];
  try {
    if (h) return h(msg, args);
    msg.reply("❓ Unknown command. Try !help.");
  } catch (err) {
    console.error(`Command handler error for !${cmd}:`, err);
    msg.reply("⚠️ There was an error executing the command.");
  }
});

client.login(TOKEN);

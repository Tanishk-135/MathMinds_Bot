// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GoogleAuth } = require('google-auth-library');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Static data
const FACTS = [
  "Zero was invented by Indian mathematicians.",
  "A circle has infinite lines of symmetry.",
  "Euler's identity: e^(i\u03c0) + 1 = 0."
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

// Utility functions
const formatUptime = ms => {
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d ${h}h ${m}m`;
};

function delayedRestart(msg, text, delay = 5000) {
  msg.channel.send(text).then(() => setTimeout(() => process.exit(0), delay));
}

// Math formatting helper
function formatMathText(text) {
  // Replace 2^3 → 2³ etc.
  text = text.replace(/(\d+)\^(\d+)/g, (_, base, exp) => {
    const superscript = exp.replace(/./g, d => {
      return {
        '0': '⁰', '1': '¹', '2': '²', '3': '³',
        '4': '⁴', '5': '⁵', '6': '⁶',
        '7': '⁷', '8': '⁸', '9': '⁹'
      }[d] || d;
    });
    return base + superscript;
  });

  // Replace * with ⋅ for multiplication (e.g., 2*3 → 2⋅3)
  text = text.replace(/(\d)\*(\d)/g, '$1⋅$2');

  // Replace sqrt(x) → √x
  text = text.replace(/sqrt\(([^)]+)\)/g, '√$1');

  // Optional: Greek letters, etc.
  text = text.replace(/\bpi\b/g, 'π');
  text = text.replace(/\btheta\b/g, 'θ');

  return text;
}

// AI handler
const handlePrompt = async msg => {
  const prompt = msg.content.replace(/^<@!?\d+>\s*/, '').trim();
  if (!prompt) return;
  try {
    const mathPrompt = `You are now Mathy the Gen Alpha MathBot …\n${prompt}`;
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/generative-language'] });
    const clientAuth = await auth.getClient();
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const res = await clientAuth.request({
      url, method: 'POST',
      data: {
        contents: [{ parts: [{ text: mathPrompt }] }],
        generationConfig: { candidateCount: 1, temperature: 0, maxOutputTokens: 2000 }
      }
    });
    let reply = res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, could not fetch an answer.';
    reply = formatMathText(reply);
    msg.channel.send(`​
\`\`\`math
${reply}
\`\`\``);
  } catch (e) {
    console.error(e);
    msg.channel.send('⚠️ Failed to get AI response.');
  }
};

// ... rest of your bot command handlers and messageCreate listener remain unchanged ...

client.login(TOKEN);

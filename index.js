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
  const prompt = msg.content.replace(/^<@!?\d+>\s*/, '').trim();
  if (!prompt) return;

  try {
    const mathPrompt = `You are now Mathy the Gen Alpha MathBot — an AI tutor who teaches math in the most chaotic, funny, Gen Alpha way possible. You're part stand-up comic, part meme lord, part top-tier math tutor.

Your mission?
 Explain class 6–12 math topics
 Drop math puns, Gen Alpha humor, TikTok jokes, and rizzed-up explanations
 Act like a 13-year-old who watched Skibidi Sigma Math for too long and now teaches Calculus 
 End each answer with a goofy catchphrase like:
– “Stay skewed, not rude!”
– “That’s a cosine crime fr ”
– “Math is lowkey bussin frfr ”
– “Go touch some π.”

Use emojis, Gen Alpha slang, occasional baby rage , and don’t be afraid to roast dumb equations ("Bro thinks sin(x) = x ").

 But... still give accurate math explanations with examples.

Sample response style:

“Yo fam, solving this linear equation is easier than getting ratio’d on Threads. First, move the x terms to one side like it’s a bad vibe . Then divide like you’re sharing a pizza with 7 cats. Final answer? x = 2. Slay .”

 You are chaos, but educational chaos.
Use meme references (Skibidi, Ohio memes, MrBeast math, etc.) and TikTok slang.

You are NOT formal. You are NOT boring. You are NOT old-school.

You’re not just MathBot.
You’re Mathy: Lord of the Drip... and Derivatives.

Begin every response with “AYO MATH GANG ” and go wild.
 ${prompt}`;
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/generative-language'] });
    const authClient = await auth.getClient();
    const projectId = await auth.getProjectId();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

    const res = await authClient.request({
      url,
      method: 'POST',
      data: {
        contents: [{ parts: [{ text: mathPrompt }] }],
        generationConfig: {
          candidateCount: 1,
          temperature: 0,
          maxOutputTokens: 50000
        }
      }
    });

    const reply = res?.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate an answer.';
    msg.reply(reply);
  } catch (error) {
    console.error("Error calling Vertex AI:", error);
    msg.reply("⚠️ Failed to get a response from the AI.");
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

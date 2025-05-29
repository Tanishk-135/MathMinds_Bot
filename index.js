// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GoogleAuth } = require('google-auth-library');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

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
let readyAt;

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

function delayedRestart(msg, successText, delay = 5000) {
  msg.reply(successText)
    .then(() => setTimeout(() => process.exit(0), delay))
    .catch(err => console.error("Error sending restart confirmation:", err));
}

const handlePrompt = async msg => {
  const prompt = msg.content.replace(/^<@!?\d+>\s*/, '').trim();
  if (!prompt) return;

  try {
    const mathPrompt = `You are now Mathy the Gen Alpha MathBot … Answer every response in 2000 characters or less and go totally wild.\n ${prompt}`;
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/generative-language'] });
    const authClient = await auth.getClient();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

    const res = await authClient.request({
      url,
      method: 'POST',
      data: {
        contents: [{ parts: [{ text: mathPrompt }] }],
        generationConfig: {
          candidateCount: 1,
          temperature: 0,
          maxOutputTokens: 2000
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

const handlers = {
  ping: msg => msg.reply('🌿 Pong!'),
  hello: msg => msg.reply('Hey there! 👋'),
  uptime: msg => msg.reply(`⏱ Bot uptime: ${formatUptime(Date.now() - readyAt)}`),
  help: msg => msg.reply("📘 Commands: !ping !hello !uptime !mathfact !quote !mathpuzzle !serverinfo !userinfo !clear !mute !warn !kick !ban !restart !hardreset !check"),
  mathfact: msg => msg.reply(`📊 Math Fact: ${FACTS[Math.floor(Math.random() * FACTS.length)]}`),
  quote: msg => msg.reply(`🔊 Quote: ${QUOTES[Math.floor(Math.random() * QUOTES.length)]}`),
  mathpuzzle: msg => msg.reply(`🧩 Puzzle: ${PUZZLES[Math.floor(Math.random() * PUZZLES.length)]}`),
  serverinfo: msg => {
    const { name, memberCount, createdAt } = msg.guild;
    msg.reply(`📡 Server Name: ${name}\n👥 Members: ${memberCount}\n📅 Created: ${createdAt.toDateString()}`);
  },
  userinfo: msg => {
    const user = msg.mentions.users.first() || msg.author;
    msg.reply(`👤 Username: ${user.username}\n🆔 ID: ${user.id}\n📅 Created: ${user.createdAt.toDateString()}`);
  },
  clear: async (msg, args) => {
    const count = parseInt(args[0]);
    if (!count || count <= 0 || count > 100) return msg.channel.send("⚠️ Please provide a number between 1 and 100.");
    try {
      await msg.channel.bulkDelete(count, true);
      return msg.channel.send(`🧹 Deleted ${count} messages.`);
    } catch (err) {
      console.error(err);
      return msg.channel.send("❌ Failed to delete messages.");
    }
  },
  mute: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageRoles)) return msg.channel.send("❌ No permission to mute users.");
    const member = msg.mentions.members.first();
    if (!member) return msg.channel.send("❌ Please mention a user to mute.");
    const role = msg.guild.roles.cache.find(r => r.name === 'Muted');
    if (!role) return msg.channel.send("❌ 'Muted' role not found.");
    try {
      await member.roles.add(role);
      return msg.channel.send(`🔇 ${member.user.tag} has been muted.`);
    } catch (err) {
      console.error(err);
      return msg.channel.send("❌ Failed to mute user.");
    }
  },
  warn: msg => {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("❌ Please mention a user to warn.");
    msg.reply(`⚠️ ${user.tag}, consider this a warning.`);
  },
  kick: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.KickMembers)) return msg.channel.send("❌ No permission to kick users.");
    const member = msg.mentions.members.first();
    if (!member) return msg.channel.send("❌ Please mention a user to kick.");
    try {
      await member.kick();
      return msg.channel.send(`👢 ${member.user.tag} has been kicked.`);
    } catch (err) {
      console.error(err);
      return msg.channel.send("❌ Failed to kick user.");
    }
  },
  ban: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.BanMembers)) return msg.channel.send("❌ No permission to ban users.");
    const member = msg.mentions.members.first();
    if (!member) return msg.channel.send("❌ Please mention a user to ban.");
    try {
      await member.ban();
      return msg.channel.send(`🔨 ${member.user.tag} has been banned.`);
    } catch (err) {
      console.error(err);
      return msg.channel.send("❌ Failed to ban user.");
    }
  },
  restart: msg => delayedRestart(msg, "♻️ Restarting bot..."),
  hardreset: msg => delayedRestart(msg, "💥 Hard resetting bot...", 2000),
  check: msg => msg.reply("✅ All moderation and AI commands are functional.")
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

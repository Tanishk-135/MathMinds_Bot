// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
// Removed the OpenAI require, as we're using Hugging Face now.
// const OpenAI = require('openai');
const util = require('util');
const { exec } = require('child_process');
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
const STARTUP_IGNORE = 1000;  // ms

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

// Removed OpenAI instantiation; using Hugging Face now.

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

// Utility function to send a confirmation message and then exit after a delay.
// Used in the !restart and !hardreset commands.
function delayedRestart(msg, successText, delay = 5000) {
  msg.reply(successText)
    .then(() => {
      setTimeout(() => {
        process.exit(0);
      }, delay);
    })
    .catch(err => console.error("Error sending restart confirmation:", err));
}

// UPDATED handlePrompt: now passes the math prompt as a plain string.
// This instructs the model to answer math queries concisely in one line.
const handlePrompt = async msg => {
  const prompt = msg.content.replace(/^<@!?\d+>/, '').trim();
  if (!prompt) return;
  try {
    // Prepend an instruction for a math bot response.
    const mathPrompt = "Answer the following math query concisely in one line as a math bot: " + prompt;
    const model_id = "mistralai/Mistral-7B-Instruct-v0.3";
    const hfApiKey = process.env.HF_API_KEY; // Optional: set your Hugging Face API key here.
    const response = await fetch(`https://api-inference.huggingface.co/models/${model_id}`, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         ...(hfApiKey ? { Authorization: `Bearer ${hfApiKey}` } : {})
      },
      // Pass the math prompt as a plain string.
      body: JSON.stringify({
        inputs: mathPrompt,
        parameters: {
          max_new_tokens: 30,    // Limit to a short answer
          temperature: 0.0,      // Deterministic reply
          do_sample: false
        }
      })
    });
    if (!response.ok) {
      console.error(`Hugging Face API error: ${response.statusText}`);
      return msg.reply("❌ Error fetching response.");
    }
    const result = await response.json();
    // Expect the model to return an array with an object having "generated_text".
    const reply = result && Array.isArray(result) && result[0]?.generated_text;
    if (!reply) return msg.reply("❌ I couldn't think of a reply.");
    // Return only the first line of the response.
    const oneLineReply = reply.split('\n')[0];
    return msg.reply(oneLineReply);
  } catch (e) {
    console.error("Hugging Face API error:", e);
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
      (isOwner ? "• Mod: clear, mute, warn, kick, ban\n" : "") +
      (isOwner ? "• Admin: restart, hardreset" : "")
    );
  },

  hello: msg => msg.reply("Hello!"),
  ping: msg => msg.reply(`Pong! ${Date.now() - msg.createdTimestamp}ms`),
  uptime: msg => msg.reply(`Uptime: ${formatUptime(Date.now() - readyAt)}`),

  mathfact: msg =>
    msg.reply(`🧮 **Did you know?**\n${FACTS[Math.floor(Math.random() * FACTS.length)]}`),

  quote: msg =>
    msg.reply(`📜 **Thought of the day:**\n"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}"`),

  mathpuzzle: msg =>
    msg.reply(`🧩 **Try this puzzle:**\n${PUZZLES[Math.floor(Math.random() * PUZZLES.length)]}`),

  // Added clear command – requires ManageMessages permission.
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
      return msg.reply(`🗑️ Deleted ${amount} messages.`);
    } catch (e) {
      console.error("Error clearing messages:", e);
      return msg.reply("❌ An error occurred while trying to delete messages.");
    }
  },

  // New restart command – only available to the server owner.
  restart: async msg => {
    if (msg.guild && msg.author.id !== msg.guild.ownerId) {
      return msg.reply("❌ You don't have permission to restart the bot.");
    }
    await msg.reply("🔄 Restarting the bot, please wait...");
    delayedRestart(msg, "✅ Restart completed!");
  },

  // New hardreset command – performs a git pull then restarts (admin only).
  hardreset: async msg => {
    if (msg.guild && msg.author.id !== msg.guild.ownerId) {
      return msg.reply("❌ You don't have permission to hard reset the bot.");
    }
    await msg.reply("🔄 Hard reset in progress, please wait...");
    try {
      const { stdout, stderr } = await execPromise("git pull");
      if (stderr) {
        await msg.reply(`⚠️ Warning during git pull:\n\`\`\`${stderr}\`\`\``);
      }
      delayedRestart(msg, `✅ Hard reset completed!\n\`\`\`${stdout}\`\`\``);
    } catch (e) {
      console.error("Error during hardreset:", e);
      return msg.reply(`❌ Error during hard reset: \`${e.message}\``);
    }
  }
};

client.on('messageCreate', async msg => {
  // Early exits: ignore bot messages and commands during the startup ignore window.
  if (msg.author.bot) return;
  if (Date.now() - (readyAt || 0) < STARTUP_IGNORE) return;

  // If the message mentions the bot and does not start with '!', treat it as an AI prompt.
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

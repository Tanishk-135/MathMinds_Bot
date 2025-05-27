// -------------------------
// Module & Variable Setup
// -------------------------
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField
} = require('discord.js');
const express = require('express');
const cron = require('node-cron'); // (optional: used by daily summary)
const https = require('https');
const http = require('http');
const crypto = require('crypto'); // To verify webhook signature
const { exec } = require('child_process'); // To run shell commands
require('dotenv').config();

console.log("NEW CODE IMPLEMENTED at " + new Date().toISOString());

const BOT_OWNER_ID = "922909884121505792"; // Your Discord ID
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "your_default_secret_here"; // Set a proper secret in .env

// -------------------------
// Create Discord Client
// -------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// -------------------------
// Express Web Server Setup
// -------------------------
const app = express();

// Parse JSON payloads (required for webhook processing)
app.use(express.json({ limit: '5mb' }));

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.get("/status", (req, res) => {
  res.json({
    status: "Bot is running!",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    guilds: client.guilds?.cache?.size || 0
  });
});

// -------------------------
// GitHub Webhook Endpoint for Auto-Deploy
// -------------------------
// Middleware to verify GitHub webhook signature
function verifyGitHubSignature(req, res, next) {
  const sigHeaderName = 'x-hub-signature-256';
  const signature = req.get(sigHeaderName) || '';

  // Use the JSON string of the parsed body to compute the digest.
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');

  if (signature !== digest) {
    console.error("GitHub webhook signature mismatch!");
    return res.status(401).send('Signature mismatch');
  }
  next();
}

app.post('/github-deploy', verifyGitHubSignature, (req, res) => {
  console.log('Received GitHub webhook. Pulling latest code and restarting bot...');
  exec('git pull && pm2 restart mathminds-bot', (error, stdout, stderr) => {
    if (error) {
      console.error(`Deployment error: ${error}`);
      return res.status(500).send(`Error: ${error}`);
    }
    console.log(`Deployment output: ${stdout}`);
    res.status(200).send('Deployment successful');
  });
});

// Start Express server
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Express server is running on port ${PORT}`)
);

// -------------------------
// Discord Bot Code
// -------------------------
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// ----- Added DM & Join Log Features from Old Code -----

// Global array for daily summary of new joiners (optional)
let dailyJoiners = [];

// Math-themed DM questions array
const dmQuestions = [
  "**What's your favorite branch of mathematics?**",
  "**Do you prefer algebra or geometry?**",
  "**What's the most interesting math problem you've ever solved?**",
  "**What inspired you to join MathMinds United?**",
  "**Would you rather dive into calculus or explore statistics?**",
  "**Who is your favorite mathematician or which mathematical concept fascinates you?**",
  "**Are you more into pure math, applied math, or a mix of both?**",
  "**Do you enjoy math competitions or collaborative problem-solving?**",
  "**What's a math myth or puzzle that always got you thinking?**",
  "**Which area of math do you find most challenging (yet rewarding)?**"
];

// Set to track recent joins to prevent duplicate processing
const recentJoins = new Set();

client.on('guildMemberAdd', async (member) => {
  // Prevent duplicate processing within a short window.
  if (recentJoins.has(member.id)) return;
  recentJoins.add(member.id);
  setTimeout(() => recentJoins.delete(member.id), 10000); // Remove after 10 seconds

  // If the member is partial, fetch their full data.
  if (member.partial) {
    try {
      await member.fetch();
    } catch (error) {
      console.error("Error fetching member:", error);
      return;
    }
  }

  // Select a random math-themed question for the DM.
  const randomQuestion = dmQuestions[Math.floor(Math.random() * dmQuestions.length)];

  // Construct the welcome DM message.
  const dmMessage = `
Hello ${member.displayName},

✨ **Welcome to MathMinds United!** ✨

A math puzzle to get you thinking:
> ${randomQuestion}

We're excited to have you join our community of math enthusiasts!
Please introduce yourself in **🙋│introductions** and let the math conversation begin!

🔢 **Happy Problem-Solving!**
The MathMinds Team
  `.trim();

  // Attempt to send a private DM.
  try {
    await member.send(dmMessage);
  } catch (err) {
    console.error(`Could not DM ${member.user.tag}. They may have DMs disabled.`);
  }

  // Format the current time to IST in dd/MM/yyyy format.
  const now = new Date();
  const formattedTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(now);

  // Log the join event in the join-log channel (channel name must be "🔒│join-log")
  const joinLogChannel = member.guild.channels.cache.find(ch => ch.name === '🔒│join-log');
  if (joinLogChannel) {
    joinLogChannel.send(`**<@${member.id}>** joined on ${formattedTime}`);
  } else {
    console.error("Join log channel not found.");
  }

  // Add the new member to the daily summary list (optional)
  dailyJoiners.push(member.toString());
});

// Daily summary cron job (optional)
// This sends a summary of new joiners to a "welcome" channel at midnight IST.
cron.schedule('0 0 * * *', () => {
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error("Bot is not part of any guild.");
    return;
  }
  const welcomeChannel = guild.channels.cache.find(ch => ch.name === 'welcome');
  if (welcomeChannel) {
    if (dailyJoiners.length > 0) {
      welcomeChannel.send(`Welcome our new math enthusiasts:\n${dailyJoiners.join('\n')}`);
      dailyJoiners = []; // Clear the summary list
    } else {
      welcomeChannel.send("No new members joined in the last 24 hours.");
    }
  } else {
    console.error("Welcome channel not found.");
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

// ----- End of DM & Join Log Features -----


// -------------------------
// Command Handler
// -------------------------
client.on("messageCreate", (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Log the raw message content as received
  console.log(`RAW message received: "${message.content}" from ${message.author.id}`);

  // Convert the incoming message to a trimmed, lower-case command string
  const command = message.content.trim().toLowerCase();
  console.log(`Processed command: "${command}"`);

  // !hello Command: Simple test environment
  if (command === "!hello") {
    console.log("Processing !hello command...");
    message.reply("Hey there! MathMinds Bot is online and ready to solve some math problems. 🚀");
  }

  // Temporary test command to ensure restart code can be reached
  if (command === "!testrestart") {
    console.log("Test restart command received.");
    message.reply("Test restart works! (This is just a test, not restarting.)");
  }

  // !restart Command using startsWith to catch extra characters
  if (command.startsWith("!restart")) {
    console.log(`Restart command detected from ${message.author.tag} (ID: ${message.author.id}).`);
    console.log(`Full command received: "${command}"`);

    // Check if the user is the bot owner
    if (message.author.id !== BOT_OWNER_ID) {
      console.log(`Unauthorized restart attempt. Expected BOT_OWNER_ID: ${BOT_OWNER_ID}, but received: ${message.author.id}`);
      return message.reply(`🚫 Only the bot owner can restart me! Your ID: ${message.author.id}`);
    }

    // Proceed with restart
    message.reply("Restarting bot now...").then(() => {
      console.log("Bot is restarting now...");
      // Delay to ensure reply and logs are flushed, then kill the process.
      setTimeout(() => {
        console.log("Exiting process now...");
        process.kill(process.pid, 'SIGTERM');
      }, 500);
    });
  }

  // -------------------------
  // New: Kick Command Block
  // -------------------------
  if (command.startsWith("!kick")) {
    console.log(`Kick command detected from ${message.author.tag} (ID: ${message.author.id}).`);

    // This command can only be used in a guild (server)
    if (!message.guild) {
      return message.reply("This command can only be used in a server.");
    }

    // Check if the issuer has permission to kick members
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply("You don't have permission to kick members.");
    }

    // Get the member to kick (first mentioned member)
    const memberToKick = message.mentions.members.first();
    if (!memberToKick) {
      return message.reply("Please mention the member you want to kick. Usage: `!kick @user [reason]`");
    }

    // Extract reason if provided; if not, use default
    const args = message.content.split(" ").slice(2).join(" ");
    const kickReason = args || "No reason provided.";

    // Attempt to kick the member
    memberToKick.kick(kickReason)
      .then(() => {
        message.reply(`Successfully kicked ${memberToKick.user.tag}. Reason: ${kickReason}`);
        console.log(`Kicked member ${memberToKick.user.tag} successfully. Reason: ${kickReason}`);
      })
      .catch(error => {
        console.error(`Error kicking member: ${error}`);
        message.reply("An error occurred while trying to kick that member.");
      });
  }

  // -------------------------
  // New: Ban Command Block
  // -------------------------
  if (command.startsWith("!ban")) {
    console.log(`Ban command detected from ${message.author.tag} (ID: ${message.author.id}).`);

    // This command can only be used in a guild (server)
    if (!message.guild) {
      return message.reply("This command can only be used in a server.");
    }

    // Check if the issuer has permission to ban members
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply("You don't have permission to ban members.");
    }

    // Get the member to ban (first mentioned member)
    const memberToBan = message.mentions.members.first();
    if (!memberToBan) {
      return message.reply("Please mention the member you want to ban. Usage: `!ban @user [reason]`");
    }

    // Extract reason if provided; if not, use default
    const args = message.content.split(" ").slice(2).join(" ");
    const banReason = args || "No reason provided.";

    // Attempt to ban the member
    memberToBan.ban({ reason: banReason })
      .then(() => {
        message.reply(`Successfully banned ${memberToBan.user.tag}. Reason: ${banReason}`);
        console.log(`Banned member ${memberToBan.user.tag} successfully. Reason: ${banReason}`);
      })
      .catch(error => {
        console.error(`Error banning member: ${error}`);
        message.reply("An error occurred while trying to ban that member.");
      });
  }
});

// Log in using the bot token from your .env file
client.login(process.env.DISCORD_BOT_TOKEN);

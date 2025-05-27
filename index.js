// -------------------------
// Module & Variable Setup
// -------------------------
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const cron = require('node-cron');
const https = require('https');
const http = require('http');

// Define PORT before using it
const PORT = process.env.PORT || 3000;

// Create Discord client (so it's available for Express routes)
// Added GuildMessages and MessageContent intent to handle commands (e.g., !hello)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,     // For tracking member joins
    GatewayIntentBits.GuildMessages,      // For reading messages in guild channels
    GatewayIntentBits.MessageContent      // For accessing message content
  ],
  partials: [Partials.Channel]
});

// -------------------------
// Express Web Server Setup
// -------------------------
const app = express();

// Basic route: a minimal response keeps the project awake
app.get("/", (req, res) => {
  res.send("Bot is running!");
});

// Status endpoint for external monitoring
app.get("/status", (req, res) => {
  res.json({
    status: "Bot is running!",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    // Use client.guilds.cache.size if client is ready; else fallback to 0.
    guilds: client.guilds?.cache?.size || 0
  });
});

// Self-ping to help keep the process alive every 1 minute using your project URL
setInterval(() => {
  const pingUrl = "https://c7606af7-f86e-42d7-9905-984b529d3b98-00-30gexhv2593qs.pike.replit.dev/status";

  https.get(pingUrl).on('error', (err) => {
    console.error(`Keep-alive ping failed: ${err.message}`);
  });

}, 60 * 1000); // Ping every 1 minute

// Start Express server
app.listen(PORT, '0.0.0.0', () => console.log(`Express server is running on port ${PORT}`));

// -------------------------
// Discord Bot Code
// -------------------------

// Global array to store new joiners for the daily summary
let dailyJoiners = [];

// Array containing 10 math-themed DM questions
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

// Temporary Set to store IDs of recently processed members (prevents duplicates)
const recentJoins = new Set();

// Bot startup confirmation
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Event: When a new member joins
client.on('guildMemberAdd', async (member) => {
  // Prevent duplicate processing
  if (recentJoins.has(member.id)) return;
  recentJoins.add(member.id);
  setTimeout(() => recentJoins.delete(member.id), 10000); // 10-second window

  // Fetch the full member if needed
  if (member.partial) {
    try {
      await member.fetch();
    } catch (error) {
      console.error('Error fetching member:', error);
      return;
    }
  }

  // Select a random math-themed question from the array
  const randomQuestion = dmQuestions[Math.floor(Math.random() * dmQuestions.length)];

  // Build a nicely formatted DM message
  const dmMessage = `
Hello ${member.displayName},

✨ **Welcome to MathMinds United!** ✨

A math puzzle to get you thinking:
> ${randomQuestion}

We're excited to have you join our community of math enthusiasts!
Kindly introduce yourself in **🙋│introductions**, and let's talk math!

🔢 **Happy Problem-Solving!**
The MathMinds Team
  `.trim();

  try {
    await member.send(dmMessage);
  } catch (err) {
    console.error(`Could not DM ${member.user.tag}. They may have DMs disabled.`);
  }

  // Format the current time in IST with day-month-year first format (dd/MM/yyyy)
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

  // Log the join event in the designated join-log channel
  const joinLogChannel = member.guild.channels.cache.find(ch => ch.name === '🔒│join-log');
  if (joinLogChannel) {
    joinLogChannel.send(`**<@${member.id}>** joined on ${formattedTime}`);
  } else {
    console.error("Join log channel not found.");
  }

  // Add the new member to the daily summary list
  dailyJoiners.push(member.toString());
});

// Cron job: Sends a daily welcome summary at midnight IST
cron.schedule('0 0 * * *', () => {
  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error("Bot is not part of any guild.");
    return;
  }

  // Find the summary channel (named 'welcome')
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

// Command: !hello
client.on("messageCreate", (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Check for the command "!hello"
  if (message.content.toLowerCase() === "!hello") {
    message.reply("Hey there! MathMinds Bot is online and ready to solve some math problems. 🚀");
  }
});

// Log in using your bot's token (stored as an environment variable)
client.login(process.env.DISCORD_BOT_TOKEN);
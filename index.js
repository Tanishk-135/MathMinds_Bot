// -------------------------
// Module & Variable Setup
// -------------------------
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const cron = require('node-cron');
const https = require('https');
const http = require('http');
require('dotenv').config();

console.log("NEW CODE IMPLEMENTED at " + new Date().toISOString());

const BOT_OWNER_ID = "922909884121505792"; // Your Discord ID

// Define PORT before using it
const PORT = process.env.PORT || 3000;

// Create Discord client
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

setInterval(() => {
  const pingUrl = "https://your-replit-status-url/status";
  https.get(pingUrl).on('error', (err) => {
    console.error(`Keep-alive ping failed: ${err.message}`);
  });
}, 60 * 1000);

app.listen(PORT, '0.0.0.0', () =>
  console.log(`Express server is running on port ${PORT}`)
);

// -------------------------
// Discord Bot Code
// -------------------------

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Command Handler
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
});

// Log in using the bot token from your .env file
client.login(process.env.DISCORD_BOT_TOKEN);

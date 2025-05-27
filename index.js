// -------------------------
// Module & Variable Setup
// -------------------------
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');
const cron = require('node-cron');
const https = require('https');
const http = require('http');
require('dotenv').config();

const BOT_OWNER_ID = "922909884121505792"; // Replace with your Discord ID

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

app.listen(PORT, '0.0.0.0', () => console.log(`Express server is running on port ${PORT}`));

// -------------------------
// Discord Bot Code
// -------------------------

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Command Handler
client.on("messageCreate", (message) => {
  console.log(`Received message: "${message.content}" from ${message.author.id}`);
  if (message.author.bot) return;

  if (message.content.toLowerCase() === "!hello") {
    message.reply("Hey there! MathMinds Bot is online and ready to solve some math problems. 🚀");
  }
  
// Restart
  if (message.content.toLowerCase() === "!restart") {
      if (message.author.id !== BOT_OWNER_ID) {
          return message.reply(`🚫 Only the bot owner can restart me! Your ID: ${message.author.id}`);
      }
  
      message.reply("Restarting bot...").then(() => {
          console.log("Restarting bot now...");
          process.exit(1);
      });
  }
});

// Log in using the bot token
client.login(process.env.DISCORD_BOT_TOKEN);

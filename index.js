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
const cron = require('node-cron'); // (unused now but kept for possible future use)
const https = require('https');
const http = require('http');
const crypto = require('crypto');           // To verify webhook signature
const { exec } = require('child_process');  // To run shell commands
require('dotenv').config();

console.log("NEW CODE IMPLEMENTED at " + new Date().toISOString());

const BOT_OWNER_ID = "922909884121505792"; // Your Discord ID
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "your_default_secret_here"; // Set a proper secret in .env

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

// Use express.json() to parse JSON payloads (required for webhook)
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

// Middleware that verifies GitHub webhook signature
function verifyGitHubSignature(req, res, next) {
  const sigHeaderName = 'x-hub-signature-256';
  const signature = req.get(sigHeaderName) || '';
  
  // Compute HMAC digest using the webhook secret and the raw body
  // Note: Since we use express.json(), the raw body isn’t stored by default.
  // For simplicity, we’ll use the JSON string of the parsed body.
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

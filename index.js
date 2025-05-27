// -------------------------
// Module & Variable Setup
// -------------------------
const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  PermissionsBitField,
  ChannelType
} = require('discord.js');
const express = require('express');
const cron = require('node-cron'); // (unused now but kept for possible future use)
const https = require('https');
const http = require('http');
const crypto = require('crypto');           // To verify webhook signature
const { exec } = require('child_process');  // To run shell commands
const axios = require('axios');             // For AI API integration
require('dotenv').config();

console.log("NEW CODE IMPLEMENTED at " + new Date().toISOString());

const BOT_OWNER_ID = "922909884121505792"; // Your Discord ID
const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "your_default_secret_here"; // Set a proper secret in .env
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Your OpenAI API key for AI-generated responses

// New: Added for persistent daily summary storage
const fs = require('fs'); 
const DAILY_JOINERS_FILE = './dailyJoiners.json';

// -------------------------
// Create Discord client
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

// Modified to capture raw body for proper webhook signature verification
app.use(express.json({ 
  limit: '5mb',
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf;
  }
}));

// New: Middleware to set a request timeout warning for long requests
app.use((req, res, next) => {
  res.setTimeout(15000, () => { console.warn("Request taking too long!"); });
  next();
});

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
  
  // Compute HMAC digest using the webhook secret and the rawBody (instead of JSON.stringify(req.body))
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
  
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

// -------------------------
// Persistent Storage for daily joiners
// -------------------------
let dailyJoiners = [];
// Load persistent daily joiners if file exists
try {
  if (fs.existsSync(DAILY_JOINERS_FILE)) {
    dailyJoiners = JSON.parse(fs.readFileSync(DAILY_JOINERS_FILE, 'utf-8'));
  }
} catch (err) {
  console.error("Error loading persistent daily joiners: " + err);
}

// -------------------------
// DM & Join Log Features
// -------------------------

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
Please introduce yourself in **🙋│introductions**, and let's talk math!

🔢 **Happy Problem-Solving!**
The MathMinds Team
  `.trim();

  try {
    await member.send(dmMessage);
  } catch (err) {
    // Changed to warn so as not to overwhelm error logs if DMs are disabled.
    console.warn(`Could not DM ${member.user.tag}. They may have DMs disabled.`);
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

  // Log the join event in the designated join-log channel (channel name must be "🔒│join-log")
  const joinLogChannel = member.guild.channels.cache.find(ch => ch.name === '🔒│join-log');
  if (joinLogChannel) {
    joinLogChannel.send(`**<@${member.id}>** joined on ${formattedTime}`);
  } else {
    console.error("Join log channel not found.");
  }

  // Add the new member to the daily summary list (with persistent storage)
  dailyJoiners.push(member.toString());
  try {
    fs.writeFileSync(DAILY_JOINERS_FILE, JSON.stringify(dailyJoiners, null, 2));
  } catch (err) {
    console.error("Error writing daily joiners to file: " + err);
  }
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
      // Reset the persistent daily joiners file after sending the summary
      dailyJoiners = [];
      try {
        fs.writeFileSync(DAILY_JOINERS_FILE, JSON.stringify(dailyJoiners, null, 2));
      } catch (err) {
        console.error("Error clearing daily joiners file: " + err);
      }
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

// -------------------------
// Command Handler
// -------------------------
client.on("messageCreate", async (message) => {
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

  // -------------------------
  // New: Help Command
  // -------------------------
  if (command === "!help") {
    const helpMessage = `
**MathMinds Bot Commands:**
\`!hello\` - Greet the bot.
\`!ping\` - Check the bot's latency.
\`!mathfact\` - Get an interesting mathematical fact.
\`!quote\` - Receive a famous mathematical quote.
\`!mathpuzzle\` - Get a challenging math puzzle.
\`!serverinfo\` - Display info about this server.
\`!userinfo\` - Show your user information.
\`!uptime\` - Check how long the bot has been running.
\`!clear [number]\` - Delete a specified number of messages.
\`!mute @user [duration in minutes]\` - Temporarily mute a user (requires a mute role).
\`!warn @user [reason]\` - Issue a warning to a user.
(Plus existing moderation commands: \`!kick\`, \`!ban\`, \`!restart\`)
    `;
    message.reply(helpMessage);
  }

  // -------------------------
  // New: Ping Command
  // -------------------------
  if (command === "!ping") {
    const latency = Date.now() - message.createdTimestamp;
    message.reply(`Pong! Latency is ${latency}ms.`);
  }

  // -------------------------
  // New: AI-Powered Math Fact Command
  // -------------------------
  if (command === "!mathfact") {
    const prompt = "Tell me an interesting mathematical fact.";
    const fact = await getAIResponse(prompt);
    message.reply(fact);
  }

  // -------------------------
  // New: AI-Powered Quote Command
  // -------------------------
  if (command === "!quote") {
    const prompt = "Give me a famous quote related to mathematics.";
    const quote = await getAIResponse(prompt);
    message.reply(quote);
  }

  // -------------------------
  // New: AI-Powered Math Puzzle Command
  // -------------------------
  if (command === "!mathpuzzle") {
    const prompt = "Give me a challenging but fun math puzzle.";
    const puzzle = await getAIResponse(prompt);
    message.reply(puzzle);
  }

  // -------------------------
  // New: Server Info Command
  // -------------------------
  if (command === "!serverinfo") {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const { name, memberCount, createdAt } = message.guild;
    message.reply(`Server Name: ${name}\nMembers: ${memberCount}\nCreated At: ${createdAt}`);
  }

  // -------------------------
  // New: User Info Command
  // -------------------------
  if (command === "!userinfo") {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const member = message.member;
    message.reply(`Your Username: ${member.user.tag}\nJoined: ${member.joinedAt}\nID: ${member.id}`);
  }

  // -------------------------
  // New: Uptime Command
  // -------------------------
  if (command === "!uptime") {
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    message.reply(`Uptime: ${hours}h ${minutes}m ${seconds}s`);
  }

  // -------------------------
  // New: Clear Command
  // -------------------------
  if (command.startsWith("!clear")) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    const args = message.content.split(" ").slice(1);
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1) return message.reply("Please specify a valid number of messages to delete.");
    
    // Fetch messages with limit (amount + 1 to include the command message)
    message.channel.messages.fetch({ limit: amount + 1 })
      .then(fetched => {
          // Filter out messages older than 14 days, as Discord won't delete those
          const deletable = fetched.filter(m => (Date.now() - m.createdTimestamp) < 14 * 24 * 60 * 60 * 1000);
          if (deletable.size === 0) return message.reply("No messages eligible for deletion.");
          message.channel.bulkDelete(deletable, true)
            .then(deleted => {
                message.channel.send(`Deleted ${deleted.size} message(s).`)
                  .then(msg => setTimeout(() => msg.delete(), 5000));
            })
            .catch(err => {
                console.error(err);
                message.reply("An error occurred while trying to delete messages.");
            });
      })
      .catch(console.error);
  }

  // -------------------------
  // New: Timed Mute Command (Now supports duration)
  // -------------------------
  if (command.startsWith("!mute")) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("You don't have permission to mute members.");
    }
    
    const args = message.content.split(" ").slice(1);
    const memberToMute = message.mentions.members.first();
    if (!memberToMute) return message.reply("Please mention the member to mute.");
    
    // The duration should be provided as the second argument (in minutes)
    const duration = parseInt(args[1]);
    if (isNaN(duration) || duration < 1) return message.reply("Please provide a valid duration in minutes.");
    
    let muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === "muted");
    // If role doesn't exist, create it
    if (!muteRole) {
      try {
        muteRole = await message.guild.roles.create({
          name: "Muted",
          permissions: []
        });
      } catch (err) {
        console.error("Error creating Muted role: " + err);
        return message.reply("Failed to create Muted role.");
      }
    }
    
    // Update permission overwrites for all channels for the Muted role
    message.guild.channels.cache.forEach(async (channel) => {
      try {
        await channel.permissionOverwrites.edit(muteRole, {
          SEND_MESSAGES: false,
          ADD_REACTIONS: false,
          SPEAK: false,
          VIEW_CHANNEL: true,
          CREATE_INSTANT_INVITE: true,
          READ_MESSAGE_HISTORY: true
        });
      } catch (error) {
        console.error(`Error updating permissions for channel ${channel.id}:`, error);
      }
    });
    
    // Add the mute role to the member
    memberToMute.roles.add(muteRole)
      .then(() => {
        message.reply(`${memberToMute.user.tag} has been muted for ${duration} minute(s).`);
        // Schedule unmuting after the specified duration
        setTimeout(() => {
          memberToMute.roles.remove(muteRole)
            .then(() => message.channel.send(`${memberToMute.user.tag} has been unmuted after ${duration} minute(s).`))
            .catch(console.error);
        }, duration * 60 * 1000); // Convert minutes to milliseconds
      })
      .catch(err => {
        console.error(err);
        message.reply("Failed to mute the member.");
      });
  }

  // -------------------------
  // New: Warn Command
  // -------------------------
  if (command.startsWith("!warn")) {
    if (!message.guild) return message.reply("This command can only be used in a server.");
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You don't have permission to warn members.");
    }
    const memberToWarn = message.mentions.members.first();
    if (!memberToWarn) return message.reply("Please mention the member to warn.");
    const args = message.content.split(" ").slice(2).join(" ");
    const warnReason = args || "No reason provided.";
    message.reply(`${memberToWarn.user.tag} has been warned. Reason: ${warnReason}`);
    console.log(`Warned ${memberToWarn.user.tag}: ${warnReason}`);
  }
});

// -------------------------
// AI Integration Function
// -------------------------
async function getAIResponse(prompt) {
  try {
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
      model: "gpt-4",
      messages: [
        { role: "user", content: prompt }
      ]
    }, {
      headers: { 
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }
    });
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Error fetching AI response:", error);
    return "Sorry, I couldn't fetch a response.";
  }
}

// -------------------------
// Bot Login
// -------------------------
client.login(process.env.DISCORD_BOT_TOKEN);

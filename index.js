// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, MessageEmbed, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');

// Use environment variables for sensitive data (BOT_TOKEN is required)
const config = {
  token: process.env.BOT_TOKEN,
  ownerID: process.env.OWNER_ID  // (Optional: not used here, because we check against message.guild.ownerId)
};

// Create a new Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent  // Needed to read message content
  ]
});

// Define the command prefix
const prefix = "!";

// Global variable to record bot startup time for a cooldown
let startupTime = Date.now();

client.once('ready', () => {
  startupTime = Date.now();
  console.log(`Logged in as ${client.user.tag}!`);
});

// Utility function to send a confirmation message and then exit after a delay.
// This function is used by both !restart and !hardreset.
function delayedRestart(message, successText, delay = 5000) {
  message.reply(successText)
    .then(() => {
      setTimeout(() => {
        process.exit(0);  // Let PM2 restart the bot.
      }, delay);
    })
    .catch(err => console.error("Error sending restart confirmation:", err));
}

// Helper function: Convert minutes (as string) to milliseconds.
function parseTime(timeStr) {
  const minutes = parseInt(timeStr);
  return isNaN(minutes) ? null : minutes * 60 * 1000;
}

// Main command handler. We add a startup cooldown to ignore commands during the first 5 seconds after startup.
client.on('messageCreate', async (message) => {
  // Ignore messages from bots.
  if (message.author.bot) return;
  // Ignore any commands received within the first 5 seconds after startup.
  if (Date.now() - startupTime < 5000) return;
  // Process only messages that start with the prefix.
  if (!message.content.startsWith(prefix)) return;

  // Split the incoming message into command and arguments.
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    // ===========================
    // !help Command - Display available commands with improved formatting.
    // ===========================
    if (command === 'help') {
      return message.reply(
        "**Available Commands:**\n\n" +
        "**Utility:**\n" +
        " - !ping\n" +
        " - !hello\n" +
        " - !uptime\n\n" +
        "**Math & Fun:**\n" +
        " - !mathfact\n" +
        " - !quote\n" +
        " - !mathpuzzle\n\n" +
        "**Info:**\n" +
        " - !serverinfo\n" +
        " - !userinfo\n\n" +
        "**Moderation:**\n" +
        " - !clear\n" +
        " - !mute\n" +
        " - !warn\n" +
        " - !kick\n" +
        " - !ban"
      );
    }

    // ===========================
    // !hardreset Command (Restricted to the Server Owner)
    // ===========================
    if (command === 'hardreset') {
      if (message.author.id !== message.guild.ownerId) {
        return message.reply("❌ You don't have permission to hard reset the bot.");
      }
      // Inform the user that the hard reset has started.
      await message.reply("🔄 Hard reset in progress, please wait...");
      try {
        // First, perform a 'git pull' to update your code.
        const { stdout, stderr } = await execPromise("git pull");
        if (stderr) {
          await message.reply(`⚠️ Warning during git pull:\n\`\`\`${stderr}\`\`\``);
        }
        // Use the delayedRestart function to send confirmation and delay exit.
        delayedRestart(message, `✅ Hard reset completed!\n\`\`\`${stdout}\`\`\``);
      } catch (err) {
        console.error("Error during !hardreset:", err);
        return message.reply(`❌ Error during hard reset: \`${err.message}\``);
      }
      return;
    }

    // ===========================
    // !restart Command (Restricted to the Server Owner)
    // ===========================
    if (command === 'restart') {
      if (message.author.id !== message.guild.ownerId) {
        return message.reply("❌ You don't have permission to restart the bot.");
      }
      await message.reply("🔄 Restarting the bot, please wait...");
      try {
        // Send final confirmation before exiting.
        delayedRestart(message, "✅ Restart completed!");
      } catch (err) {
        console.error("Error during !restart:", err);
        return message.reply(`❌ Error during restart: \`${err.message}\``);
      }
      return;
    }

    // ===========================
    // !hello Command - Greets the bot.
    // ===========================
    if (command === 'hello') {
      return message.reply("Hello! How can I assist you today?");
    }

    // ===========================
    // !ping Command - Checks the bot's latency.
    // ===========================
    if (command === 'ping') {
      const sent = await message.reply("Pinging...");
      const latency = sent.createdTimestamp - message.createdTimestamp;
      return sent.edit(`Pong! Latency is ${latency}ms.`);
    }

    // ===========================
    // !uptime Command - Displays how long the bot has been running.
    // ===========================
    if (command === 'uptime') {
      const uptime = process.uptime();
      const minutes = Math.floor(uptime / 60);
      return message.reply(`🕒 Bot has been running for **${minutes} minutes**.`);
    }

    // ===========================
    // !mathfact Command - Provides an interesting mathematical fact.
    // ===========================
    if (command === 'mathfact') {
      const facts = [
        "The number zero was invented by Indian mathematicians.",
        "A circle has infinite lines of symmetry.",
        "Euler's identity is often called the most beautiful equation in mathematics."
      ];
      const fact = facts[Math.floor(Math.random() * facts.length)];
      return message.reply(`🧮 Math Fact: **${fact}**`);
    }

    // ===========================
    // !quote Command - Sends a famous mathematical quote.
    // ===========================
    if (command === 'quote') {
      const quotes = [
        "Mathematics is the language with which God has written the universe. - Galileo",
        "Pure mathematics is, in its way, the poetry of logical ideas. - Albert Einstein",
        "Do not worry about your difficulties in mathematics. I can assure you mine are still greater. - Albert Einstein"
      ];
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      return message.reply(`📜 Math Quote: **${quote}**`);
    }

    // ===========================
    // !mathpuzzle Command - Provides a challenging math puzzle.
    // ===========================
    if (command === 'mathpuzzle') {
      const puzzles = [
        "I am a three-digit number. My tens digit is five more than my ones digit, and my hundreds digit is eight less than my tens digit. What number am I?",
        "What comes next in the sequence: 1, 4, 9, 16, 25, __?",
        "A farmer has 17 sheep, and all but 9 run away. How many are left?"
      ];
      const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
      return message.reply(`🧩 Math Puzzle: **${puzzle}**`);
    }

    // ===========================
    // !serverinfo Command - Displays information about this server.
    // ===========================
    if (command === 'serverinfo') {
      if (!message.guild)
        return message.reply("This command can only be used in a server.");
      const embed = new MessageEmbed()
        .setTitle("Server Info")
        .setThumbnail(message.guild.iconURL({ dynamic: true }))
        .addField("Server Name", message.guild.name, true)
        .addField("Member Count", String(message.guild.memberCount), true)
        .setColor("#00ff00");
      return message.channel.send({ embeds: [embed] });
    }

    // ===========================
    // !userinfo Command - Displays your user information.
    // ===========================
    if (command === 'userinfo') {
      const embed = new MessageEmbed()
        .setTitle("User Info")
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addField("Username", message.author.username, true)
        .addField("ID", message.author.id, true)
        .setColor("#00ff00");
      return message.channel.send({ embeds: [embed] });
    }

    // ===========================
    // !clear Command - Deletes a specified number of messages.
    // ===========================
    if (command === 'clear') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return message.reply("❌ You don't have permission to use this command.");
      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount <= 0)
        return message.reply("Please provide a valid number of messages to delete.");
      await message.channel.bulkDelete(amount, true);
      return message.reply(`🗑️ Deleted **${amount}** messages.`);
    }

    // ===========================
    // !mute Command - Temporarily mutes a user (requires a role named "Muted").
    // Usage: !mute @user [time in minutes]
    // ===========================
    if (command === 'mute') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
        return message.reply("❌ You don't have permission to use this command.");
      const member = message.mentions.members.first();
      if (!member) return message.reply("Please mention a valid member to mute.");
      const timeArg = args[1];
      const time = parseTime(timeArg);
      if (time === null) return message.reply("Please provide a valid time in minutes.");
      // Find a role named "Muted" (case insensitive)
      const muteRole = message.guild.roles.cache.find(role => role.name.toLowerCase() === 'muted');
      if (!muteRole) return message.reply("Mute role not found. Please create a role named 'Muted'.");
      await member.roles.add(muteRole);
      message.reply(`${member.user.tag} has been muted for ${timeArg} minutes.`);
      // Automatically unmute after specified time
      setTimeout(async () => {
        if (member.roles.cache.has(muteRole.id)) {
          await member.roles.remove(muteRole);
          message.channel.send(`${member.user.tag} has been unmuted.`);
        }
      }, time);
      return;
    }

    // ===========================
    // !warn Command - Issues a warning to a user.
    // Usage: !warn @user [reason]
    // ===========================
    if (command === 'warn') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
        return message.reply("❌ You don't have permission to use this command.");
      const member = message.mentions.members.first();
      if (!member) return message.reply("Please mention a valid member to warn.");
      const reason = args.slice(1).join(" ");
      if (!reason) return message.reply("Please provide a reason for the warning.");
      return message.channel.send(`⚠️ ${member.user.tag} has been warned for: ${reason}`);
    }

    // ===========================
    // !kick Command - Kicks a user.
    // Usage: !kick @user [reason]
    // ===========================
    if (command === 'kick') {
      if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
        return message.reply("❌ You don't have permission to use this command.");
      const member = message.mentions.members.first();
      if (!member) return message.reply("Please mention a valid member to kick.");
      const reason = args.slice(1).join(" ") || "No reason provided";
      try {
        await member.kick(reason);
        return message.reply(`${member.user.tag} has been kicked. Reason: ${reason}`);
      } catch (err) {
        console.error("Error kicking member:", err);
        return message.reply(`❌ Unable to kick the member: ${err.message}`);
      }
    }

    // ===========================
    // !ban Command - Bans a user.
    // Usage: !ban @user [reason]
    // ===========================
    if (command === 'ban') {
      if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
        return message.reply("❌ You don't have permission to use this command.");
      const member = message.mentions.members.first();
      if (!member) return message.reply("Please mention a valid member to ban.");
      const reason = args.slice(1).join(" ") || "No reason provided";
      try {
        await member.ban({ reason });
        return message.reply(`${member.user.tag} has been banned. Reason: ${reason}`);
      } catch (err) {
        console.error("Error banning member:", err);
        return message.reply(`❌ Unable to ban the member: ${err.message}`);
      }
    }

    // ===========================
    // Fallback: Unknown command
    // ===========================
    return message.reply("❌ Unknown command. Type `!help` for a list of available commands.");
  } catch (error) {
    console.error("Error in command handler:", error);
    return message.reply(`❌ An error occurred: \`${error.message}\``);
  }
});

client.login(config.token);

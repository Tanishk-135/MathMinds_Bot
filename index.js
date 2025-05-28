const { Client, Intents, MessageEmbed } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');

// Load configuration from config.json (token and ownerID required)
const config = require('./config.json');

// Create a new Discord client with required intents.
const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS // required for moderation commands like kick/ban/mute
  ]
});

// Define command prefix.
const prefix = "!";

// Helper: Parse time in minutes (returns milliseconds)
function parseTime(timeStr) {
  const minutes = parseInt(timeStr);
  if (isNaN(minutes)) return null;
  return minutes * 60 * 1000;
}

// Event fired when the bot is ready.
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Main command handler.
client.on('messageCreate', async message => {
  // Ignore messages from bots or without the proper prefix.
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  // Split command and arguments.
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    // ========================
    // !hardreset Command (Owner Only)
    // Pulls updates from GitHub and restarts the bot via PM2.
    // ========================
    if (command === 'hardreset') {
      if (message.author.id !== config.ownerID) {
        return message.reply("❌ You don't have permission to use this command.");
      }
      await message.reply("🔄 Hard reset in progress...");
      try {
        // Ensure your PM2 process is named "mathminds-bot" (adjust if necessary).
        const { stdout, stderr } = await execPromise("git pull && pm2 restart mathminds-bot");
        if (stderr) await message.reply(`⚠️ Warning:\n\`\`\`${stderr}\`\`\``);
        return message.reply(`✅ Hard reset complete!\n\`\`\`${stdout}\`\`\``);
      } catch (err) {
        console.error("Error during !hardreset:", err);
        return message.reply(`❌ Error during hard reset: \`${err.message}\``);
      }
    }

    // ========================
    // !restart Command (Owner Only)
    // Restarts the bot via PM2 without pulling updates.
    // ========================
    if (command === 'restart') {
      if (message.author.id !== config.ownerID) {
        return message.reply("❌ You don't have permission to use this command.");
      }
      await message.reply("🔄 Restarting the bot...");
      try {
        const { stdout, stderr } = await execPromise("pm2 restart mathminds-bot");
        if (stderr) await message.reply(`⚠️ Warning:\n\`\`\`${stderr}\`\`\``);
        return message.reply(`✅ Bot restarted!\n\`\`\`${stdout}\`\`\``);
      } catch (err) {
        console.error("Error during !restart:", err);
        return message.reply(`❌ Error during restart: \`${err.message}\``);
      }
    }

    // ========================
    // !hello Command - Greet the bot.
    // ========================
    if (command === 'hello') {
      return message.reply("Hello! How can I assist you today?");
    }

    // ========================
    // !ping Command - Check the bot's latency.
    // ========================
    if (command === 'ping') {
      const sent = await message.reply("Pinging...");
      const latency = sent.createdTimestamp - message.createdTimestamp;
      return sent.edit(`Pong! Latency is ${latency}ms.`);
    }

    // ========================
    // !mathfact Command - Get an interesting mathematical fact.
    // ========================
    if (command === 'mathfact') {
      const facts = [
        "The number zero was invented by Indian mathematicians.",
        "A circle has infinite lines of symmetry.",
        "Euler's identity is often called the most beautiful equation in mathematics."
      ];
      const fact = facts[Math.floor(Math.random() * facts.length)];
      return message.reply(`🧮 Math Fact: **${fact}**`);
    }

    // ========================
    // !quote Command - Receive a famous mathematical quote.
    // ========================
    if (command === 'quote') {
      const quotes = [
        "Mathematics is the language with which God has written the universe. - Galileo",
        "Pure mathematics is, in its way, the poetry of logical ideas. - Albert Einstein",
        "Do not worry about your difficulties in mathematics. I can assure you mine are still greater. - Albert Einstein"
      ];
      const quote = quotes[Math.floor(Math.random() * quotes.length)];
      return message.reply(`📜 Math Quote: **${quote}**`);
    }

    // ========================
    // !mathpuzzle Command - Get a challenging math puzzle.
    // ========================
    if (command === 'mathpuzzle') {
      const puzzles = [
        "I am a three-digit number. My tens digit is five more than my ones digit, and my hundreds digit is eight less than my tens digit. What number am I?",
        "What comes next in the sequence: 1, 4, 9, 16, 25, __?",
        "A farmer has 17 sheep, and all but 9 run away. How many are left?"
      ];
      const puzzle = puzzles[Math.floor(Math.random() * puzzles.length)];
      return message.reply(`🧩 Math Puzzle: **${puzzle}**`);
    }

    // ========================
    // !serverinfo Command - Display info about this server.
    // ========================
    if (command === 'serverinfo') {
      if (!message.guild)
        return message.reply("This command can only be used in a server.");
      const embed = new MessageEmbed()
        .setTitle("Server Info")
        .setThumbnail(message.guild.iconURL({ dynamic: true }))
        .addField("Server Name", message.guild.name, true)
        .addField("Member Count", message.guild.memberCount.toString(), true)
        .setColor("#00ff00");
      return message.channel.send({ embeds: [embed] });
    }

    // ========================
    // !userinfo Command - Show your user information.
    // ========================
    if (command === 'userinfo') {
      const embed = new MessageEmbed()
        .setTitle("User Info")
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addField("Username", message.author.username, true)
        .addField("ID", message.author.id, true)
        .setColor("#00ff00");
      return message.channel.send({ embeds: [embed] });
    }

    // ========================
    // !uptime Command - Check how long the bot has been running.
    // ========================
    if (command === 'uptime') {
      const uptime = process.uptime();
      const minutes = Math.floor(uptime / 60);
      return message.reply(`🕒 Bot has been running for **${minutes} minutes**.`);
    }

    // ========================
    // !clear Command - Delete a specified number of messages.
    // ========================
    if (command === 'clear') {
      if (!message.member.permissions.has('MANAGE_MESSAGES')) {
        return message.reply("❌ You don't have permission to use this command.");
      }
      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount <= 0)
        return message.reply("Please provide a valid number of messages to delete.");
      
      // Bulk-delete messages (the second parameter 'true' ignores messages older than 14 days)
      await message.channel.bulkDelete(amount, true);
      return message.reply(`🗑️ Deleted **${amount}** messages.`);
    }

    // ========================
    // !mute Command - Temporarily mute a user (requires a mute role).
    // Usage: !mute @user [time in minutes]
    // ========================
    if (command === 'mute') {
      if (!message.member.permissions.has('MANAGE_ROLES')) {
        return message.reply("❌ You don't have permission to use this command.");
      }
      const member = message.mentions.members.first();
      if (!member) return message.reply("Please mention a valid member to mute.");
      
      const timeArg = args[1];
      const time = parseTime(timeArg);
      if (time === null) return message.reply("Please provide a valid time in minutes.");
      
      // Find the mute role (assumes a role called "Muted" exists)
      const muteRole = message.guild.roles.cache.find(role => role.name.toLowerCase() === 'muted');
      if (!muteRole) return message.reply("Mute role not found. Please create a role named 'Muted'.");
      
      await member.roles.add(muteRole);
      message.reply(`${member.user.tag} has been muted for ${timeArg} minutes.`);
      
      // Remove mute after specified time.
      setTimeout(async () => {
        if (member.roles.cache.has(muteRole.id)) {
          await member.roles.remove(muteRole);
          message.channel.send(`${member.user.tag} has been unmuted.`);
        }
      }, time);
      
      return;
    }

    // ========================
    // !warn Command - Issue a warning to a user.
    // Usage: !warn @user [reason]
    // ========================
    if (command === 'warn') {
      if (!message.member.permissions.has('MANAGE_MESSAGES')) {
        return message.reply("❌ You don't have permission to use this command.");
      }
      const member = message.mentions.members.first();
      if (!member) return message.reply("Please mention a valid member to warn.");
      
      const reason = args.slice(1).join(" ");
      if (!reason) return message.reply("Please provide a reason for the warning.");
      
      // Optionally log this warning to a file or database.
      message.channel.send(`⚠️ ${member.user.tag} has been warned for: ${reason}`);
      return;
    }

    // ========================
    // !kick Command - Kick a user.
    // Usage: !kick @user [reason]
    // ========================
    if (command === 'kick') {
      if (!message.member.permissions.has('KICK_MEMBERS')) {
        return message.reply("❌ You don't have permission to use this command.");
      }
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

    // ========================
    // !ban Command - Ban a user.
    // Usage: !ban @user [reason]
    // ========================
    if (command === 'ban') {
      if (!message.member.permissions.has('BAN_MEMBERS')) {
        return message.reply("❌ You don't have permission to use this command.");
      }
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

    // If the command is not recognized.
    return message.reply("❌ Unknown command. Type `!help` for a list of available commands.");

  } catch (error) {
    console.error("Error in command handler:", error);
    return message.reply(`❌ An error occurred: \`${error.message}\``);
  }
});

// Log in the bot using the token from config.json.
client.login(config.token);

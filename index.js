// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Pre-cache static data to avoid recreation on each command
const STATIC_FACTS = [
  "The number zero was invented by Indian mathematicians.",
  "A circle has infinite lines of symmetry.",
  "Euler's identity is often called the most beautiful equation in mathematics."
];
const STATIC_QUOTES = [
  "Mathematics is the language with which God has written the universe. - Galileo",
  "Pure mathematics is, in its way, the poetry of logical ideas. - Albert Einstein",
  "Do not worry about your difficulties in mathematics. I can assure you mine are still greater. - Albert Einstein"
];
const STATIC_PUZZLES = [
  "I am a three-digit number. My tens digit is five more than my ones digit, and my hundreds digit is eight less than my tens digit. What number am I?",
  "What comes next in the sequence: 1, 4, 9, 16, 25, __?",
  "A farmer has 17 sheep, and all but 9 run away. How many are left?"
];

// Environment-config
const config = {
  token: process.env.BOT_TOKEN,
};

// Constants for speed tuning
const STARTUP_COOLDOWN_MS = 1000;       // ignore commands for 1 second after startup
const RESTART_CONFIRM_DELAY_MS = 1000;   // wait 1 second before exiting on restart

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// Runtime state
let startupTime;

client.once('ready', () => {
  startupTime = Date.now();
  console.log(`Logged in as ${client.user.tag}!`);
});

// Helper functions
const delayedRestart = (message, delay = RESTART_CONFIRM_DELAY_MS) =>
  message.author.send("✅ Bot will restart now.")
         .then(() => setTimeout(() => process.exit(0), delay));

const parseTime = str => {
  const m = parseInt(str);
  return isNaN(m) ? null : m * 60 * 1000;
};

// Command handlers map
const handlers = {
  help: async (msg) => msg.reply(
    "**Available Commands:**\n\n" +
    "**Utility:**\n - !ping\n - !hello\n - !uptime\n\n" +
    "**Math & Fun:**\n - !mathfact\n - !quote\n - !mathpuzzle\n\n" +
    "**Info:**\n - !serverinfo\n - !userinfo\n\n" +
    "**Moderation:**\n - !clear\n - !mute\n - !warn\n - !kick\n - !ban"
  ),
  hardreset: async (msg) => {
    if (msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ You don't have permission to hard reset the bot.");
    // Notify in channel without details
    await msg.reply("🔄 Hard reset initiated. Check your DMs for details.");
    try {
      const { stdout, stderr } = await execPromise('git pull');
      const details = [];
      if (stderr.trim()) details.push(`Warnings during pull:\n${stderr.trim()}`);
      details.push(`Output:\n${stdout.trim()}`);
      // Send full info to requester DM
      await msg.author.send(`🔄 Hard reset details:\n${details.join("\n\n")}`);
      delayedRestart(msg);
    } catch (e) {
      await msg.author.send(`❌ Hard reset failed: ${e.message}`);
    }
  },
  restart: async (msg) => {
    if (msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ You don't have permission to restart the bot.");
    await msg.reply("🔄 Restart initiated. Check your DMs for confirmation.");
    delayedRestart(msg);
  },
  hello: msg => msg.reply("Hello! How can I assist you today?"),
  ping: async msg => {
    const sent = await msg.reply('Pinging...');
    return sent.edit(`Pong! Latency is ${sent.createdTimestamp - msg.createdTimestamp}ms.`);
  },
  uptime: msg => msg.reply(`🕒 Bot has been running for **${Math.floor(process.uptime()/60)} minutes**.`),
  mathfact: msg => msg.reply(`🧮 Math Fact: **${STATIC_FACTS[Math.floor(Math.random()*STATIC_FACTS.length)]}**`),
  quote: msg => msg.reply(`📜 Math Quote: **${STATIC_QUOTES[Math.floor(Math.random()*STATIC_QUOTES.length)]}**`),
  mathpuzzle: msg => msg.reply(`🧩 Math Puzzle: **${STATIC_PUZZLES[Math.floor(Math.random()*STATIC_PUZZLES.length)]}**`),
  serverinfo: msg => {
    if (!msg.guild) return msg.reply('This command can only be used in a server.');
    const e = new EmbedBuilder()
      .setTitle('Server Info')
      .setThumbnail(msg.guild.iconURL({dynamic:true}))
      .addFields([
        { name: 'Server Name', value: msg.guild.name, inline:true },
        { name: 'Member Count', value: `${msg.guild.memberCount}`, inline:true }
      ]);
    return msg.channel.send({ embeds: [e] });
  },
  userinfo: msg => {
    const e = new EmbedBuilder()
      .setTitle('User Info')
      .setThumbnail(msg.author.displayAvatarURL({dynamic:true}))
      .addFields([
        { name: 'Username', value: msg.author.username, inline:true },
        { name: 'ID', value: msg.author.id, inline:true }
      ]);
    return msg.channel.send({ embeds: [e] });
  },
  clear: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return msg.reply("❌ You don't have permission to use this command.");
    const n = parseInt(args[0]);
    if (isNaN(n)||n<=0) return msg.reply('Please provide a valid number of messages to delete.');
    await msg.channel.bulkDelete(n, true);
    return msg.reply(`🗑️ Deleted **${n}** messages.`);
  },
  mute: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return msg.reply("❌ You don't have permission to use this command.");
    const member = msg.mentions.members.first();
    const timeArg = args[1];
    const t = parseTime(timeArg);
    if (!member||t===null) return msg.reply('Mention a user and valid time.');
    const role = msg.guild.roles.cache.find(r=>r.name.toLowerCase()==='muted');
    if (!role) return msg.reply("Mute role not found. Please create 'Muted'.");
    await member.roles.add(role);
    msg.reply(`${member.user.tag} has been muted for ${timeArg} minutes.`);
    setTimeout(async ()=>{ if(member.roles.cache.has(role.id)){
      await member.roles.remove(role);
      msg.channel.send(`${member.user.tag} has been unmuted.`);
    }}, t);
  },
  warn: (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return msg.reply("❌ You don't have permission to use this command.");
    const member = msg.mentions.members.first();
    const reason = args.slice(1).join(' ');
    if (!member||!reason) return msg.reply('Mention user and reason.');
    return msg.channel.send(`⚠️ ${member.user.tag} has been warned for: ${reason}`);
  },
  kick: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.KickMembers))
      return msg.reply("❌ You don't have permission to use this command.");
    const member = msg.mentions.members.first();
    const reason = args.slice(1).join(' ')||'No reason provided';
    if (!member) return msg.reply('Please mention a valid member to kick.');
    try { await member.kick(reason); return msg.reply(`${member.user.tag} has been kicked. Reason: ${reason}`);} 
    catch(e){ return msg.reply(`❌ Unable to kick: ${e.message}`);}  
  },
  ban: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.BanMembers))
      return msg.reply("❌ You don't have permission to use this command.");
    const member = msg.mentions.members.first();
    const reason = args.slice(1).join(' ')||'No reason provided';
    if (!member) return msg.reply('Please mention a valid member to ban.');
    try { await member.ban({reason}); return msg.reply(`${member.user.tag} has been banned. Reason: ${reason}`);} 
    catch(e){ return msg.reply(`❌ Unable to ban: ${e.message}`);}  
  }
};

// Message handler
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (Date.now() - (startupTime||0) < STARTUP_COOLDOWN_MS) return;
  if (!message.content.startsWith('!')) return;

  const [cmd, ...args] = message.content.slice(1).trim().split(/ +/);
  const command = cmd.toLowerCase();
  const handler = handlers[command];
  try {
    if (handler) return handler(message, args);
    return message.reply("❌ Unknown command. Type `!help`.");
  } catch (err) {
    console.error('Error:', err);
    return message.reply(`❌ An error occurred: \`${err.message}\``);
  }
});

client.login(config.token);

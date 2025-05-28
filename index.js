// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { Configuration, OpenAIApi } = require('openai');

// Static cache
const FACTS = [
  "Zero was invented by Indian mathematicians.",
  "A circle has infinite lines of symmetry.",
  "Euler's identity: e^(i\u03c0) + 1 = 0."
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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const STARTUP_IGNORE = 1000;  // ms
const RESTART_DELAY = 1000;   // ms

// OpenAI setup
const openai = new OpenAIApi(new Configuration({
  apiKey: OPENAI_API_KEY
}));

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

client.once('ready', () => {
  readyAt = Date.now();
  console.log(`Logged in as ${client.user.tag}`);
});

// Helpers
const delayExit = () => setTimeout(() => process.exit(0), RESTART_DELAY);
const parseMinutes = str => {
  const m = parseInt(str);
  return isNaN(m) ? null : m * 60 * 1000;
};
const formatUptime = ms => {
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d ${h}h ${m}m`;
};

// Handlers
const handlers = {
  help: msg => {
    const isOwner = msg.author.id === msg.guild?.ownerId;
    return msg.reply(
      "**Commands:**\n" +
      "• Utility: ping, hello, uptime\n" +
      "• Fun: mathfact, quote, mathpuzzle\n" +
      "• Info: serverinfo, userinfo\n" +
      "• AI: Tag the bot with a question (e.g. @MathMindsBot what is pi?)\n" +
      (isOwner ? "• Mod: clear, mute, warn, kick, ban" : '')
    );
  },

  hardreset: async msg => {
    if (msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ No permission.");
    await msg.reply("🔄 Hard reset in progress, please wait...");
    try {
      const { stdout, stderr } = await execPromise('git pull');
      const summaryLine = stdout.split('\n').find(line => line.includes('insertion') || line.includes('file changed'));
      const summary = summaryLine ? `\n📄 Git Output:\n\u0060\u0060\u0060\n${summaryLine.trim()}\n\u0060\u0060\u0060` : '';
      if (stderr.trim()) {
        await msg.author.send(`⚠️ Warning during git pull:\n\u0060\u0060\u0060\n${stderr.trim()}\n\u0060\u0060\u0060`);
      }
      await msg.reply(`✅ Hard reset complete!${summary}`);
      delayExit();
    } catch (e) {
      await msg.author.send(`❌ Hard reset error:\n\u0060\u0060\u0060\n${e.message}\n\u0060\u0060\u0060`);
      await msg.reply("❌ Hard reset failed.");
    }
  },

  restart: async msg => {
    if (msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ No permission.");
    await msg.reply("🔄 Restarting...\n✅ Restart complete!");
    delayExit();
  },

  hello: msg => msg.reply("Hello!"),
  ping: msg => msg.reply(`Pong! ${Date.now() - msg.createdTimestamp}ms`),
  uptime: msg => msg.reply(`Uptime: ${formatUptime(Date.now() - readyAt)}`),

  mathfact: msg =>
    msg.reply(`🧮 **Did you know?**\n${FACTS[Math.floor(Math.random() * FACTS.length)]}`),

  quote: msg =>
    msg.reply(`📜 **Thought of the day:**\n\"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}\"`),

  mathpuzzle: msg =>
    msg.reply(`🧩 **Try this puzzle:**\n${PUZZLES[Math.floor(Math.random() * PUZZLES.length)]}`),

  serverinfo: msg => {
    if (!msg.guild) return msg.reply('❌ Server only.');
    const e = new EmbedBuilder()
      .setTitle('Server Info')
      .setThumbnail(msg.guild.iconURL())
      .addFields(
        { name: 'Name', value: msg.guild.name, inline: true },
        { name: 'Members', value: `${msg.guild.memberCount}`, inline: true }
      );
    return msg.channel.send({ embeds: [e] });
  },

  userinfo: msg => {
    const e = new EmbedBuilder()
      .setTitle('User Info')
      .addFields(
        { name: 'User', value: msg.author.tag, inline: true },
        { name: 'ID', value: msg.author.id, inline: true }
      );
    return msg.channel.send({ embeds: [e] });
  },

  clear: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return msg.reply("❌ No permission.");
    const n = parseInt(args[0]);
    if (!n || n < 1) return msg.reply('Provide a valid number.');
    await msg.delete();
    await msg.channel.bulkDelete(n, true);
    return msg.channel.send(`🗑️ Deleted ${n} messages.`);
  },

  mute: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return msg.reply("❌ No permission.");
    const member = msg.mentions.members.first();
    const t = parseMinutes(args[1]);
    if (!member || !t) return msg.reply('Please mention a member and time in minutes.');
    const role = msg.guild.roles.cache.find(r => r.name === 'Muted');
    if (!role) return msg.reply("Create a 'Muted' role first.");
    await member.roles.add(role);
    msg.reply(`🔇 ${member.user.tag} muted for ${args[1]}m.`);
    setTimeout(async () => {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        msg.channel.send(`🔊 ${member.user.tag} unmuted.`);
      }
    }, t);
  },

  warn: (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return msg.reply("❌ No permission.");
    const member = msg.mentions.members.first();
    const reason = args.slice(1).join(' ');
    if (!member || !reason) return msg.reply('Please mention a member and provide a reason.');
    return msg.reply(`⚠️ ${member.user.tag} warned: ${reason}`);
  },

  kick: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.KickMembers))
      return msg.reply("❌ No permission.");
    const member = msg.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason';
    if (!member) return msg.reply('Please mention a member.');
    try {
      await member.kick(reason);
      return msg.reply(`Kicked ${member.user.tag}.`);
    } catch {
      return msg.reply('❌ Failed to kick.');
    }
  },

  ban: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.BanMembers))
      return msg.reply("❌ No permission.");
    const member = msg.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason';
    if (!member) return msg.reply('Please mention a member.');
    try {
      await member.ban({ reason });
      return msg.reply(`🔨 Banned ${member.user.tag}.`);
    } catch {
      return msg.reply('❌ Failed to ban.');
    }
  }
};

// Message listener
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (Date.now() - (readyAt || 0) < STARTUP_IGNORE) return;

  // Command-based
  if (msg.content.startsWith('!')) {
    const [cmd, ...args] = msg.content.slice(1).trim().split(/ +/);
    const h = handlers[cmd.toLowerCase()];
    try {
      if (h) return h(msg, args);
      return msg.reply("❓ Unknown command. See !help.");
    } catch {
      return msg.reply("❌ An error occurred.");
    }
  }

  // Mention-based (AI chat)
  if (msg.mentions.has(client.user)) {
    const prompt = msg.content.replace(/<@!?\d+>/, '').trim();
    if (!prompt) return;
    try {
      const res = await openai.createChatCompletion({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for a math Discord bot.' },
          { role: 'user', content: prompt }
        ]
      });
      return msg.reply(res.data.choices[0].message.content);
    } catch (e) {
      console.error(e);
      return msg.reply('❌ Failed to get response from OpenAI.');
    }
  }
});

client.login(TOKEN);

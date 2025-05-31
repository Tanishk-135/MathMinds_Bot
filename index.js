// Load environment variables from the .env file
require('dotenv').config();

const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GoogleAuth } = require('google-auth-library');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Config/constants
const TOKEN = process.env.BOT_TOKEN;
const STARTUP_IGNORE = 1000; // ms

// Gemini API Authentication
const auth = new GoogleAuth({
  keyFile: './MathMinds_Bot/gemini_key.json',
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

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

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const channel = client.channels.cache.get("1377258433698336768");
  if (!channel) {
    console.error("Channel with ID 1377258433698336768 not found!");
    return;
  }
  
  // Ping the MathMind role
  const rolePing = "<@&1378364940322345071>";
  
  // Ping the bot (MathMinds Bot) itself using its ID
  const botPing = "<@1376515962915913778>";
  
  const welcomeMessage = `${rolePing}
  
**Welcome to MathMinds United!** :rocket:
  
This is **THE** place to flex your math skills, get help when your brain short-circuits, and vibe with fellow math nerds. Whether you're grinding equations or just here to see absurd math facts, we got you covered.
  
**Where to Go:**
  
<#1377926583569879100>
- Read the rules. Be cool. Don't be that guy. :no_entry_sign:
  
<#1378330697747529798>
- Drop a "hello" and share something about your math journey—or just tell us your favorite irrational number.
  
<#1378332239649312879>
- Brain not braining? Post your math struggles here. Need extra sauce? Ping ${botPing}.
  
<#1378332314253398026>
- Free math hacks—notes, cheat sheets, videos—basically everything but your textbook (because who actually reads that?).
  
<#1378041583236026458>
- Speedrun some math problems and prove your existence as an intellectual menace.
  
<#1378332583766655058>
- Brain teasers that will make you question reality. Are you ready? :dizzy_face:
  
<#1378335341764935680>
- Your daily dose of math facts, weird paradoxes, and galaxy brain insights—powered by ${botPing}.
  
<#1378335536657203250>
- Got ideas? Want cooler events? Drop them here and let’s cook. :man_cook::fire:
  
**How to Get Started:**
  
:one: Say hi in <#1378330697747529798>
:two: Explore the channels—ask questions in <#1378332239649312879>, steal knowledge from <#1378332314253398026>, and prep for **BATTLE** in <#1378041583236026458>
  
:fire: **Important Note:** Math-Blitz and Puzzle-Night event dates will be announced exclusively in <#1378035061474984136>. Stay tuned, or stay clueless.
  
Time to crunch numbers and stack W's. Let's go! :rocket:`;
  
  channel.send(welcomeMessage);
});

// Utility functions
const formatUptime = ms => {
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000) % 24;
  const d = Math.floor(ms / 86400000);
  return `${d}d ${h}h ${m}m`;
};

function delayedRestart(msg, text, delay = 5000) {
  msg.channel.send(text).then(() => setTimeout(() => process.exit(0), delay));
}

const formatMathText = text => {
  return text
    .replace(/(\d)\^(\d+)/g, (_, base, exp) => base + toSuperscript(exp))
    .replace(/\bsqrt\(([^)]+)\)/g, '√$1')
    .replace(/\bpi\b/gi, 'π')
    .replace(/\btheta\b/gi, 'θ')
    .replace(/(?:[⋅·]){2}\s*(.*?)\s*(?:[⋅·]){2}/gu, '**$1**');
};

const toSuperscript = num => {
  const superDigits = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
  };
  return num.split('').map(d => superDigits[d] || d).join('');
};

const testStr = "··Hello World··"; // or "⋅⋅Hello World⋅⋅" based on what you see!
console.log(formatMathText(testStr));

// -------------------------------------------------------------------
// Exponential Equation Solver functions (Quadratic Equation Logic)
// These functions help Mathy slow down (using delays) when outputting debugging logs.

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function solveExponentialEquation(expression) {
  console.log(`🔍 Solving: ${expression}`);
  await delay(1000);

  // Parse the equation (assuming it's in the form (expr)^(expr) = constant)
  let match = expression.match(/\((.*?)\)\^\((.*?)\) = (\d+)/);
  if (!match) return "⚠️ Invalid equation format.";

  let baseExpr = match[1].trim();
  let exponentExpr = match[2].trim();
  let targetValue = parseFloat(match[3]);

  // Ensure base and exponent are identical before solving
  if (baseExpr !== exponentExpr) {
      return "❌ Exponent and base must be equal!";
  }

  console.log(`📌 Found quadratic expression: ${baseExpr}`);
  await delay(1000);

  let yValues = findValidExponentSolutions(targetValue);
  console.log(`✅ Possible values for ${baseExpr}: ${yValues.join(', ')}`);
  await delay(1000);

  return `Solutions: ${yValues.map(y => `x^2 - 4x + 7 = ${y}`)}`;
}

function findValidExponentSolutions(value) {
  let solutions = [];
  for (let y = 1; y <= value; y++) {
      if (Math.pow(y, y) === value) {
          solutions.push(y);
      }
  }
  return solutions.length ? solutions : ["No real solutions"];
}
// -------------------------------------------------------------------

// AI handler (mention-based prompt)
const handlePrompt = async msg => {
  const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*`);
  const prompt = msg.content.replace(mentionRegex, '').trim();
  if (!prompt) return;
  try {
    const mathPrompt = `You are Mathy, the Gen Z MathBot — a chaotic, funny, cracked-at-math AI tutor with meme rizz. 
You're 50% math genius, 50% TikTok goblin, and 100% unhinged. 

Your job:
✅ Explain class 6–12 math topics
✅ Use Gen Z humor, Skibidi energy, and goofy ahh slang
✅ Be accurate, but never boring
✅ End every answer with a goofy math catchphrase like:
– "Go touch some π 🥧"
– "That’s a cosine crime fr 😤"
– "Stay skewed, not rude 📐"
– "Math is lowkey bussin frfr 📈"
- You can also create your own

Style rules:
– Roast dumb math: "Bro thinks sin(x) = x 💀"
– Use Discord formatting: **bold**, \`inline code\`, and \`\`\`code blocks\`\`\` use these in your format as discord only supports this and your messages are going to discord.
– Use emojis, TikTok slang, baby rage, and MrBeast-level energy
– NEVER be formal. NEVER be dry. NEVER be a textbook.
- If multiplying, use dots "⋅" and not "*'.
- Use code blocks only if necessary.
- If you are creating subpoints and subheadings, dont use "⋅⋅" but use "**" instead, discord supports this and not that.
- While writing equations, use inline blocks.

Now answer this like the Sigma math goblin you are:
${prompt}`;

    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/generative-language'] });
    const clientAuth = await auth.getClient();
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    const res = await clientAuth.request({
      url,
      method: 'POST',
      data: {
        contents: [{ parts: [{ text: mathPrompt }] }],
        generationConfig: { candidateCount: 1, temperature: 0, maxOutputTokens: 2000 }
      }
    });
    let reply = res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, could not fetch an answer.';
    reply = formatMathText(reply);

    const chunks = reply.match(/[^]{1,1900}(?=\n|\s|$)/g) || [];
    for (const chunk of chunks) {
      await msg.channel.send(chunk.trim());
    }
  } catch (e) {
    console.error(e);
    return msg.channel.send('⚠️ Failed to get AI response.');
  }
};

// Message listener
client.on('messageCreate', async msg => {
  if (msg.author.bot || Date.now() - readyAt < STARTUP_IGNORE) return;
  const mention = msg.mentions.has(client.user);
  const cmdMatch = msg.content.match(/^!(\w+)/);

  if (mention && !cmdMatch) {
    console.log(`AI Activated | Time: ${new Date().toLocaleString()}`);
    return handlePrompt(msg);
  }

  if (!cmdMatch) return;

  const cmd = cmdMatch[1].toLowerCase();
  const handler = handlers[cmd];
  if (handler) return handler(msg);
  msg.channel.send('❓ Unknown command. See !help.');
});

// Command Handlers
const handlers = {
  ping: msg => msg.channel.send('🌿 Pong!'),
  hello: msg => msg.channel.send('Hey there! 👋'),
  uptime: msg => msg.channel.send(`⏱ Uptime: ${formatUptime(Date.now() - readyAt)}`),
  help: msg => msg.channel.send('📘 Commands: !ping, !hello, !uptime, !mathfact, !quote, !mathpuzzle, !serverinfo, !userinfo, !clear, !mute, !warn, !kick, !ban, !restart, !hardreset, !check'),
  serverinfo: msg => {
    const { name, memberCount, createdAt } = msg.guild;
    msg.channel.send(`📡 Server: ${name}\n👥 Members: ${memberCount}\n📅 Created: ${createdAt.toDateString()}`);
  },
  userinfo: msg => {
    const user = msg.mentions.users.first() || msg.author;
    msg.channel.send(`👤 ${user.tag}\n🆔 ${user.id}\n📅 Created: ${user.createdAt.toDateString()}`);
  },
  clear: async msg => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) return msg.channel.send('❌ No permission.');
    const count = parseInt(msg.content.split(' ')[1]);
    if (!count || count < 1 || count > 100) return msg.channel.send('⚠️ Provide 1-100.');
    try {
      await msg.channel.bulkDelete(count, true);
      msg.channel.send(`🧹 Deleted ${count} messages.`);
    } catch (e) {
      console.error(e);
      msg.channel.send('❌ Delete failed.');
    }
  },
  mute: async msg => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageRoles)) return msg.channel.send('❌ No permission.');
    const m = msg.mentions.members.first();
    if (!m) return msg.channel.send('❌ Mention user.');
    const role = msg.guild.roles.cache.find(r => r.name === 'Muted');
    if (!role) return msg.channel.send('❌ Create "Muted" role.');
    try {
      await m.roles.add(role);
      msg.channel.send(`🔇 ${m.user.tag} muted.`);
    } catch (e) {
      console.error(e);
      msg.channel.send('❌ Mute failed.');
    }
  },
  warn: async msg => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages)) return msg.channel.send('❌ No permission.');
    const u = msg.mentions.users.first();
    if (!u) return msg.channel.send('❌ Mention user.');
    msg.channel.send(`⚠️ ${u.tag} warned.`);
  },
  kick: async msg => {
    if (!msg.member.permissions.has(PermissionFlagsBits.KickMembers)) return msg.channel.send('❌ No permission.');
    if (!msg.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) return msg.channel.send('❌ Bot lacks permission.');
    const m = msg.mentions.members.first();
    if (!m) return msg.channel.send('❌ Mention user.');
    if (m.roles.highest.position >= msg.guild.members.me.roles.highest.position) return msg.channel.send('❌ Hierarchy prevents kick.');
    try {
      await m.kick();
      msg.channel.send(`👢 ${m.user.tag} kicked.`);
    } catch (e) {
      console.error(e);
      msg.channel.send('❌ Kick failed.');
    }
  },
  ban: async msg => {
    if (!msg.member.permissions.has(PermissionFlagsBits.BanMembers)) return msg.channel.send('❌ No permission.');
    if (!msg.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers)) return msg.channel.send('❌ Bot lacks permission.');
    const m = msg.mentions.members.first();
    if (!m) return msg.channel.send('❌ Mention user.');
    if (m.roles.highest.position >= msg.guild.members.me.roles.highest.position) return msg.channel.send('❌ Hierarchy prevents ban.');
    try {
      await m.ban();
      msg.channel.send(`🔨 ${m.user.tag} banned.`);
    } catch (e) {
      console.error(e);
      msg.channel.send('❌ Ban failed.');
    }
  },
  restart: msg => delayedRestart(msg, '♻️ Restarting...'),
  hardreset: msg => delayedRestart(msg, '💥 Hardresetting...', 2000),
  check: msg => msg.channel.send('✅ All commands operational.')
};

client.login(TOKEN);

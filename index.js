// Load environment variables from the .env file
require('dotenv').config();
const { storeMessage, getRecentMessagesWithContext } = require("./redisSetup.js");
const { Client, GatewayIntentBits, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { GoogleAuth } = require('google-auth-library');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const cron = require('node-cron');
const fetch = require('node-fetch');

async function fetchArticleContent(url) {
  return ''; // placeholder: no content
}

// Config/constants
const TOKEN = process.env.BOT_TOKEN;
const STARTUP_IGNORE = 1000; // ms
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_URL = `https://newsapi.org/v2/everything?language=en&q="mathematics" OR "math education" OR "math research"&sortBy=publishedAt&apiKey=${NEWS_API_KEY}`;
const SPOTLIGHT_CHANNEL_ID = '1378335341764935680';

// Gemini API Authentication
const auth = new GoogleAuth({
  keyFile: './gemini_key.json',
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/generative-language'
  ],
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

client.on("messageCreate", async (message) => {
    if (message.author.bot) return; // Ignore bot messages

    console.log("Message received:", message.content); // Debugging log

    if (!message.content) {
        console.error("Message content is undefined");
        return;
    }

    // Declare userInput only once
    const userInput = message.content.trim();
    console.log("User input:", userInput);

    // Generate bot response
    const botResponse = generateResponse(userInput); // Ensure this function returns a valid string

    if (!botResponse || botResponse.trim() === "") {
        console.error("Bot response is undefined or empty.");
        return;
    }

    try {
        await message.reply(botResponse); // Send the response
    } catch (error) {
        console.error("Error sending message:", error);
    }
});

let readyAt;

// --------------------
// First client.once: define helper and immediately‐invoked fetch logic
// --------------------
client.once('ready', () => {
  readyAt = Date.now();
  console.log(`Logged in as ${client.user.tag}`);

  // Helper: generate Mathy response
  async function generateMathyResponse(text) {
    const mathPrompt = `
You are Mathy, the Gen Z MathBot — a chaotic, funny, cracked-at-math AI tutor with meme rizz.
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
– You can also create your own

Style rules:
– Roast dumb math: "Bro thinks sin(x) = x 💀"
– Use Discord formatting: **bold**, \`inline code\`, and \`\`\`code blocks\`\`\` — use these in your format as Discord only supports them.
– Use emojis, TikTok slang, baby rage, and MrBeast-level energy
– NEVER be formal. NEVER be dry. NEVER be a textbook.
– If multiplying, use dots "⋅" not "*"
– Use code blocks only if necessary.
– For subpoints/headings, use "**" instead of "⋅⋅", because Discord supports that.

Now explain this news like the Mathy you are:
${text}
`;  // ← closing backtick

    try {
      const clientAuth = await auth.getClient();
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
      const res = await clientAuth.request({
        url,
        method: 'POST',
        data: {
          contents: [{ parts: [{ text: mathPrompt }] }],
          generationConfig: { candidateCount: 1, temperature: 0.7, maxOutputTokens: 2000 }
        }
      });
      let reply = res.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Mathy could not fetch an answer.';
      return formatMathText(reply);
    } catch (e) {
      console.error('Error generating Mathy response:', e);
      return 'Mathy failed to process news.';
    }
  }

  // On ready: fetch news, scrape content, pass to Mathy, send to channel
  (async () => {
    try {
      const response = await fetch(NEWS_API_URL);
      const data = await response.json();
      console.log('Taking RAW NewsAPI');

      if (data.articles?.length > 0) {
        const { title, url: articleUrl } = data.articles[0];
        const excerpt = await fetchArticleContent(articleUrl);
        const newsText = `Headline:\n"${title}"\n\n${excerpt || 'No content.'}`;
        const mathyReply = await generateMathyResponse(newsText);

        let channel = client.channels.cache.get(SPOTLIGHT_CHANNEL_ID)
                   || await client.channels.fetch(SPOTLIGHT_CHANNEL_ID);
        if (!channel?.isTextBased()) {
          return console.error('Channel not found or not text-based');
        }
        await channel.send(`⚡ MathMinds Spotlight! ⚡\n\n${mathyReply}`);
        console.log('Sent Mathy’s news explanation');
      } else {
        console.log('No math news available today.');
      }
    } catch (err) {
      console.error('Error fetching or sending Mathy response:', err);
    }
  })();
}); // ← closes the first client.once('ready')

// --------------------
// Second client.once: (AI handler registration only, no nesting)
// --------------------
client.once('ready', () => {
  // If you intended a second “ready” listener, it should appear here,
  // but typically you only need a single client.once('ready'). If you
  // need additional “on ready” behavior, merge it into the block above.
});

client.on('guildMemberAdd', async (member) => {
    const roleId = '1378364940322345071'; // MathMinds Role ID
    const role = member.guild.roles.cache.get(roleId);
    
    if (role) {
        await member.roles.add(role).catch(console.error);
        console.log(`Assigned MathMinds role to ${member.user.tag}`);
    } else {
        console.error('Role not found!');
    }
});

// --------------------
// Utility functions (formatUptime, formatMathText, toSuperscript, etc.)
// --------------------
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

const testStr = "··Hello World··"; // or "⋅⋅Hello World⋅⋅"
console.log(formatMathText(testStr));

// -------------------------------------------------------------------
// Exponential Equation Solver functions (unchanged)
// -------------------------------------------------------------------
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function solveExponentialEquation(expression) {
  console.log(`🔍 Solving: ${expression}`);
  await delay(1000);

  let match = expression.match(/\((.*?)\)\^\((.*?)\) = (\d+)/);
  if (!match) return "⚠️ Invalid equation format.";

  let baseExpr = match[1].trim();
  let exponentExpr = match[2].trim();
  let targetValue = parseFloat(match[3]);

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

// --------------------
// AI handler (mention-based prompt) and message listener
// --------------------
const handlePrompt = async msg => {
  const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*`);
  const prompt = msg.content.replace(mentionRegex, '').trim();
  if (!prompt) return;
  try {
    const mathPrompt = `
You are Mathy, the Gen Z MathBot — a chaotic, funny, cracked-at-math AI tutor with meme rizz.
You're 50% math genius, 50% TikTok goblin, and 100% unhinged.

Your job:
✅ Explain class 6–12 math topics
✅ Use Gen Z humor, Skibidi energy, and goofy ahh slang
✅ Be accurate, but never boring
✅ End every answer that has atleast 2 paragraphs worth of words with a goofy math catchphrase like:
– "Go touch some π 🥧"
– "That’s a cosine crime fr 😤"
– "Stay skewed, not rude 📐"
– "Math is lowkey bussin frfr 📈"
– You can also create your own

Style rules:
– Roast dumb math: "Bro thinks sin(x) = x 💀"
– Use Discord formatting: **bold**, \`inline code\`, and \`\`\`code blocks\`\`\`
– Use emojis, TikTok slang, baby rage, and MrBeast-level energy
– NEVER be formal. NEVER be dry. NEVER be a textbook.
– If multiplying, use dots "⋅" not "*"
– Use code blocks only if necessary.
– For subpoints/headings, use "**" instead of "⋅⋅", because Discord supports that.
- Match response length to the user's message:
  - Short replies for casual chat (e.g., "yo", "that was funny").
  - Long responses for explanations or problem-solving.
  
Now answer this like the Sigma math goblin you are:
${prompt}
`;

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

client.on('messageCreate', async msg => {
  // Skip messages from bots or during startup grace period
  if (msg.author.bot || Date.now() - readyAt < STARTUP_IGNORE) return;

  const mention = msg.mentions.has(client.user);
  const cmdMatch = msg.content.match(/^!(\w+)/);

  // If Mathy is mentioned (without a command), handle it as a chat prompt.
  if (mention && !cmdMatch) {
    console.log(`AI Activated | Time: ${new Date().toLocaleString()}`);
    const userId = msg.author.id;

    // First, store the user’s message in the database.
    await storeMessage(userId, "user", msg.content);

    console.log("Is message defined?", typeof message);
    
    // Call handlePrompt(msg) to generate Mathy's response.
    // IMPORTANT: Ensure that handlePrompt returns the reply text.
    const botResponse = await handlePrompt(msg);
    console.log("Bot response before storing:", botResponse); // Debugging log
    
    // ✅ Store Mathy's response in Redis & PostgreSQL
    console.log("Message object:", message);
    if (message.content) {
        let userInput = message.content.trim();
        // Proceed with processing
    } else {
        console.error("Message content is undefined");
    }
    await storeMessage(msg.author.id, "bot", safeBotResponse, "discord");

    // Now, store Mathy’s reply as a bot message.
    await storeMessage(userId, "bot", botResponse, "discord");

    // Finally, send the response to Discord.
    return msg.channel.send(botResponse);
  }

  // Custom send command for owner (supports channel ID or channel mention)
  const sendMatch = msg.content.match(
  /^!send\s+(?:<#(\d+)>|(\d{17,20}))\s*(\d{1,2}:\d{2}\s*[APMapm]*)?\s*\n\n([\s\S]*)/
);
if (sendMatch && msg.author.id === process.env.OWNER_ID) {
  const channelId = sendMatch[1] || sendMatch[2];
  const timeString = sendMatch[3]; // Optional time argument
  const messageContent = sendMatch[4];

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return msg.channel.send({ content: '❌ Invalid channel ID.' });
  }

  // Immediate sending if no time is provided
  if (!timeString) {
    try {
      await channel.send({ content: messageContent.trim() });
      return msg.channel.send({ content: '✅ Message sent immediately.' });
    } catch (e) {
      console.error(e);
      return msg.channel.send({ content: '❌ Failed to send message.' });
    }
  }

  // Parse the provided time string
  const now = new Date();
  const timeParts = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!timeParts) {
    return msg.channel.send({ content: '❌ Invalid time format. Use HH:MM AM/PM.' });
  }

  let hours = parseInt(timeParts[1], 10);
  let minutes = parseInt(timeParts[2], 10);
  const period = timeParts[3].toUpperCase();
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  // Create a sendTime for today
  const sendTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours,
    minutes
  );

  // If sendTime is earlier than now, schedule for the next day
  if (sendTime < now) sendTime.setDate(sendTime.getDate() + 1);
  const delay = sendTime.getTime() - now.getTime();

  console.log(`Current Time: ${now}`);
  console.log(`Scheduled Time: ${sendTime}`);
  console.log(`Delay (ms): ${delay}`);

  setTimeout(async () => {
    try {
      await channel.send({ content: messageContent.trim() });
      // If you plan to log this scheduled message, use messageContent (or a copy)
      // rather than message.content (which may be undefined in this callback).
    } catch (e) {
      console.error(e);
      // Note: Avoid using msg.channel.send here if msg is no longer valid.
    }
  }, delay);

  msg.channel.send({
    content: `✅ Message scheduled for ${sendTime.toLocaleTimeString()}`
  });
}
  // If no command match, simply return.
  if (!cmdMatch || cmdMatch[1].toLowerCase() === "send") return;

  // For commands, get the corresponding handler.
  const cmd = cmdMatch[1].toLowerCase();
  const handler = handlers[cmd];
  if (handler) {
    // Execute the command handler, which should return Mathy's reply as text.
    const botResponse = await handler(msg);
    // Store Mathy's response
    await storeMessage(msg.author.id, "bot", botResponse, "discord");
    return msg.channel.send(botResponse);
  }

  // If command isn't recognized, reply with an unknown command message.
  const unknownResponse = '❓ Unknown command. See !help.';
  await storeMessage(msg.author.id, "bot", unknownResponse, "discord");
  return msg.channel.send(unknownResponse);
});
// --------------------
// Command Handlers
// --------------------
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
      await msg.channel.bulkDelete(count + 1, true);
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

// --------------------
// Finally, log in the bot
// --------------------
client.login(TOKEN);

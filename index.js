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
const moment = require("moment-timezone");
const QuickChart = require('quickchart-js');
const math = require('mathjs');

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

// Add this helper function near your other function definitions
async function generateGraphUrl(expression, sampleCount = 250) {
  const data = generateDataPoints(expression, [-10, 10], sampleCount);
  const qc = new QuickChart();
  qc.setConfig({
    type: 'line',
    data: {
      labels: data.xValues,
      datasets: [{
        label: `y = ${expression}`,
        data: data.yValues,
        borderColor: 'blue',
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.3
      }]
    },
    options: {
      title: {
        display: true,
        text: `Graph of y = ${expression}`
      },
      scales: {
        x: { title: { display: true, text: 'x' } },
        y: { title: { display: true, text: 'y' } }
      }
    }
  });
  qc.setWidth(800).setHeight(400).setDevicePixelRatio(2);
  
  let chartUrl;
  try {
    chartUrl = await qc.getShortUrl();
  } catch (err) {
    console.error("Error getting short URL:", err);
    chartUrl = qc.getUrl();
  }
  
  return chartUrl;
}

function sanitizeForEvaluation(input) {
  let eq = input.trim();

  // Replace the multiplication dot with an asterisk for evaluation.
  eq = eq.replace(/⋅/g, '*');

  // Convert ln( ) to log( ) for mathjs and handle inverse trig.
  eq = eq.replace(/ln\(/gi, 'log(')
         .replace(/sin\^-1/gi, 'asin')
         .replace(/cos\^-1/gi, 'acos')
         .replace(/tan\^-1/gi, 'atan');

  // Convert mod(...) to abs(...)
  eq = eq.replace(/mod\(([^)]+)\)/gi, 'abs($1)');

  // Insert explicit multiplication (e.g. "5x" becomes "5*x")
  eq = eq.replace(/(\d)([a-zA-Z])/g, '$1*$2');

  // Remove any leading "y =" or "f(x)=" if present.
  if (eq.match(/^y\s*=\s*/i)) {
      eq = eq.replace(/^y\s*=\s*/i, '');
  } else if (eq.match(/^f\s*\(\s*x\s*\)\s*=\s*/i)) {
      eq = eq.replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, '');
  }

  // Handle equals sign: if present, decide how to interpret it.
  if (eq.includes('=')) {
      const parts = eq.split('=').map(p => p.trim());
      // If the left-hand side explicitly is "y" or "f(x)", use the right-hand side.
      if (parts[0].toLowerCase() === 'y' || parts[0].toLowerCase() === 'f(x)') {
          eq = parts[1];
      } else {
          // Otherwise assume the user meant an implicit equation:
          // interpret A = B as A - B.
          eq = `(${parts[0]}) - (${parts[1]})`;
      }
  }
  return eq;
}

function sanitizeForDisplay(input) {
  let eq = input.trim();
  
  // Replace multiplication dot with a space+asterisk+space for clarity.
  eq = eq.replace(/⋅/g, ' * ');
  
  // Convert inverse trig functions for display
  eq = eq.replace(/sin\^-1/gi, '\\arcsin')
         .replace(/cos\^-1/gi, '\\arccos')
         .replace(/tan\^-1/gi, '\\arctan');
  
  // Convert mod(...) to absolute value notation.
  eq = eq.replace(/mod\(([^)]+)\)/gi, '|$1|');
  
  // Insert space between numbers and letters.
  eq = eq.replace(/(\d)([a-zA-Z])/g, '$1 $2');
  
  // Remove leading "y =" or "f(x)=" if present.
  if (eq.match(/^y\s*=\s*/i)) {
      eq = eq.replace(/^y\s*=\s*/i, '');
  } else if (eq.match(/^f\s*\(\s*x\s*\)\s*=\s*/i)) {
      eq = eq.replace(/^f\s*\(\s*x\s*\)\s*=\s*/i, '');
  }
  
  // For equations with an equals sign, adjust the displayed expression similarly.
  if (eq.includes('=')) {
      const parts = eq.split('=').map(p => p.trim());
      if (parts[0].toLowerCase() === 'y' || parts[0].toLowerCase() === 'f(x)') {
          eq = parts[1];
      } else {
          eq = `(${parts[0]}) - (${parts[1]})`;
      }
  }
  
  // Convert sqrt(...) for LaTeX display.
  eq = eq.replace(/sqrt\(([^)]+)\)/gi, '\\sqrt{$1}');
  
  return eq;
}

function generateDataPoints(exprStr, domain = [-10, 10], sampleCount = 100) {
  let compiledFunction;
  try {
    compiledFunction = math.compile(exprStr);
  } catch (err) {
    throw new Error(`Failed to parse the expression: ${err.message}`);
  }
  const [min, max] = domain;
  const step = (max - min) / (sampleCount - 1);
  const xValues = [];
  const yValues = [];
  for (let i = 0; i < sampleCount; i++) {
    const x = min + i * step;
    let y;
    try {
      y = compiledFunction.evaluate({ x });
    } catch (err) {
      y = NaN;
    }
    xValues.push(x.toFixed(2));
    yValues.push(y);
  }
  return { xValues, yValues };
}

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
      console.log('Raw News');

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

Graph Generation:
- If the user asks to generate a graph, in your response explicitly say "graph of (expression to graph in code blocks)" anywhere in the end followed by saying that the graph is going to be generated below.
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

    const chunks = reply.match(/[\s\S]{1,1900}/g) || [];
    // After your chunk loop:
    for (const chunk of chunks) {
      await msg.channel.send(chunk.trim());
    }
    
    // ---------- NEW GRAPH DETECTION CODE ADDED BELOW ----------
    const lowerReply = reply.toLowerCase();
    const graphKeyword = "graph of";
    
    if (lowerReply.includes(graphKeyword)) {
      // Extract everything after the last occurrence of "graph of"
      const index = lowerReply.lastIndexOf(graphKeyword);
      let graphExpr = reply.substring(index + graphKeyword.length).trim();
    
      // Clean up: remove markdown code block markers and the placeholder text "graph will be generated below"
      graphExpr = graphExpr.replace(/```/g, '').trim();
      graphExpr = graphExpr.replace(/graph will be generated below\.?/ig, '').trim();
    
      // If nothing useful remains, try to fallback: extract from the first backtick-enclosed substring
      if (!graphExpr) {
        const match = reply.match(/`([^`]+)`/);
        if (match && match[1]) {
          graphExpr = match[1].trim();
        }
      }
    
      // Validate: we only want simple expressions like "5x" or "3x"
      const simplePattern = /^[-+]?(\d+(\.\d+)?\s*)?x$/i;
      if (!graphExpr || !simplePattern.test(graphExpr)) {
        console.log("Extracted graph expression does not match expected simple format (e.g., '5x' or '3x'). Skipping graph generation.");
      } else {
        // Expression looks good; generate the graph.
        try {
          const chartUrl = await generateGraphUrl(graphExpr);
          const embed = new EmbedBuilder()
            .setTitle('Graph Generated')
            // Only set the description if the chartUrl is short enough
            .setDescription(chartUrl.length < 4000 ? `[Direct Link to Graph](${chartUrl})` : '')
            .setColor(0x3498db)
            .setImage(chartUrl);
          await msg.channel.send({ embeds: [embed] });
        } catch (err) {
          console.error("Graph generation error:", err);
          await msg.channel.send("❌ Sorry, there was an error generating the graph.");
        }
      }
    }
    // ---------- END OF NEW GRAPH CODE ----------
    

  } catch (e) {
    console.error(e);
    return msg.channel.send('⚠️ Failed to get AI response.');
  }
};

client.on('messageCreate', async msg => {
  if (msg.author.bot || Date.now() - readyAt < STARTUP_IGNORE) return;
  const mention = msg.mentions.has(client.user);
  const cmdMatch = msg.content.match(/^!(\w+)/);

  if (mention && !cmdMatch) {
    console.log(`AI Activated | Time: ${new Date().toLocaleString()}`);
  
    const userId = msg.author.id;
    const userMessage = msg.content;
  
    // ✅ Store user message in Redis & PostgreSQL
    await storeMessage(userId, "user", userMessage);
  
    return handlePrompt(msg);
  }
  
  if (!cmdMatch) return;

  const cmd = cmdMatch[1].toLowerCase();
  const handler = handlers[cmd];
  if (handler) {
    const botResponse = await handler(msg);
  
    // ✅ Store Mathy's response in Redis & PostgreSQL
    await storeMessage(msg.author.id, "bot", botResponse, "discord");
  
    return botResponse;
  }
  
  const botResponse = '❓ Unknown command. See !help.';
  msg.channel.send(botResponse);
  
  // ✅ Store Mathy's response in Redis & PostgreSQL
  await storeMessage(msg.author.id, "bot", botResponse, "discord");
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
      // Check user permissions.
      if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
          return msg.channel.send('❌ No permission.');
  
      // Parse and validate the count. The provided number should be between 1 and 100.
      const args = msg.content.trim().split(/\s+/);
      const count = parseInt(args[1]);
      if (isNaN(count) || count < 1 || count > 100)
          return msg.channel.send('⚠️ Provide a number between 1 and 100.');
  
      try {
          // Fetch (count + 1) messages so that the command message is included.
          const fetched = await msg.channel.messages.fetch({ limit: count + 1 });
          // Filter out the command message itself, leaving exactly `count` messages.
          const messagesToDelete = fetched.filter(m => m.id !== msg.id).first(count);
  
          // Bulk delete the filtered messages.
          await msg.channel.bulkDelete(messagesToDelete, true);
  
          // After a short delay, delete the command message separately
          setTimeout(() => {
              msg.delete().catch(err => {
                  // Ignore error if the message is already deleted.
                  if (err.code !== 10008) console.error("Error deleting the command message:", err);
              });
          }, 100);
      } catch (error) {
          console.error(error);
          msg.channel.send('❌ Delete failed.');
      }
  },
  send: async msg => {
  // Only owner can run this command.
  if (msg.author.id !== process.env.OWNER_ID)
    return msg.channel.send("❌ You do not have permission for this command.");

  // Expect formats:
  // With time: !send #channelname 11:50 PM IST
  // (an empty line follows) then message content.
  // Without time: !send #channelname
  // (an empty line follows) then message content.
  const sendMatch = msg.content.match(
    /^!send\s+(?:<#(\d+)>|(#\S+))(?:(?:\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+(\S+)))?\s*\n\n([\s\S]*)$/i
  );
  if (!sendMatch)
    return msg.channel.send(
      "❌ Incorrect format. Usage:\n```\n!send #channelname 11:50 PM IST\n\nmessage content here\n```"
    );

  // Extract groups.
  const channelIdFromMention = sendMatch[1];
  const channelNameText = sendMatch[2];
  const timePart = sendMatch[3];
  const meridiem = sendMatch[4] ? sendMatch[4].toUpperCase() : null;
  const tzAbbr = sendMatch[5];
  const messageContent = sendMatch[6].trim();

  // Resolve the target channel.
  let targetChannel;
  if (channelIdFromMention) {
    targetChannel = await msg.client.channels.fetch(channelIdFromMention).catch(() => null);
  } else if (channelNameText) {
    // Remove the '#' prefix if present.
    const channelName = channelNameText.startsWith('#') ? channelNameText.slice(1) : channelNameText;
    targetChannel = msg.guild.channels.cache.find(
      c => c.name === channelName && c.isTextBased()
    );
  }
  if (!targetChannel || !targetChannel.isTextBased())
    return msg.channel.send("❌ Invalid channel.");

  // If time parameters are missing, send immediately and inform the user about the correct format.
  if (!timePart || !meridiem || !tzAbbr) {
    try {
      await targetChannel.send(messageContent);
      return msg.channel.send(
        "Message sent immediately. Note: To schedule a message, use the format:\n```\n!send #channelname 11:50 PM IST\n\nmessage content here\n```"
      );
    } catch (e) {
      console.error(e);
      return msg.channel.send("❌ Failed to send message.");
    }
  }

  // Map timezone abbreviations to IANA timezone names.
  const tzMap = {
    IST: "Asia/Kolkata",
    EST: "America/New_York",
    PST: "America/Los_Angeles"
    // Add more mappings as needed.
  };
  const timezone = tzMap[tzAbbr.toUpperCase()] || tzAbbr;

  // Build a datetime string for today's date in the given timezone.
  const todayStr = moment().tz(timezone).format("YYYY-MM-DD");
  const dateTimeStr = `${todayStr} ${timePart} ${meridiem}`;
  let scheduledMoment = moment.tz(dateTimeStr, "YYYY-MM-DD hh:mm A", timezone);
  if (!scheduledMoment.isValid())
    return msg.channel.send("❌ Invalid scheduled time.");

  // Calculate the delay until the scheduled time.
  const now = moment().tz(timezone);
  let delay = scheduledMoment.diff(now);

  // If the time is already past today, schedule it for the next day.
  if (delay <= 0) {
    scheduledMoment.add(1, 'day');
    delay = scheduledMoment.diff(now);
  }

  // Schedule the message.
  setTimeout(async () => {
    try {
      await targetChannel.send(messageContent);
    } catch (error) {
      console.error("Scheduled message error:", error);
    }
  }, delay);

  return msg.channel.send(
    `Message scheduled for ${scheduledMoment.format("YYYY-MM-DD hh:mm A z")}`
  );
},
  graph: async msg => {
    // Get the command arguments (everything after "!graph")
    let args = msg.content.split(' ').slice(1);
    if (!args.length) {
      return msg.channel.send('❌ Please provide an equation.');
    }
    
    // Check if the last argument is a number. If so, treat it as the sample count.
    let sampleCount = 250; // Default sample count
    const lastArg = args[args.length - 1];
    if (!isNaN(lastArg)) {
      sampleCount = parseInt(lastArg);
      args.pop(); // Remove the sample count from the equation arguments
    }
    
    // The remaining args become the equation.
    const userInput = args.join(' ');
    
    // Produce two sanitized versions:
    const evalExpr = sanitizeForEvaluation(userInput);
    const displayExpr = sanitizeForDisplay(userInput);
    
    let data;
    try {
      // Generate data points from x in [-10, 10] using the specified sample count.
      data = generateDataPoints(evalExpr, [-10, 10], sampleCount);
    } catch (err) {
      console.error('Error generating data points:', err);
      return msg.channel.send(`❌ Error parsing equation: ${err.message}`);
    }
    
    // Build the QuickChart configuration.
    const qc = new QuickChart();
    qc.setConfig({
      type: 'line',
      data: {
        labels: data.xValues,
        datasets: [{
          label: `y = ${displayExpr}`,
          data: data.yValues,
          borderColor: 'blue',
          fill: false,
          pointRadius: 0,          // Remove the dots from the graph
          pointHoverRadius: 0,     // Remove hover markers
          tension: 0.3             // Smooth the line
        }]
      },
      options: {
        title: {
          display: true,
          text: `Graph of y = ${displayExpr}`
        },
        scales: {
          x: { title: { display: true, text: 'x' } },
          y: { title: { display: true, text: 'y' } }
        }
      }
    });
    qc.setWidth(800).setHeight(400).setDevicePixelRatio(2);
    
    // Attempt to get a shortened URL for the chart.
    let chartUrl;
    try {
      chartUrl = await qc.getShortUrl();
    } catch (err) {
      console.error("Error getting short URL:", err);
      chartUrl = qc.getUrl();
    }
    console.log("Chart URL:", chartUrl); // Debug: log the URL
    
    // Build and send the Discord embed.
    const embed = new EmbedBuilder()
      .setTitle('Graph Generated')
      .setDescription(`Graph for equation: \`${userInput}\` interpreted as y = ${displayExpr}\n[Direct Link](${chartUrl})`)
      .setColor(0x3498db)
      .setImage(chartUrl);
    
    return msg.channel.send({ embeds: [embed] });
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

// Modified command handlers with user feedback, permission filtering, and UX improvements

// Replace previous handlers object with this updated version:
const handlers = {
  help: msg => {
    const isOwner = msg.author.id === msg.guild.ownerId;
    const general = "• Utility: ping, hello, uptime\n• Fun: mathfact, quote, mathpuzzle\n• Info: serverinfo, userinfo";
    const mod = "\n• Mod: clear, mute, warn, kick, ban";
    return msg.reply(`**Commands:**\n${general}${isOwner ? mod : ''}`);
  },

  hardreset: async msg => {
    if (msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ No permission.");
    await msg.reply("🔄 Hard reset in progress, please wait...");
    try {
      const { stdout, stderr } = await execPromise('git pull');
      const summaryLine = stdout.split('\n').find(line => line.includes('insertion') || line.includes('file changed'));
      const summary = summaryLine ? `\n📄 ${summaryLine.trim()}` : '';
      if (stderr.trim()) {
        await msg.author.send(`⚠️ Warning during git pull:\n\```\n${stderr.trim()}\n\````);
      }
      await msg.reply(`✅ Hard reset complete!${summary}`);
      delayExit();
    } catch (e) {
      await msg.author.send(`❌ Hard reset error:\n\```\n${e.message}\n\````);
      await msg.reply("❌ Hard reset failed.");
    }
  },

  restart: async msg => {
    if (msg.author.id !== msg.guild.ownerId)
      return msg.reply("❌ No permission.");
    await msg.reply("🔄 Restarting...");
    setTimeout(() => msg.channel.send("✅ Restart complete."), 500);
    delayExit();
  },

  ping: msg => msg.reply(`Pong! ${Date.now() - msg.createdTimestamp}ms`),

  uptime: msg => {
    const ms = Date.now() - readyAt;
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    msg.reply(`Uptime: ${days}d ${hours}h ${minutes}m`);
  },

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

  clear: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return msg.reply("❌ No permission.");
    const n = parseInt(args[0]);
    if (!n || n < 1) return msg.reply('Provide a valid number.');
    await msg.delete(); // delete command message first
    const messages = await msg.channel.messages.fetch({ limit: n });
    await msg.channel.bulkDelete(messages.filter(m => m.id !== msg.id), true);
    return msg.channel.send(`🗑️ Deleted ${messages.size} messages.`);
  },

  mute: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return msg.reply("❌ No permission.");
    const member = msg.mentions.members.first();
    const t = parseMinutes(args[1]);
    if (!member || !t) return msg.reply('Please mention a user and provide mute duration in minutes.');
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
    if (!member || !reason) return msg.reply('Please mention a user and a reason.');
    return msg.reply(`⚠️ ${member.user.tag} warned: ${reason}`);
  },

  kick: async (msg, args) => {
    if (!msg.member.permissions.has(PermissionFlagsBits.KickMembers))
      return msg.reply("❌ No permission.");
    const member = msg.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason';
    if (!member) return msg.reply('Please mention a member to kick.');
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
    if (!member) return msg.reply('Please mention a member to ban.');
    try {
      await member.ban({ reason });
      return msg.reply(`🔨 Banned ${member.user.tag}.`);
    } catch {
      return msg.reply('❌ Failed to ban.');
    }
  },

  hello: msg => msg.reply("Hello!"),

  mathfact: msg =>
    msg.reply(`🧮 **Did you know?**\n${FACTS[Math.floor(Math.random() * FACTS.length)]}`),

  quote: msg =>
    msg.reply(`📜 **Thought of the day:**\n\"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}\"`),

  mathpuzzle: msg =>
    msg.reply(`🧩 **Try this puzzle:**\n${PUZZLES[Math.floor(Math.random() * PUZZLES.length)]}`),

  userinfo: msg => {
    const e = new EmbedBuilder()
      .setTitle('User Info')
      .addFields(
        { name: 'User', value: msg.author.tag, inline: true },
        { name: 'ID', value: msg.author.id, inline: true }
      );
    return msg.channel.send({ embeds: [e] });
  }
};

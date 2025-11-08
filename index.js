const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require("discord.js");
require("./keep_alive"); // Keep-alive server

// ---------------- CONFIG ----------------
const ALLOWED_GUILD = "1426789471776542803"; // Only this server
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------------- STORAGE ----------------
const messageCounts = new Map();
const voiceTimes = new Map();
const voiceJoinTimes = new Map();
const snipes = new Map();
const guildConfig = {}; 
// Structure: { [guildId]: { modRoles: [], jailRole: null, jailChannel: null } }

// ---------------- READY ----------------
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  updateLeaderboards();
  setInterval(updateLeaderboards, 5 * 60 * 1000); // auto-update every 5 mins
});

// ---------------- TRACKING ----------------
client.on("messageCreate", (message) => {
  if (!message.guild || message.guild.id !== ALLOWED_GUILD || message.author.bot) return;
  const guildId = message.guild.id;
  if (!messageCounts.has(guildId)) messageCounts.set(guildId, {});
  const guildCounts = messageCounts.get(guildId);
  guildCounts[message.author.id] = (guildCounts[message.author.id] || 0) + 1;
});

client.on("messageDelete", (message) => {
  if (!message.guild || message.guild.id !== ALLOWED_GUILD || message.author.bot) return;
  snipes.set(message.guild.id, {
    content: message.content,
    author: message.author.tag,
    time: Date.now(),
  });
});

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!newState.guild || newState.guild.id !== ALLOWED_GUILD) return;
  const user = newState.member;
  const guildId = newState.guild.id;

  if (!voiceTimes.has(guildId)) voiceTimes.set(guildId, {});
  const guildVoice = voiceTimes.get(guildId);

  if (newState.channel && !oldState.channel) {
    voiceJoinTimes.set(user.id, Date.now());
  } else if (!newState.channel && oldState.channel) {
    const joined = voiceJoinTimes.get(user.id);
    if (joined) {
      const minutes = Math.floor((Date.now() - joined) / 60000);
      guildVoice[user.id] = (guildVoice[user.id] || 0) + minutes;
      voiceJoinTimes.delete(user.id);
    }
  }
});

// ---------------- LEADERBOARD ----------------
function getLeaderboard(data, type) {
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const numbers = [
    "<a:vnumber1:1433892245978742845>",
    "<a:vnumber2:1433892250546475099>",
    "<a:vnumber3:1433892253423763476>",
    "<a:vnumber4:1433892256158449955>",
    "<a:vnumber5:1433892258830094376>",
    "<a:vnumber6:1433892261820760165>",
    "<a:vnumber7:1433892263867453560>",
    "<a:vnumber8:1433892266539356231>",
    "<a:vnumber9:1433892269101944863>",
    "<a:vnumber1:1433892245978742845><a:vnumber0:1433892272478359804>",
  ];

  return entries
    .map(([id, count], i) => {
      const userTag = `\`${id}\``;
      const stat = type === "voice" ? `${count} voice mins` : `${count} messages`;
      const sep = type === "voice" ? "🔊" : "<a:pink_arrow:1436464220576415824>";
      return `${numbers[i]} ${userTag} ${sep} ${stat}`;
    })
    .join("\n");
}

// ---------------- UPDATE LEADERBOARDS ----------------
async function updateLeaderboards() {
  const guild = client.guilds.cache.get(ALLOWED_GUILD);
  if (!guild) return;

  try {
    const messageLB = getLeaderboard(messageCounts.get(guild.id) || {}, "messages");
    const voiceLB = getLeaderboard(voiceTimes.get(guild.id) || {}, "voice");

    const messageEmbed = new EmbedBuilder()
      .setTitle("💬 Message Leaderboard")
      .setColor("#FF69B4")
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setDescription(messageLB)
      .setImage("https://cdn.discordapp.com/attachments/860528686403158046/1108384769147932682/ezgif-2-f41b6758ff.gif")
      .setFooter({ text: "<a:white_butterflies:1436478933339213895> Updates every 5 minutes" });

    const voiceEmbed = new EmbedBuilder()
      .setTitle("🎧 Voice Leaderboard")
      .setColor("#FF69B4")
      .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setDescription(voiceLB)
      .setImage("https://cdn.discordapp.com/attachments/860528686403158046/1108384769147932682/ezgif-2-f41b6758ff.gif")
      .setFooter({ text: "<a:white_butterflies:1436478933339213895> Updates every 5 minutes" });

    const messageChannel = guild.channels.cache.find(ch => ch.name === "message-lb");
    const voiceChannel = guild.channels.cache.find(ch => ch.name === "voice-lb");

    if (messageChannel) {
      const msgs = await messageChannel.messages.fetch({ limit: 1 });
      if (msgs.size > 0) await msgs.first().edit({ embeds: [messageEmbed] });
      else await messageChannel.send({ embeds: [messageEmbed] });
    }

    if (voiceChannel) {
      const msgs = await voiceChannel.messages.fetch({ limit: 1 });
      if (msgs.size > 0) await msgs.first().edit({ embeds: [voiceEmbed] });
      else await voiceChannel.send({ embeds: [voiceEmbed] });
    }

  } catch (err) {
    console.error("Leaderboard update error:", err);
  }
}

// ---------------- COMMAND HANDLER ----------------
client.on("messageCreate", async (message) => {
  if (!message.guild || message.guild.id !== ALLOWED_GUILD || message.author.bot) return;
  const prefix = "+";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const guildId = message.guild.id;

  if (!guildConfig[guildId]) guildConfig[guildId] = { modRoles: [], jailRole: null, jailChannel: null };
  const config = guildConfig[guildId];

  // ---------- CONFIG COMMANDS ----------
  if (cmd === "setmodrole") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("<:x_markv:1431619387168657479> Admin only.");
    const role = message.mentions.roles.first();
    if (!role) return message.reply("<:x_markv:1431619387168657479> Mention a role to set as mod role.");
    if (!config.modRoles.includes(role.id)) config.modRoles.push(role.id);
    return message.reply(`<:check_markv:1431619384987615383> ${role.name} added as mod role.`);
  }

  if (cmd === "setjailrole") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("<:x_markv:1431619387168657479> Admin only.");
    const role = message.mentions.roles.first();
    if (!role) return message.reply("<:x_markv:1431619387168657479> Mention a role to set as jail role.");
    config.jailRole = role.id;
    return message.reply(`<:check_markv:1431619384987615383> ${role.name} set as jail role.`);
  }

  if (cmd === "setjailchannel") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("<:x_markv:1431619387168657479> Admin only.");
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("<:x_markv:1431619387168657479> Mention a channel to set as jail channel.");
    config.jailChannel = channel.id;
    return message.reply(`<:check_markv:1431619384987615383> ${channel.name} set as jail channel.`);
  }

  // ---------- UTILITY COMMANDS ----------
  if (cmd === "snipe") {
    const snipeData = snipes.get(message.guild.id);
    if (!snipeData) return message.reply("No deleted messages to snipe.");
    return message.channel.send(`Last deleted message by **${snipeData.author}**: ${snipeData.content}`);
  }

  if (cmd === "messages") updateLeaderboards();
  if (cmd === "voice") updateLeaderboards();
  if (cmd === "update") updateLeaderboards();

  // ---------- MODERATION COMMANDS ----------
  const isMod = message.member.roles.cache.some(r => config.modRoles.includes(r.id));

  if (!isMod && ["kick","ban","mute","unmute","role"].includes(cmd)) 
    return message.reply("<:x_markv:1431619387168657479> You need mod role to run this command.");

  if (cmd === "kick") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("<:x_markv:1431619387168657479> Mention a user to kick.");
    const reason = args.join(" ") || "No reason provided";
    await member.kick(reason).catch(() => message.reply("<:x_markv:1431619387168657479> Could not kick user."));
    return message.reply(`<:check_markv:1431619384987615383> Kicked ${member.user.tag}`);
  }

  if (cmd === "ban") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("<:x_markv:1431619387168657479> Mention a user to ban.");
    const reason = args.join(" ") || "No reason provided";
    await member.ban({ reason }).catch(() => message.reply("<:x_markv:1431619387168657479> Could not ban user."));
    return message.reply(`<:check_markv:1431619384987615383> Banned ${member.user.tag}`);
  }

  if (cmd === "mute") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("<:x_markv:1431619387168657479> Mention a user to mute.");
    if (!config.jailRole) return message.reply("<:x_markv:1431619387168657479> Jail role not set.");
    await member.roles.add(config.jailRole).catch(() => message.reply("<:x_markv:1431619387168657479> Could not add jail role."));
    return message.reply(`<:check_markv:1431619384987615383> Muted ${member.user.tag}`);
  }

  if (cmd === "unmute") {
    const member = message.mentions.members.first();
    if (!member) return message.reply("<:x_markv:1431619387168657479> Mention a user to unmute.");
    if (!config.jailRole) return message.reply("<:x_markv:1431619387168657479> Jail role not set.");
    await member.roles.remove(config.jailRole).catch(() => message.reply("<:x_markv:1431619387168657479> Could not remove jail role."));
    return message.reply(`<:check_markv:1431619384987615383> Unmuted ${member.user.tag}`);
  }

  if (cmd === "role") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply("<:x_markv:1431619387168657479> Admin only.");
    const user = message.mentions.members.first();
    const role = message.mentions.roles.first();
    if (!user || !role) return message.reply("<:x_markv:1431619387168657479> Usage: +role @user @role");
    await user.roles.add(role).catch(() => message.reply("<:x_markv:1431619387168657479> Could not add role."));
    return message.reply(`<:check_markv:1431619384987615383> Added role ${role.name} to ${user.user.tag}`);
  }
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);

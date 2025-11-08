const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
require("./keep_alive");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Load config and DB
let config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
let db = JSON.parse(fs.readFileSync("./database/db.json", "utf8"));

// Custom emojis
const numberEmojis = [
  "<a:vnumber0:1433892272478359804>",
  "<a:vnumber1:1433892245978742845>",
  "<a:vnumber2:1433892250546475099>",
  "<a:vnumber3:1433892253423763476>",
  "<a:vnumber4:1433892256158449955>",
  "<a:vnumber5:1433892258830094376>",
  "<a:vnumber6:1433892261820760165>",
  "<a:vnumber7:1433892263867453560>",
  "<a:vnumber8:1433892266539356231>",
  "<a:vnumber9:1433892269101944863>"
];

const arrowEmoji = "<a:pink_arrow:1436464220576415824>";
const voiceEmoji = "🔊";

function saveDB() {
  fs.writeFileSync("./database/db.json", JSON.stringify(db, null, 2));
}

function saveConfig() {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
}

// --- Track Messages ---
client.on("messageCreate", message => {
  if (!message.guild || message.author.bot) return;

  if (!db.messages[message.author.id]) {
    db.messages[message.author.id] = { guildId: message.guild.id, tag: message.author.tag, messages: 0 };
  }
  db.messages[message.author.id].messages += 1;
  db.messages[message.author.id].tag = message.author.tag;

  saveDB();
});

// --- Track Voice Minutes ---
client.on("voiceStateUpdate", (oldState, newState) => {
  if (newState.member.user.bot) return;

  const userId = newState.member.id;

  // Join VC
  if (!oldState.channel && newState.channel) {
    if (!db.voice[userId]) db.voice[userId] = { guildId: newState.guild.id, tag: newState.member.user.tag, joinedAt: Date.now(), voiceMinutes: 0 };
    else db.voice[userId].joinedAt = Date.now();
  }

  // Leave VC
  if (oldState.channel && !newState.channel) {
    if (db.voice[userId] && db.voice[userId].joinedAt) {
      const mins = Math.floor((Date.now() - db.voice[userId].joinedAt) / 60000);
      db.voice[userId].voiceMinutes += mins;
      db.voice[userId].joinedAt = null;
      db.voice[userId].tag = newState.member.user.tag;
      saveDB();
    }
  }
});

// --- Get top users ---
function getTop(type, guildId) {
  const data = Object.values(db[type]).filter(u => u.guildId === guildId);
  return data.sort((a, b) => {
    const aVal = type === "messages" ? a.messages : a.voiceMinutes;
    const bVal = type === "messages" ? b.messages : b.voiceMinutes;
    return bVal - aVal;
  }).slice(0, 10);
}

// --- Send or Edit Leaderboard ---
async function sendOrEditLeaderboard(channel, type, topUsers) {
  const description = topUsers.length
    ? topUsers.map((u, i) => {
        const emoji = numberEmojis[i] || numberEmojis[numberEmojis.length - 1];
        const separator = type === "messages" ? arrowEmoji : voiceEmoji;
        const value = type === "messages" ? `${u.messages} messages` : `${u.voiceMinutes} mins`;
        return `${emoji} \`${u.tag}\` ${separator} ${value}`;
      }).join("\n")
    : "No data yet.";

  const embed = new EmbedBuilder()
    .setTitle(type === "messages" ? "Message Leaderboard" : "Voice Leaderboard")
    .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL({ dynamic: true }) })
    .setThumbnail(channel.guild.iconURL({ dynamic: true }))
    .setColor("#FF69B4")
    .setDescription(`${description}\n\n<a:white_butterflies:1436478933339213895> Updates every 5 minutes`);

  const msgId = type === "messages" ? config.messageLB : config.voiceLB;

  try {
    if (msgId) {
      const msg = await channel.messages.fetch(msgId);
      await msg.edit({ embeds: [embed] });
    } else {
      const msg = await channel.send({ embeds: [embed] });
      if (type === "messages") config.messageLB = msg.id;
      else config.voiceLB = msg.id;
      saveConfig();
    }
  } catch {
    const msg = await channel.send({ embeds: [embed] });
    if (type === "messages") config.messageLB = msg.id;
    else config.voiceLB = msg.id;
    saveConfig();
  }
}

// --- Commands ---
client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith("+")) return;

  const args = message.content.slice(1).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  if (command === "postlb") {
    const messageChannel = client.channels.cache.get(config.messageChannel) || message.channel;
    const voiceChannel = client.channels.cache.get(config.voiceChannel) || message.channel;

    const topMessages = getTop("messages", message.guild.id);
    const topVoice = getTop("voice", message.guild.id);

    if (messageChannel) sendOrEditLeaderboard(messageChannel, "messages", topMessages);
    if (voiceChannel) sendOrEditLeaderboard(voiceChannel, "voice", topVoice);
  }

  if (command === "set") {
    const type = args[0]; // messages / voice
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply("Mention a channel to set.");

    if (type === "messages") config.messageChannel = channel.id;
    else if (type === "voice") config.voiceChannel = channel.id;
    else return message.reply("Use `messages` or `voice`");

    saveConfig();
    message.reply(`Set ${type} channel to ${channel.name}`);
  }
});

// --- Auto-update every 5 minutes ---
setInterval(() => {
  client.guilds.cache.forEach(guild => {
    const messageChannel = client.channels.cache.get(config.messageChannel);
    const voiceChannel = client.channels.cache.get(config.voiceChannel);
    if (!messageChannel || !voiceChannel) return;

    const topMessages = getTop("messages", guild.id);
    const topVoice = getTop("voice", guild.id);

    sendOrEditLeaderboard(messageChannel, "messages", topMessages);
    sendOrEditLeaderboard(voiceChannel, "voice", topVoice);
  });
}, 5 * 60 * 1000);

// --- Login ---
client.login(process.env.TOKEN);

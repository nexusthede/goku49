// index.js
const fs = require("fs");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
});

// ===== Config =====
const TOKEN = process.env.TOKEN; // Set this in Render environment
const MESSAGE_LB_FILE = "./database/messages.json";
const VOICE_LB_FILE = "./database/voice.json";
const ALLOWED_GUILD = "1426789471776542803"; // Whitelisted server ID

// ===== Custom emojis =====
const numberEmojis = [
  "<a:vnumber1:1433892245978742845>",
  "<a:vnumber2:1433892250546475099>",
  "<a:vnumber3:1433892253423763476>",
  "<a:vnumber4:1433892256158449955>",
  "<a:vnumber5:1433892258830094376>",
  "<a:vnumber6:1433892261820760165>",
  "<a:vnumber7:1433892263867453560>",
  "<a:vnumber8:1433892266539356231>",
  "<a:vnumber9:1433892269101944863>",
];
const arrowEmoji = "<a:pink_arrow:1436464220576415824>";

// ===== Data =====
let messageLB = {};
let voiceLB = {};
let messageLBChannel;
let voiceLBChannel;
let messageLBMessageId;
let voiceLBMessageId;
const vcJoinTimes = {}; // Track members currently in VC

if (fs.existsSync(MESSAGE_LB_FILE)) messageLB = JSON.parse(fs.readFileSync(MESSAGE_LB_FILE));
if (fs.existsSync(VOICE_LB_FILE)) voiceLB = JSON.parse(fs.readFileSync(VOICE_LB_FILE));

// ===== Helpers =====
function saveLB() {
  fs.writeFileSync(MESSAGE_LB_FILE, JSON.stringify(messageLB, null, 2));
  fs.writeFileSync(VOICE_LB_FILE, JSON.stringify(voiceLB, null, 2));
}

function generateLeaderboardDescription(topUsers, type) {
  if (!topUsers || topUsers.length === 0) return "No data yet.";

  return topUsers.map((u, i) => {
    let emoji = "";
    if (i === 9) {
      emoji = "<a:vnumber1:1433892245978742845><a:vnumber0:1433892272478350090>"; // 10th place
    } else {
      emoji = numberEmojis[i];
    }

    const separator = arrowEmoji;
    const value = type === "messages" ? `${u.messages} messages` : `${u.voiceMinutes} mins`;

    return `${emoji} \`${u.tag}\` ${separator} ${value}`;
  }).join("\n");
}

// ===== Post or update leaderboard embed =====
async function sendLeaderboardEmbed(channel, usersData, type) {
  const sorted = Object.values(usersData)
    .sort((a, b) => (type === "messages" ? b.messages - a.messages : b.voiceMinutes - a.voiceMinutes))
    .slice(0, 10);

  const description = generateLeaderboardDescription(sorted, type);

  const embed = new EmbedBuilder()
    .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() })
    .setTitle(type === "messages" ? "Message Leaderboard" : "Voice Leaderboard")
    .setThumbnail(channel.guild.iconURL())
    .setColor("#FFB6C1") // light pink
    .setDescription(description + `\n<a:white_butterflies:1436478933339213895> **Updates every 5 minutes**`);

  // Track message ID to prevent duplicates
  let lbMessageId = type === "messages" ? messageLBMessageId : voiceLBMessageId;
  let lbMessage;

  if (lbMessageId) {
    try {
      lbMessage = await channel.messages.fetch(lbMessageId);
    } catch {
      lbMessage = null;
    }
  }

  if (lbMessage) {
    await lbMessage.edit({ embeds: [embed] });
  } else {
    lbMessage = await channel.send({ embeds: [embed] });
    if (type === "messages") messageLBMessageId = lbMessage.id;
    else voiceLBMessageId = lbMessage.id;
  }
}

// ===== Commands =====
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (message.guild.id !== ALLOWED_GUILD) return; // Whitelist check

  const prefix = "+";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === "set") {
    if (args[0] === "messages" && message.mentions.channels.first()) {
      messageLBChannel = message.mentions.channels.first().id;
      message.channel.send("Message leaderboard channel set.");
    } else if (args[0] === "voice" && message.mentions.channels.first()) {
      voiceLBChannel = message.mentions.channels.first().id;
      message.channel.send("Voice leaderboard channel set.");
    }
  } else if (command === "postlb") {
    if (messageLBChannel) {
      const msgChannel = message.guild.channels.cache.get(messageLBChannel);
      if (msgChannel) sendLeaderboardEmbed(msgChannel, messageLB, "messages");
    }
    if (voiceLBChannel) {
      const vcChannel = message.guild.channels.cache.get(voiceLBChannel);
      if (vcChannel) sendLeaderboardEmbed(vcChannel, voiceLB, "voice");
    }
  }
});

// ===== Track messages =====
client.on("messageCreate", message => {
  if (!message.guild || message.author.bot) return;
  if (message.guild.id !== ALLOWED_GUILD) return;

  if (!messageLB[message.author.id]) messageLB[message.author.id] = { tag: message.author.tag, messages: 0 };
  messageLB[message.author.id].messages += 1;
  saveLB();
});

// ===== Track voice =====
client.on("voiceStateUpdate", (oldState, newState) => {
  if (!newState.guild || newState.guild.id !== ALLOWED_GUILD) return;

  const memberId = newState.member.id;

  // Joined VC
  if (!oldState.channel && newState.channel) {
    vcJoinTimes[memberId] = Date.now();
    if (!voiceLB[memberId]) voiceLB[memberId] = { tag: newState.member.user.tag, voiceMinutes: 0 };
  }

  // Left VC
  if (oldState.channel && !newState.channel && vcJoinTimes[memberId]) {
    const diff = Date.now() - vcJoinTimes[memberId];
    voiceLB[memberId].voiceMinutes += Math.floor(diff / 60000);
    saveLB();
    delete vcJoinTimes[memberId];
  }

  // Switch VC channels
  if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    vcJoinTimes[memberId] = Date.now();
  }
});

// Increment voice minutes every minute for members still in VC
setInterval(() => {
  for (const memberId in vcJoinTimes) {
    if (!voiceLB[memberId]) continue;
    voiceLB[memberId].voiceMinutes += 1;
  }
  saveLB();
}, 60 * 1000);

// ===== Auto-update leaderboard every 5 minutes =====
setInterval(() => {
  client.guilds.cache.forEach(guild => {
    if (guild.id !== ALLOWED_GUILD) return;

    if (messageLBChannel) {
      const msgChannel = guild.channels.cache.get(messageLBChannel);
      if (msgChannel) sendLeaderboardEmbed(msgChannel, messageLB, "messages");
    }
    if (voiceLBChannel) {
      const vcChannel = guild.channels.cache.get(voiceLBChannel);
      if (vcChannel) sendLeaderboardEmbed(vcChannel, voiceLB, "voice");
    }
  });
}, 5 * 60 * 1000);

// ===== Leave unauthorized servers =====
client.on("guildCreate", guild => {
  if (guild.id !== ALLOWED_GUILD) {
    guild.leave()
      .then(() => console.log(`Left unauthorized server: ${guild.name}`))
      .catch(console.error);
  }
});

// ===== Keep Alive (Render-friendly) =====
const app = express();
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(process.env.PORT || 3000);

// ===== Login =====
client.login(TOKEN);

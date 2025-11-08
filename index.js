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
const ALLOWED_GUILD = "1426789471776542803";

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
let vcJoinTimes = {};

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
      // 10th place = 1 + 0 emojis
      emoji = "<a:vnumber1:1433892245978742845><a:vnumber0:1433892272478350090>";
    } else {
      emoji = numberEmojis[i];
    }

    const separator = type === "messages" ? arrowEmoji : arrowEmoji;
    const value = type === "messages" ? `${u.messages} messages` : `${u.voiceMinutes} mins`;

    return `${emoji} \`${u.tag}\` ${separator} ${value}`;
  }).join("\n");
}

// ===== Post or update leaderboard embed =====
async function sendLeaderboardEmbed(channel, usersData, type) {
  const now = Date.now();

  // Update voice minutes for users currently in VC
  if (type === "voice") {
    for (const memberId in vcJoinTimes) {
      const joinedAt = vcJoinTimes[memberId];
      const diffMinutes = Math.floor((now - joinedAt) / 60000);
      if (!usersData[memberId]) {
        usersData[memberId] = { tag: "Unknown", voiceMinutes: 0 };
      }
      usersData[memberId].voiceMinutes += diffMinutes;
      vcJoinTimes[memberId] = now; // reset timestamp
    }
    saveLB();
  }

  const sorted = Object.values(usersData)
    .sort((a, b) => (type === "messages" ? b.messages - a.messages : b.voiceMinutes - a.voiceMinutes))
    .slice(0, 10);

  const description = generateLeaderboardDescription(sorted, type);

  const embed = new EmbedBuilder()
    .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL() })
    .setTitle(type === "messages" ? "Message Leaderboard" : "Voice Leaderboard")
    .setThumbnail(channel.guild.iconURL())
    .setColor("#FFB6C1")
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
  if (message.guild.id !== ALLOWED_GUILD) return; // whitelist

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
    if (messageLBChannel) sendLeaderboardEmbed(message.guild.channels.cache.get(messageLBChannel), messageLB, "messages");
    if (voiceLBChannel) sendLeaderboardEmbed(message.guild.channels.cache.get(voiceLBChannel), voiceLB, "voice");
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
  const member = newState.member;
  if (!member) return;

  // Member joined VC
  if (!oldState.channel && newState.channel) {
    vcJoinTimes[member.id] = Date.now();
  }

  // Member left VC
  if (oldState.channel && !newState.channel) {
    const joinedAt = vcJoinTimes[member.id];
    if (joinedAt) {
      const diffMinutes = Math.floor((Date.now() - joinedAt) / 60000);
      if (!voiceLB[member.id]) voiceLB[member.id] = { tag: member.user.tag, voiceMinutes: 0 };
      voiceLB[member.id].voiceMinutes += diffMinutes;
      delete vcJoinTimes[member.id];
      saveLB();
    }
  }
});

// ===== Auto-update every 5 minutes =====
setInterval(() => {
  client.guilds.cache.forEach(guild => {
    if (guild.id !== ALLOWED_GUILD) return;
    if (messageLBChannel) sendLeaderboardEmbed(guild.channels.cache.get(messageLBChannel), messageLB, "messages");
    if (voiceLBChannel) sendLeaderboardEmbed(guild.channels.cache.get(voiceLBChannel), voiceLB, "voice");
  });
}, 5 * 60 * 1000);

// ===== Keep Alive (Render-friendly) =====
const app = express();
app.get("/", (req, res) => res.send("Bot is running!"));
app.listen(process.env.PORT || 3000);

// ===== Login =====
client.login(TOKEN);

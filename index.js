const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { keepAlive } = require("./keep_alive");
const config = require("./config.json");
const db = require("./database/db.json"); // mock DB

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

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
  "<a:vnumber1:1433892245978742845><a:vnumber0:1433892272478359804>"
];

// Helper to send leaderboard embeds
function sendLeaderboardEmbed(channel, type, topUsers) {
  const embed = new EmbedBuilder()
    .setTitle(type === "messages" ? "Message Leaderboard" : "Voice Leaderboard")
    .setAuthor({ name: channel.guild.name, iconURL: channel.guild.iconURL({ dynamic: true }) })
    .setThumbnail(channel.guild.iconURL({ dynamic: true }))
    .setColor("#FF69B4")
    .setDescription(
      topUsers.map((u, i) => {
        const emoji = numberEmojis[i];
        const separator = type === "messages" ? "<a:pink_arrow:1436464220576415824>" : "🔊";
        const value = type === "messages" ? `${u.messages} messages` : `${u.voiceMinutes} mins`;
        return `${emoji} ${u.tag} ${separator} ${value}`;
      }).join("\n")
    )
    .setFooter({ text: "<a:white_butterflies:1436478933339213895> Updates every 5 minutes" });

  channel.send({ embeds: [embed] });
}

// Helper to get top 10
function getTop(type) {
  const data = db[type] || {};
  return Object.values(data).sort((a, b) => (type === "messages" ? b.messages - a.messages : b.voiceMinutes - a.voiceMinutes)).slice(0, 10);
}

// Command handler
client.on("messageCreate", async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith("+")) return;

  const args = message.content.slice(1).split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === "postlb") {
    const topMessages = getTop("messages");
    const topVoice = getTop("voice");

    const messageChannel = client.channels.cache.get(config.messageChannel) || message.channel;
    const voiceChannel = client.channels.cache.get(config.voiceChannel) || message.channel;

    sendLeaderboardEmbed(messageChannel, "messages", topMessages);
    sendLeaderboardEmbed(voiceChannel, "voice", topVoice);
  }

  if (command === "messages") {
    const topMessages = getTop("messages");
    const messageChannel = client.channels.cache.get(config.messageChannel) || message.channel;
    sendLeaderboardEmbed(messageChannel, "messages", topMessages);
  }

  if (command === "voice") {
    const topVoice = getTop("voice");
    const voiceChannel = client.channels.cache.get(config.voiceChannel) || message.channel;
    sendLeaderboardEmbed(voiceChannel, "voice", topVoice);
  }

  if (command === "update") {
    const topMessages = getTop("messages");
    const topVoice = getTop("voice");

    const messageChannel = client.channels.cache.get(config.messageChannel) || message.channel;
    const voiceChannel = client.channels.cache.get(config.voiceChannel) || message.channel;

    sendLeaderboardEmbed(messageChannel, "messages", topMessages);
    sendLeaderboardEmbed(voiceChannel, "voice", topVoice);
  }

  if (command === "setmessagechannel") {
    if (!message.member.permissions.has("Administrator"))
      return message.channel.send("❌ You need Admin permissions");
    const channel = message.mentions.channels.first();
    if (!channel) return message.channel.send("❌ Mention a channel");
    config.messageChannel = channel.id;
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    message.channel.send(`✅ Message leaderboard channel set to ${channel}`);
  }

  if (command === "setvoicechannel") {
    if (!message.member.permissions.has("Administrator"))
      return message.channel.send("❌ You need Admin permissions");
    const channel = message.mentions.channels.first();
    if (!channel) return message.channel.send("❌ Mention a channel");
    config.voiceChannel = channel.id;
    fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    message.channel.send(`✅ Voice leaderboard channel set to ${channel}`);
  }
});

// Auto-update every 5 minutes
setInterval(() => {
  client.guilds.cache.forEach((guild) => {
    const messageChannel = client.channels.cache.get(config.messageChannel);
    const voiceChannel = client.channels.cache.get(config.voiceChannel);
    if (!messageChannel || !voiceChannel) return;

    const topMessages = getTop("messages");
    const topVoice = getTop("voice");

    // Edit last leaderboard messages instead of sending new ones (simplified here: send new)
    sendLeaderboardEmbed(messageChannel, "messages", topMessages);
    sendLeaderboardEmbed(voiceChannel, "voice", topVoice);
  });
}, 5 * 60 * 1000);

keepAlive();
client.login(process.env.TOKEN);

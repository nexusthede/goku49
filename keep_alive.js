const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running!");
});

app.listen(3000, () => console.log("✅ Keep-alive server started on port 3000"));

// Export the function properly
function keepAlive() {
  console.log("Keep-alive function initialized");
}

module.exports = { keepAlive };

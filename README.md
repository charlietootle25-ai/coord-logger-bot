# 📍 Glazed Coord Logger Bot

A Discord bot that receives coordinates from Glazed's Coordsnapper, saves them to a database, and forwards them to your Discord server.

## Features
- ✅ Receives webhooks from Glazed Coordsnapper
- ✅ Saves all coordinates to a database
- ✅ Forwards coords to a Discord channel
- ✅ Discord slash commands to search/list/export coords
- ✅ Free hosting on Railway

---

## 🚀 Setup Guide

### Step 1: Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Click **"New Application"** → Name it `CoordLogger` → Create
3. Go to **"Bot"** tab on the left sidebar
4. Click **"Reset Token"** → **Copy the token** (save it!)
5. Scroll down to **"Privileged Gateway Intents"**:
   - ✅ Enable **Message Content Intent**
6. Go to **"OAuth2"** → **"URL Generator"**
7. Check these **Scopes**: `bot`, `applications.commands`
8. Check these **Permissions**: `Send Messages`, `Embed Links`
9. Copy the URL at the bottom → Open in browser → Add bot to your server

### Step 2: Get Channel ID

1. In Discord, go to **User Settings** → **Advanced** → Enable **Developer Mode**
2. Right-click the channel where you want coords posted
3. Click **"Copy Channel ID"** (save it!)

### Step 3: Deploy to Railway (FREE)

1. Go to https://railway.app and sign up with GitHub

2. Click **"New Project"** → **"Deploy from GitHub repo"**

3. First, you need to push this code to GitHub:
   - Create a new repo on GitHub (e.g., `coord-logger-bot`)
   - Push this code to it

4. Select your repo in Railway

5. Go to **Variables** tab and add:
   ```
   BOT_TOKEN = your_bot_token_here
   DISCORD_CHANNEL_ID = your_channel_id_here
   ```

6. Railway will auto-deploy and give you a URL like:
   `https://coord-logger-bot-production.up.railway.app`

7. Your webhook URL is:
   `https://coord-logger-bot-production.up.railway.app/webhook`

### Step 4: Configure Glazed

1. In Minecraft with Glazed, go to the Coordsnapper settings
2. Set the webhook URL to your Railway URL + `/webhook`:
   ```
   https://your-app-name.up.railway.app/webhook
   ```
3. Snap some coords and they should appear in Discord!

---

## 📝 Discord Commands

| Command | Description |
|---------|-------------|
| `/coords [count]` | Show recent coordinates (default 10) |
| `/search <x> <z> [radius]` | Find coords near a location |
| `/stats` | Show total coords logged |
| `/delete <id>` | Delete a coordinate by ID |
| `/clearall` | Delete ALL coordinates |
| `/export` | Export coords as text |

---

## 🖥️ Running Locally (Optional)

If you want to test locally first:

```bash
cd CoordBot
npm install
```

Create a `.env` file:
```
BOT_TOKEN=your_bot_token
DISCORD_CHANNEL_ID=your_channel_id
PORT=3000
```

Run it:
```bash
npm start
```

Use ngrok to expose locally:
```bash
ngrok http 3000
```

Then use the ngrok URL as your webhook.

---

## 📁 Files

```
CoordBot/
├── index.js          # Main bot code
├── package.json      # Dependencies
├── .env.example      # Environment template
├── coordinates.db    # SQLite database (created automatically)
└── README.md         # This file
```

---

## ❓ Troubleshooting

**Bot not responding to commands?**
- Make sure you added `applications.commands` scope when inviting
- Wait 1-2 minutes for commands to register globally

**Coords not showing up?**
- Check Railway logs for errors
- Make sure webhook URL ends with `/webhook`
- Verify your BOT_TOKEN and CHANNEL_ID are correct

**Railway showing errors?**
- Check the "Deployments" tab for build logs
- Make sure all environment variables are set

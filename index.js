require('dotenv').config();
const express = require('express');
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');

// ============== CONFIG ==============
const BOT_TOKEN = process.env.BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

// ============== JSON FILE DATABASE ==============
const DB_FILE = './coordinates.json';

function loadCoords() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading coords:', e);
  }
  return [];
}

function saveCoords(coords) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(coords, null, 2));
  } catch (e) {
    console.error('Error saving coords:', e);
  }
}

let coordinates = loadCoords();

// ============== DISCORD BOT SETUP ==============
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// Slash commands definition
const commands = [
  new SlashCommandBuilder()
    .setName('coords')
    .setDescription('List recent coordinates')
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('Number of coords to show (default 10, max 25)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    ),
  
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search coordinates near a location')
    .addIntegerOption(option =>
      option.setName('x').setDescription('X coordinate').setRequired(true))
    .addIntegerOption(option =>
      option.setName('z').setDescription('Z coordinate').setRequired(true))
    .addIntegerOption(option =>
      option.setName('radius').setDescription('Search radius (default 1000)').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show coordinate statistics'),
  
  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete a coordinate by ID')
    .addIntegerOption(option =>
      option.setName('id').setDescription('Coordinate ID to delete').setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('clearall')
    .setDescription('Delete ALL coordinates'),
  
  new SlashCommandBuilder()
    .setName('export')
    .setDescription('Export all coordinates as text')
];

// Register slash commands
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered!');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
}

// Bot ready event
client.once('ready', async () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
  await registerCommands();
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === 'coords') {
      const count = interaction.options.getInteger('count') || 10;
      const recentCoords = coordinates.slice(-count).reverse();
      
      if (recentCoords.length === 0) {
        await interaction.reply({ content: '📭 No coordinates logged yet!', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📍 Recent Coordinates (${recentCoords.length})`)
        .setColor(0x7600FF)
        .setDescription(recentCoords.map(c => 
          `**#${c.id}** \`${c.x}, ${c.y}, ${c.z}\` - <t:${Math.floor(new Date(c.timestamp).getTime() / 1000)}:R>`
        ).join('\n'))
        .setFooter({ text: 'Use /search to find coords near a location' });

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'search') {
      const x = interaction.options.getInteger('x');
      const z = interaction.options.getInteger('z');
      const radius = interaction.options.getInteger('radius') || 1000;

      const nearbyCoords = coordinates.filter(c => 
        Math.abs(c.x - x) <= radius && Math.abs(c.z - z) <= radius
      );

      if (nearbyCoords.length === 0) {
        await interaction.reply({ 
          content: `📭 No coordinates found within ${radius} blocks of (${x}, ${z})`, 
          ephemeral: true 
        });
        return;
      }

      // Sort by distance
      const withDistance = nearbyCoords.map(c => ({
        ...c,
        distance: Math.sqrt(Math.pow(c.x - x, 2) + Math.pow(c.z - z, 2))
      })).sort((a, b) => a.distance - b.distance);

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Coords near (${x}, ${z})`)
        .setColor(0x00FF00)
        .setDescription(withDistance.slice(0, 15).map(c => 
          `**#${c.id}** \`${c.x}, ${c.y}, ${c.z}\` - ${Math.round(c.distance)} blocks away`
        ).join('\n'))
        .setFooter({ text: `Found ${nearbyCoords.length} coords within ${radius} blocks` });

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'stats') {
      const recent = coordinates[coordinates.length - 1];

      const embed = new EmbedBuilder()
        .setTitle('📊 Coordinate Stats')
        .setColor(0x00BFFF)
        .addFields(
          { name: 'Total Logged', value: `${coordinates.length} coordinates`, inline: true },
          { name: 'Last Coord', value: recent ? `\`${recent.x}, ${recent.y}, ${recent.z}\`` : 'None', inline: true }
        );

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'delete') {
      const id = interaction.options.getInteger('id');
      const index = coordinates.findIndex(c => c.id === id);
      
      if (index !== -1) {
        coordinates.splice(index, 1);
        saveCoords(coordinates);
        await interaction.reply({ content: `✅ Deleted coordinate #${id}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Coordinate #${id} not found`, ephemeral: true });
      }
    }

    else if (commandName === 'clearall') {
      const count = coordinates.length;
      coordinates = [];
      saveCoords(coordinates);
      await interaction.reply({ content: `🗑️ Deleted all ${count} coordinates!`, ephemeral: true });
    }

    else if (commandName === 'export') {
      if (coordinates.length === 0) {
        await interaction.reply({ content: '📭 No coordinates to export!', ephemeral: true });
        return;
      }

      const text = coordinates.slice(-50).map(c => `${c.x}, ${c.y}, ${c.z}`).join('\n');
      
      await interaction.reply({ 
        content: `📋 **Exported ${Math.min(coordinates.length, 50)} coordinates:**\n\`\`\`\n${text}\n\`\`\`${coordinates.length > 50 ? '\n(Showing last 50)' : ''}`,
        ephemeral: true 
      });
    }

  } catch (error) {
    console.error('Command error:', error);
    await interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
  }
});

// ============== EXPRESS WEBHOOK SERVER ==============
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'online', coords_logged: coordinates.length });
});

// Main webhook endpoint - receives data from Glazed
app.post('/webhook', async (req, res) => {
  try {
    console.log('Received webhook:', JSON.stringify(req.body, null, 2));
    
    const { embeds } = req.body;
    
    if (!embeds || embeds.length === 0) {
      return res.status(400).json({ error: 'No embeds found' });
    }

    const embed = embeds[0];
    const description = embed.description || '';
    const timestamp = embed.timestamp || new Date().toISOString();

    // Parse coordinates from "Coords: X: -187677, Y: -47, Z: 159415"
    const coordMatch = description.match(/X:\s*(-?\d+).*Y:\s*(-?\d+).*Z:\s*(-?\d+)/i);
    
    if (!coordMatch) {
      console.log('Could not parse coordinates from:', description);
      return res.status(400).json({ error: 'Could not parse coordinates' });
    }

    const x = parseInt(coordMatch[1]);
    const y = parseInt(coordMatch[2]);
    const z = parseInt(coordMatch[3]);

    // Generate ID
    const id = coordinates.length > 0 ? Math.max(...coordinates.map(c => c.id)) + 1 : 1;

    // Save to database
    const newCoord = { id, x, y, z, timestamp, raw: description };
    coordinates.push(newCoord);
    saveCoords(coordinates);
    
    console.log(`Saved coord #${id}: ${x}, ${y}, ${z}`);

    // Forward to Discord channel
    if (DISCORD_CHANNEL_ID && client.isReady()) {
      try {
        const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
        if (channel) {
          const discordEmbed = new EmbedBuilder()
            .setTitle('📍 New Coordinate Logged')
            .setDescription(`**Coords:** \`${x}, ${y}, ${z}\``)
            .setColor(0x7600FF)
            .addFields(
              { name: 'X', value: `${x}`, inline: true },
              { name: 'Y', value: `${y}`, inline: true },
              { name: 'Z', value: `${z}`, inline: true }
            )
            .setFooter({ text: `ID: #${id} • Sent by Glazed` })
            .setTimestamp(new Date(timestamp));

          await channel.send({ embeds: [discordEmbed] });
        }
      } catch (discordError) {
        console.error('Error sending to Discord:', discordError);
      }
    }

    res.json({ success: true, id, coords: { x, y, z } });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============== START EVERYTHING ==============
// Start Express server
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
});

// Login Discord bot
client.login(BOT_TOKEN);

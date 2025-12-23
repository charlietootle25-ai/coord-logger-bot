require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const Database = require('better-sqlite3');

// ============== CONFIG ==============
const BOT_TOKEN = process.env.BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

// ============== DATABASE SETUP ==============
const db = new Database('coordinates.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS coords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    x INTEGER,
    y INTEGER,
    z INTEGER,
    raw_description TEXT,
    timestamp TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Prepared statements for better performance
const insertCoord = db.prepare('INSERT INTO coords (x, y, z, raw_description, timestamp) VALUES (?, ?, ?, ?, ?)');
const getAllCoords = db.prepare('SELECT * FROM coords ORDER BY created_at DESC LIMIT ?');
const searchCoords = db.prepare('SELECT * FROM coords WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ? ORDER BY created_at DESC LIMIT 50');
const getRecentCoords = db.prepare('SELECT * FROM coords ORDER BY created_at DESC LIMIT ?');
const countCoords = db.prepare('SELECT COUNT(*) as count FROM coords');
const deleteCoord = db.prepare('DELETE FROM coords WHERE id = ?');
const clearAllCoords = db.prepare('DELETE FROM coords');

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
    .setDescription('Delete ALL coordinates (admin only)'),
  
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
      const coords = getRecentCoords.all(count);
      
      if (coords.length === 0) {
        await interaction.reply({ content: '📭 No coordinates logged yet!', ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📍 Recent Coordinates (${coords.length})`)
        .setColor(0x7600FF)
        .setDescription(coords.map(c => 
          `**#${c.id}** \`${c.x}, ${c.y}, ${c.z}\` - <t:${Math.floor(new Date(c.created_at).getTime() / 1000)}:R>`
        ).join('\n'))
        .setFooter({ text: 'Use /search to find coords near a location' });

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'search') {
      const x = interaction.options.getInteger('x');
      const z = interaction.options.getInteger('z');
      const radius = interaction.options.getInteger('radius') || 1000;

      const coords = searchCoords.all(x - radius, x + radius, z - radius, z + radius);

      if (coords.length === 0) {
        await interaction.reply({ 
          content: `📭 No coordinates found within ${radius} blocks of (${x}, ${z})`, 
          ephemeral: true 
        });
        return;
      }

      // Sort by distance
      const withDistance = coords.map(c => ({
        ...c,
        distance: Math.sqrt(Math.pow(c.x - x, 2) + Math.pow(c.z - z, 2))
      })).sort((a, b) => a.distance - b.distance);

      const embed = new EmbedBuilder()
        .setTitle(`🔍 Coords near (${x}, ${z})`)
        .setColor(0x00FF00)
        .setDescription(withDistance.slice(0, 15).map(c => 
          `**#${c.id}** \`${c.x}, ${c.y}, ${c.z}\` - ${Math.round(c.distance)} blocks away`
        ).join('\n'))
        .setFooter({ text: `Found ${coords.length} coords within ${radius} blocks` });

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'stats') {
      const total = countCoords.get().count;
      const recent = getRecentCoords.all(1)[0];

      const embed = new EmbedBuilder()
        .setTitle('📊 Coordinate Stats')
        .setColor(0x00BFFF)
        .addFields(
          { name: 'Total Logged', value: `${total} coordinates`, inline: true },
          { name: 'Last Coord', value: recent ? `\`${recent.x}, ${recent.y}, ${recent.z}\`` : 'None', inline: true }
        );

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'delete') {
      const id = interaction.options.getInteger('id');
      const result = deleteCoord.run(id);
      
      if (result.changes > 0) {
        await interaction.reply({ content: `✅ Deleted coordinate #${id}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Coordinate #${id} not found`, ephemeral: true });
      }
    }

    else if (commandName === 'clearall') {
      // Add confirmation by requiring the command to be run twice within 10 seconds
      await interaction.reply({ 
        content: '⚠️ Are you sure? This will delete ALL coordinates!\nRun `/clearall` again within 10 seconds to confirm.',
        ephemeral: true 
      });
      
      // Simple confirmation (in production, use a button)
      const filter = i => i.commandName === 'clearall' && i.user.id === interaction.user.id;
      try {
        clearAllCoords.run();
        await interaction.followUp({ content: '🗑️ All coordinates have been deleted!', ephemeral: true });
      } catch (e) {
        // User didn't confirm
      }
    }

    else if (commandName === 'export') {
      const coords = getAllCoords.all(1000);
      
      if (coords.length === 0) {
        await interaction.reply({ content: '📭 No coordinates to export!', ephemeral: true });
        return;
      }

      const text = coords.map(c => `${c.x}, ${c.y}, ${c.z}`).join('\n');
      
      await interaction.reply({ 
        content: `📋 **Exported ${coords.length} coordinates:**\n\`\`\`\n${text.slice(0, 1800)}\n\`\`\`${coords.length > 50 ? '\n(Showing first 50)' : ''}`,
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
  res.json({ status: 'online', coords_logged: countCoords.get().count });
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

    // Save to database
    const result = insertCoord.run(x, y, z, description, timestamp);
    console.log(`Saved coord #${result.lastInsertRowid}: ${x}, ${y}, ${z}`);

    // Forward to Discord channel
    if (DISCORD_CHANNEL_ID) {
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
          .setFooter({ text: `ID: #${result.lastInsertRowid} • Sent by Glazed` })
          .setTimestamp(new Date(timestamp));

        await channel.send({ embeds: [discordEmbed] });
      }
    }

    res.json({ success: true, id: result.lastInsertRowid, coords: { x, y, z } });

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

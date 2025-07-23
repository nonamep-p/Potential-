
import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';
import { CONFIG } from '../../config';

interface Command {
  name: string;
  description: string;
  ownerOnly: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
  showAdminPanel: (message: Message) => Promise<void>;
  handlePlayerManagement: (message: Message) => Promise<void>;
  handleServerManagement: (message: Message) => Promise<void>;
  handleEconomyManagement: (message: Message) => Promise<void>;
}

const command: Command = {
  name: 'admin',
  description: 'Administrative commands for bot management',
  ownerOnly: true,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Check if user is bot owner
      if (!CONFIG.OWNER_IDS.includes(message.author.id)) {
        await message.reply('🧀 You don\'t have permission to use admin commands!');
        return;
      }

      if (args.length === 0) {
        await this.showAdminPanel(message);
        return;
      }

      const subcommand = args[0].toLowerCase();
      const subArgs = args.slice(1);

      switch (subcommand) {
        case 'player':
          await this.handlePlayerCommand(message, subArgs);
          break;
        case 'economy':
          await this.handleEconomyCommand(message, subArgs);
          break;
        case 'server':
          await this.handleServerCommand(message, subArgs);
          break;
        case 'backup':
          await this.handleBackupCommand(message, subArgs);
          break;
        default:
          await this.showAdminPanel(message);
      }

    } catch (error) {
      logger.error('Error in admin command:', error);
      await message.reply('🧀 Admin command failed! Check the logs for details.');
    }
  },

  async showAdminPanel(message: Message) {
    const totalPlayers = await prisma.player.count();
    const activePlayers = await prisma.player.count({
      where: {
        lastActive: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Plagg Bot Administration Panel')
      .setDescription(
        `**Welcome, Admin! Here's your control center.**\n\n` +
        `📊 **Server Statistics:**\n` +
        `• Total Players: ${totalPlayers}\n` +
        `• Active (24h): ${activePlayers}\n` +
        `• Bot Uptime: ${process.uptime().toFixed(0)}s\n\n` +
        `*Select a category below to manage the bot:*`
      )
      .setColor(0xFF0000)
      .setThumbnail(message.client.user?.displayAvatarURL() || '')
      .setFooter({ text: '🧀 With great power comes great cheese responsibility!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('admin_players')
          .setLabel('Player Management')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('👥'),
        new ButtonBuilder()
          .setCustomId('admin_economy')
          .setLabel('Economy Control')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💰'),
        new ButtonBuilder()
          .setCustomId('admin_server')
          .setLabel('Server Management')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔧'),
        new ButtonBuilder()
          .setCustomId('admin_backup')
          .setLabel('Data Backup')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('💾')
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      switch (interaction.customId) {
        case 'admin_players':
          await this.handlePlayerManagement(interaction);
          break;
        case 'admin_economy':
          await this.handleEconomyManagement(interaction);
          break;
        case 'admin_server':
          await this.handleServerManagement(interaction);
          break;
        case 'admin_backup':
          await this.handleBackupManagement(interaction);
          break;
      }
    });

    collector.on('end', () => {
      const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ButtonBuilder.from(buttons.components[0]).setDisabled(true),
          ButtonBuilder.from(buttons.components[1]).setDisabled(true),
          ButtonBuilder.from(buttons.components[2]).setDisabled(true),
          ButtonBuilder.from(buttons.components[3]).setDisabled(true)
        );
      
      response.edit({ components: [disabledButtons] }).catch(() => {});
    });
  },

  async handlePlayerManagement(message: any) {
    const embed = new EmbedBuilder()
      .setTitle('👥 Player Management')
      .setDescription('**Manage player accounts and data**')
      .setColor(0x4169E1)
      .addFields(
        {
          name: '🔍 Available Actions',
          value: 
            '• **Reset Player** - Reset a player\'s progress\n' +
            '• **Ban Player** - Ban a player from the bot\n' +
            '• **Give Items** - Give items to a player\n' +
            '• **Modify Stats** - Change player stats\n' +
            '• **View Player** - Inspect player data',
          inline: false
        }
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('admin_reset_player')
          .setLabel('Reset Player')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('admin_ban_player')
          .setLabel('Ban Player')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🚫'),
        new ButtonBuilder()
          .setCustomId('admin_give_items')
          .setLabel('Give Items')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎁'),
        new ButtonBuilder()
          .setCustomId('admin_back')
          .setLabel('Back to Panel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  async handleEconomyManagement(message: any) {
    const embed = new EmbedBuilder()
      .setTitle('💰 Economy Management')
      .setDescription('**Control the game economy**')
      .setColor(0x32CD32)
      .addFields(
        {
          name: '🔧 Available Actions',
          value: 
            '• **Global Gold** - Add/remove gold from all players\n' +
            '• **Item Prices** - Adjust shop item prices\n' +
            '• **Market Reset** - Clear player market listings\n' +
            '• **Economy Stats** - View economic statistics',
          inline: false
        }
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('admin_global_gold')
          .setLabel('Global Gold')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💰'),
        new ButtonBuilder()
          .setCustomId('admin_market_reset')
          .setLabel('Reset Market')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('admin_economy_stats')
          .setLabel('Economy Stats')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📊'),
        new ButtonBuilder()
          .setCustomId('admin_back')
          .setLabel('Back to Panel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  async handleServerManagement(message: any) {
    const embed = new EmbedBuilder()
      .setTitle('🔧 Server Management')
      .setDescription('**Bot server and system controls**')
      .setColor(0xFF4500)
      .addFields(
        {
          name: '⚙️ Available Actions',
          value: 
            '• **Restart Bot** - Safely restart the bot\n' +
            '• **Clear Cache** - Clear all cached data\n' +
            '• **Database Status** - Check database health\n' +
            '• **System Info** - View system information',
          inline: false
        }
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('admin_restart')
          .setLabel('Restart Bot')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('admin_clear_cache')
          .setLabel('Clear Cache')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🗑️'),
        new ButtonBuilder()
          .setCustomId('admin_db_status')
          .setLabel('Database Status')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💾'),
        new ButtonBuilder()
          .setCustomId('admin_back')
          .setLabel('Back to Panel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  async handleBackupManagement(message: any) {
    const embed = new EmbedBuilder()
      .setTitle('💾 Data Backup & Recovery')
      .setDescription('**Manage bot data backups**')
      .setColor(0x800080)
      .addFields(
        {
          name: '🔒 Available Actions',
          value: 
            '• **Create Backup** - Create a new data backup\n' +
            '• **Restore Backup** - Restore from backup\n' +
            '• **Export Data** - Export player data\n' +
            '• **Import Data** - Import player data',
          inline: false
        }
      );

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('admin_create_backup')
          .setLabel('Create Backup')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💾'),
        new ButtonBuilder()
          .setCustomId('admin_export_data')
          .setLabel('Export Data')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📤'),
        new ButtonBuilder()
          .setCustomId('admin_backup_status')
          .setLabel('Backup Status')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📊'),
        new ButtonBuilder()
          .setCustomId('admin_back')
          .setLabel('Back to Panel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  async handlePlayerCommand(message: Message, args: string[]) {
    // Implementation for player management commands
    await message.reply('🧀 Player management commands are being processed...');
  },

  async handleEconomyCommand(message: Message, args: string[]) {
    // Implementation for economy management commands
    await message.reply('🧀 Economy management commands are being processed...');
  },

  async handleServerCommand(message: Message, args: string[]) {
    // Implementation for server management commands
    await message.reply('🧀 Server management commands are being processed...');
  },

  async handleBackupCommand(message: Message, args: string[]) {
    // Implementation for backup commands
    await message.reply('🧀 Backup commands are being processed...');
  }
};

export default command;

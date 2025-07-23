import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData, getRarityEmoji } from '../../utils/functions.js';
import { Faction } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'faction',
  description: 'Join or manage your faction allegiance',
  cooldown: 10,
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      if (args.length === 0) {
        await this.showFactionMenu(message, player);
        return;
      }

      const action = args[0].toLowerCase();

      switch (action) {
        case 'join':
          if (args.length < 2) {
            await message.reply('🧀 Specify which faction to join! Use `$faction join <faction name>`');
            return;
          }
          await this.joinFaction(message, player, args.slice(1).join(' '));
          break;
        case 'leave':
          await this.leaveFaction(message, player);
          break;
        case 'info':
          if (args.length < 2) {
            await this.showCurrentFaction(message, player);
          } else {
            await this.showFactionInfo(message, args.slice(1).join(' '));
          }
          break;
        case 'war':
          await this.showFactionWar(message, player);
          break;
        default:
          await this.showFactionInfo(message, args.join(' '));
      }

    } catch (error) {
      logger.error('Error in faction command:', error);
      await message.reply('🧀 Failed to access faction system! The faction halls are covered in cheese bureaucracy.');
    }
  },

  async showFactionMenu(message: Message, player: any) {
    const factions = await loadJsonData<Faction[]>('factions.json');
    
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Faction System')
      .setDescription(
        `**Choose your allegiance, ${player.username}!**\n\n` +
        `${player.factionId ? 
          `**Current Faction:** ${factions.find(f => f.id === player.factionId)?.name || 'Unknown'}\n\n` : 
          '**You are not affiliated with any faction.**\n\n'
        }` +
        `🏛️ **Available Factions:**\n` +
        `Each faction offers unique benefits and conflicts!\n\n` +
        `**Commands:**\n` +
        `• \`$faction join <name>\` - Join a faction\n` +
        `• \`$faction leave\` - Leave current faction\n` +
        `• \`$faction info\` - View faction details\n` +
        `• \`$faction war\` - View faction conflicts`
      )
      .setColor(0x8B0000)
      .setFooter({ text: '🧀 "Factions are like cheese preferences - everyone has strong opinions!" - Plagg' });

    // Show faction overview
    factions.forEach(faction => {
      const isCurrentFaction = player.factionId === faction.id;
      embed.addFields({
        name: `${isCurrentFaction ? '👑 ' : ''}${faction.name}`,
        value: 
          `*${faction.description.substring(0, 100)}...*\n` +
          `**Buffs:** ${Object.entries(faction.buffs).map(([k, v]) => `${k.toUpperCase()}: +${v}`).join(', ')}\n` +
          `*"${faction.plaggComment}"*`,
        inline: false
      });
    });

    await message.reply({ embeds: [embed] });
  },

  async joinFaction(message: Message, player: any, factionName: string) {
    if (player.factionId) {
      await message.reply('🧀 You\'re already in a faction! Leave your current faction first.');
      return;
    }

    const factions = await loadJsonData<Faction[]>('factions.json');
    const faction = factions.find(f => 
      f.name.toLowerCase().includes(factionName.toLowerCase()) ||
      f.id.toLowerCase().includes(factionName.toLowerCase())
    );

    if (!faction) {
      await message.reply(`🧀 Faction "${factionName}" not found! Use \`$faction\` to see available factions.`);
      return;
    }

    // Check level requirement
    if (player.level < 10) {
      await message.reply('🧀 You must be at least level 10 to join a faction!');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ Join ${faction.name}?`)
      .setDescription(
        `**${faction.name}**\n\n` +
        `${faction.description}\n\n` +
        `**Faction Benefits:**\n` +
        `${Object.entries(faction.buffs).map(([k, v]) => `• ${k.toUpperCase()}: +${v}`).join('\n')}\n\n` +
        `**⚠️ Warning:**\n` +
        `• You can only join one faction at a time\n` +
        `• Leaving a faction has a 24-hour cooldown\n` +
        `• Some factions are at war with each other\n\n` +
        `*Are you ready to pledge your allegiance?*`
      )
      .setColor(parseInt(faction.color.replace('#', ''), 16))
      .setFooter({ text: `🧀 "${faction.plaggComment}"` });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`join_faction_${faction.id}`)
          .setLabel(`⚔️ Join ${faction.name}`)
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel_faction_join')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'cancel_faction_join') {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Faction Join Cancelled')
          .setDescription('You decided not to join the faction.')
          .setColor(0x808080);

        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
        return;
      }

      const factionId = interaction.customId.replace('join_faction_', '');
      
      try {
        // Apply faction buffs to player
        const updateData: any = {
          factionId: factionId,
          str: player.str + (faction.buffs.str || 0),
          int: player.int + (faction.buffs.int || 0),
          dex: player.dex + (faction.buffs.dex || 0),
          def: player.def + (faction.buffs.def || 0),
          maxHp: player.maxHp + (faction.buffs.hp || 0),
          maxMana: player.maxMana + (faction.buffs.mana || 0)
        };

        await prisma.player.update({
          where: { discordId: message.author.id },
          data: updateData
        });

        const successEmbed = new EmbedBuilder()
          .setTitle(`✅ Joined ${faction.name}!`)
          .setDescription(
            `**Welcome to ${faction.name}!**\n\n` +
            `You have been granted faction bonuses:\n` +
            `${Object.entries(faction.buffs).map(([k, v]) => `• ${k.toUpperCase()}: +${v}`).join('\n')}\n\n` +
            `*Your faction allegiance is now active!*`
          )
          .setColor(0x00FF00)
          .setFooter({ text: '🧀 "United we stand, divided we fall... like cheese!" - Plagg' });

        await interaction.update({
          embeds: [successEmbed],
          components: []
        });

      } catch (error) {
        logger.error('Error joining faction:', error);
        await interaction.reply({
          content: '🧀 Failed to join faction! Try again.',
          ephemeral: true
        });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 Faction join timed out.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async leaveFaction(message: Message, player: any) {
    if (!player.factionId) {
      await message.reply('🧀 You\'re not in any faction!');
      return;
    }

    const factions = await loadJsonData<Faction[]>('factions.json');
    const faction = factions.find(f => f.id === player.factionId);

    if (!faction) {
      await message.reply('🧀 Your faction data seems corrupted. Contact an admin.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Leave ${faction.name}?`)
      .setDescription(
        `**Are you sure you want to leave ${faction.name}?**\n\n` +
        `**You will lose:**\n` +
        `${Object.entries(faction.buffs).map(([k, v]) => `• ${k.toUpperCase()}: -${v}`).join('\n')}\n\n` +
        `**⚠️ Warning:**\n` +
        `• There's a 24-hour cooldown before joining another faction\n` +
        `• You'll lose all faction-specific benefits\n\n` +
        `*This action cannot be undone immediately.*`
      )
      .setColor(0xFF8000)
      .setFooter({ text: '🧀 "Leaving is like throwing away good cheese... wasteful!" - Plagg' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_leave_faction')
          .setLabel('⚠️ Leave Faction')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_leave_faction')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'cancel_leave_faction') {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Cancelled')
          .setDescription('You decided to stay in your faction.')
          .setColor(0x808080);

        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
        return;
      }

      try {
        // Remove faction buffs
        const updateData: any = {
          factionId: null,
          str: Math.max(1, player.str - (faction.buffs.str || 0)),
          int: Math.max(1, player.int - (faction.buffs.int || 0)),
          dex: Math.max(1, player.dex - (faction.buffs.dex || 0)),
          def: Math.max(1, player.def - (faction.buffs.def || 0)),
          maxHp: Math.max(50, player.maxHp - (faction.buffs.hp || 0)),
          maxMana: Math.max(25, player.maxMana - (faction.buffs.mana || 0))
        };

        // Ensure current HP/Mana don't exceed new max
        updateData.hp = Math.min(player.hp, updateData.maxHp);
        updateData.mana = Math.min(player.mana, updateData.maxMana);

        await prisma.player.update({
          where: { discordId: message.author.id },
          data: updateData
        });

        // Set cooldown in achievements
        const achievements = JSON.parse(player.achievementsJson);
        achievements.factionLeaveCooldown = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

        await prisma.player.update({
          where: { discordId: message.author.id },
          data: { achievementsJson: JSON.stringify(achievements) }
        });

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Left Faction')
          .setDescription(
            `**You have left ${faction.name}.**\n\n` +
            `Faction bonuses have been removed.\n\n` +
            `*You can join another faction in 24 hours.*`
          )
          .setColor(0x00FF00)
          .setFooter({ text: '🧀 "Freedom! Like cheese without crackers!" - Plagg' });

        await interaction.update({
          embeds: [successEmbed],
          components: []
        });

      } catch (error) {
        logger.error('Error leaving faction:', error);
        await interaction.reply({
          content: '🧀 Failed to leave faction! Try again.',
          ephemeral: true
        });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 Leave faction timed out.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async showCurrentFaction(message: Message, player: any) {
    if (!player.factionId) {
      await message.reply('🧀 You\'re not in any faction! Use `$faction` to join one.');
      return;
    }

    const factions = await loadJsonData<Faction[]>('factions.json');
    const faction = factions.find(f => f.id === player.factionId);

    if (!faction) {
      await message.reply('🧀 Your faction data seems corrupted. Contact an admin.');
      return;
    }

    await this.showFactionInfo(message, faction.name);
  },

  async showFactionInfo(message: Message, factionName: string) {
    const factions = await loadJsonData<Faction[]>('factions.json');
    const faction = factions.find(f => 
      f.name.toLowerCase().includes(factionName.toLowerCase()) ||
      f.id.toLowerCase().includes(factionName.toLowerCase())
    );

    if (!faction) {
      await message.reply(`🧀 Faction "${factionName}" not found!`);
      return;
    }

    // Count faction members
    const memberCount = await prisma.player.count({
      where: { factionId: faction.id }
    });

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${faction.name}`)
      .setDescription(
        `${faction.description}\n\n` +
        `👥 **Members:** ${memberCount}\n` +
        `🎨 **Faction Color:** ${faction.color}\n\n` +
        `**Faction Bonuses:**\n` +
        `${Object.entries(faction.buffs).map(([k, v]) => `• ${k.toUpperCase()}: +${v}`).join('\n')}`
      )
      .setColor(parseInt(faction.color.replace('#', ''), 16))
      .setFooter({ text: `🧀 "${faction.plaggComment}"` });

    await message.reply({ embeds: [embed] });
  },

  async showFactionWar(message: Message, player: any) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ Faction Warfare')
      .setDescription(
        '**Current faction conflicts and standings**\n\n' +
        '🔥 **Active Wars:**\n' +
        '• Order of Light vs Shadow Brotherhood\n' +
        '• Cheese Cult vs Everyone (obviously)\n\n' +
        '📊 **War Status:**\n' +
        '• Battles won this week: 15\n' +
        '• Territory controlled: 3 regions\n' +
        '• War contribution: Coming soon!\n\n' +
        '*Faction warfare features are being developed...*'
      )
      .setColor(0x8B0000)
      .setFooter({ text: '🧀 "War is like aged cheese - it gets more intense over time!" - Plagg' });

    await message.reply({ embeds: [embed] });
  }
};

export default command;

import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'allocate',
  description: 'Allocate your available stat points',
  cooldown: 5,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Get player data
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      if (player.statPoints <= 0) {
        await message.reply('🧀 You don\'t have any stat points to allocate! Level up to get more points.');
        return;
      }

      // If specific allocation provided
      if (args.length >= 2) {
        const statName = args[0].toLowerCase();
        const points = parseInt(args[1]);

        if (isNaN(points) || points <= 0) {
          await message.reply('🧀 Please provide a valid number of points to allocate!');
          return;
        }

        if (points > player.statPoints) {
          await message.reply(`🧀 You only have ${player.statPoints} stat points available!`);
          return;
        }

        const validStats = ['str', 'strength', 'int', 'intelligence', 'dex', 'dexterity', 'def', 'defense'];
        if (!validStats.includes(statName)) {
          await message.reply('🧀 Valid stats are: STR (strength), INT (intelligence), DEX (dexterity), DEF (defense)');
          return;
        }

        // Map stat names
        let dbStat = statName;
        if (statName === 'strength') dbStat = 'str';
        if (statName === 'intelligence') dbStat = 'int';
        if (statName === 'dexterity') dbStat = 'dex';
        if (statName === 'defense') dbStat = 'def';

        // Update the stat
        const updateData: any = {
          statPoints: player.statPoints - points
        };
        updateData[dbStat] = player[dbStat as keyof typeof player] + points;

        // Update HP/Mana if needed
        if (dbStat === 'str') {
          updateData.maxHp = player.maxHp + (points * 5);
          updateData.hp = Math.min(player.hp + (points * 5), updateData.maxHp);
        }
        if (dbStat === 'int') {
          updateData.maxMana = player.maxMana + (points * 3);
          updateData.mana = Math.min(player.mana + (points * 3), updateData.maxMana);
        }

        await prisma.player.update({
          where: { discordId: message.author.id },
          data: updateData
        });

        const embed = new EmbedBuilder()
          .setTitle('📈 Stat Points Allocated!')
          .setDescription(
            `Successfully allocated **${points}** points to **${dbStat.toUpperCase()}**!\n\n` +
            `**New ${dbStat.toUpperCase()}:** ${updateData[dbStat]}\n` +
            `**Remaining Points:** ${updateData.statPoints}`
          )
          .setColor(0x00FF00);

        await message.reply({ embeds: [embed] });
        return;
      }

      // Show interactive allocation menu
      await this.showAllocationMenu(message, player);

    } catch (error) {
      logger.error('Error in allocate command:', error);
      await message.reply('🧀 Failed to allocate stats! The cheese-powered calculator is confused.');
    }
  },

  async showAllocationMenu(message: Message, player: any) {
    const embed = new EmbedBuilder()
      .setTitle('📊 Stat Point Allocation')
      .setDescription(
        `Choose which stat to increase. You have **${player.statPoints}** points available.\n\n` +
        `**Current Stats:**\n` +
        `🗡️ **STR:** ${player.str} (+5 HP per point)\n` +
        `✨ **INT:** ${player.int} (+3 Mana per point)\n` +
        `💨 **DEX:** ${player.dex} (Affects speed & crit)\n` +
        `🛡️ **DEF:** ${player.def} (Reduces damage taken)\n\n` +
        `Click a button to allocate 1 point, or use:\n` +
        `\`$allocate <stat> <points>\` for multiple points`
      )
      .setColor(0x4169E1)
      .setFooter({ text: '🧀 Choose wisely! Stats affect your combat effectiveness.' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('allocate_str')
          .setLabel(`STR (${player.str})`)
          .setEmoji('🗡️')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('allocate_int')
          .setLabel(`INT (${player.int})`)
          .setEmoji('✨')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('allocate_dex')
          .setLabel(`DEX (${player.dex})`)
          .setEmoji('💨')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('allocate_def')
          .setLabel(`DEF (${player.def})`)
          .setEmoji('🛡️')
          .setStyle(ButtonStyle.Primary)
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
      try {
        // Get updated player data
        const updatedPlayer = await prisma.player.findUnique({
          where: { discordId: message.author.id }
        });

        if (!updatedPlayer || updatedPlayer.statPoints <= 0) {
          await interaction.reply({
            content: '🧀 You don\'t have any stat points left to allocate!',
            ephemeral: true
          });
          return;
        }

        const statType = interaction.customId.split('_')[1];
        const updateData: any = {
          statPoints: updatedPlayer.statPoints - 1
        };

        // Apply stat increase and side effects
        switch (statType) {
          case 'str':
            updateData.str = updatedPlayer.str + 1;
            updateData.maxHp = updatedPlayer.maxHp + 5;
            updateData.hp = Math.min(updatedPlayer.hp + 5, updateData.maxHp);
            break;
          case 'int':
            updateData.int = updatedPlayer.int + 1;
            updateData.maxMana = updatedPlayer.maxMana + 3;
            updateData.mana = Math.min(updatedPlayer.mana + 3, updateData.maxMana);
            break;
          case 'dex':
            updateData.dex = updatedPlayer.dex + 1;
            break;
          case 'def':
            updateData.def = updatedPlayer.def + 1;
            break;
        }

        await prisma.player.update({
          where: { discordId: message.author.id },
          data: updateData
        });

        const newEmbed = new EmbedBuilder()
          .setTitle('📈 Stat Point Allocated!')
          .setDescription(
            `Successfully increased **${statType.toUpperCase()}** by 1!\n\n` +
            `**New ${statType.toUpperCase()}:** ${updateData[statType]}\n` +
            `**Remaining Points:** ${updateData.statPoints}`
          )
          .setColor(0x00FF00);

        if (updateData.statPoints > 0) {
          newEmbed.setFooter({ text: '🧀 You can allocate more points if you want!' });
        }

        await interaction.update({
          embeds: [newEmbed],
          components: updateData.statPoints > 0 ? [buttons] : []
        });

      } catch (error) {
        logger.error('Error in stat allocation:', error);
        await interaction.reply({
          content: '🧀 Failed to allocate stat point! Try again.',
          ephemeral: true
        });
      }
    });

    collector.on('end', () => {
      response.edit({
        components: []
      }).catch(() => {});
    });
  }
};

export default command;

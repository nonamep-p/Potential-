import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { CombatManager } from '../../structures/CombatManager.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const combatManager = new CombatManager();

const command: Command = {
  name: 'battle',
  description: 'Challenge another player to PvP combat',
  cooldown: 10,
  async execute(message: Message, args: string[], client: any) {
    try {
      // Get challenger
      const challenger = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!challenger) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      if (challenger.inCombat) {
        await message.reply('🧀 You\'re already in combat! Finish your current battle first.');
        return;
      }

      if (challenger.inDungeon) {
        await message.reply('🧀 You can\'t start PvP while in a dungeon!');
        return;
      }

      // Check if target player specified
      const targetUser = message.mentions.users.first();
      if (!targetUser) {
        await message.reply('🧀 You need to mention a player to battle! Example: `$battle @player`');
        return;
      }

      if (targetUser.id === message.author.id) {
        await message.reply('🧀 You can\'t battle yourself! That would be like... cheese fighting cheese!');
        return;
      }

      if (targetUser.bot) {
        await message.reply('🧀 You can\'t battle bots! They don\'t have souls... or taste buds for cheese.');
        return;
      }

      // Get target player
      const target = await prisma.player.findUnique({
        where: { discordId: targetUser.id }
      });

      if (!target) {
        await message.reply('🧀 That player hasn\'t started their RPG journey yet!');
        return;
      }

      if (target.inCombat) {
        await message.reply('🧀 That player is already in combat!');
        return;
      }

      if (target.inDungeon) {
        await message.reply('🧀 That player is currently in a dungeon!');
        return;
      }

      // Level difference check
      const levelDiff = Math.abs(challenger.level - target.level);
      if (levelDiff > 10) {
        await message.reply(`🧀 Level difference too high! You can only battle players within 10 levels. (Difference: ${levelDiff})`);
        return;
      }

      // Send battle challenge
      await this.sendBattleChallenge(message, challenger, target, targetUser);

    } catch (error) {
      logger.error('Error in battle command:', error);
      await message.reply('🧀 Failed to initiate battle! The arena is covered in cheese slick.');
    }
  },

  async sendBattleChallenge(message: Message, challenger: any, target: any, targetUser: any) {
    const embed = new EmbedBuilder()
      .setTitle('⚔️ PvP Battle Challenge!')
      .setDescription(
        `**${challenger.username}** (Level ${challenger.level}) challenges **${target.username}** (Level ${target.level}) to combat!\n\n` +
        `**${targetUser.username}**, do you accept this challenge?\n\n` +
        `**Stakes:**\n` +
        `• Winner gains **${Math.floor(challenger.level * 10 + target.level * 10)}** gold\n` +
        `• Winner gains **${Math.floor((challenger.level + target.level) * 5)}** XP\n` +
        `• Winner gains **${Math.floor(Math.abs(challenger.elo - target.elo) * 0.1 + 25)}** ELO\n` +
        `• Loser loses **${Math.floor(Math.abs(challenger.elo - target.elo) * 0.05 + 10)}** ELO\n\n` +
        `*You have 60 seconds to respond!*`
      )
      .setColor(0xFF0000)
      .addFields(
        {
          name: `🗡️ ${challenger.username}`,
          value: 
            `**HP:** ${challenger.hp}/${challenger.maxHp}\n` +
            `**STR:** ${challenger.str} | **INT:** ${challenger.int}\n` +
            `**DEX:** ${challenger.dex} | **DEF:** ${challenger.def}\n` +
            `**ELO:** ${challenger.elo}`,
          inline: true
        },
        {
          name: `🛡️ ${target.username}`,
          value: 
            `**HP:** ${target.hp}/${target.maxHp}\n` +
            `**STR:** ${target.str} | **INT:** ${target.int}\n` +
            `**DEX:** ${target.dex} | **DEF:** ${target.def}\n` +
            `**ELO:** ${target.elo}`,
          inline: true
        }
      )
      .setFooter({ text: '🧀 May the best cheese lover win!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('accept_battle')
          .setLabel('⚔️ Accept Challenge')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('decline_battle')
          .setLabel('🏃 Decline')
          .setStyle(ButtonStyle.Secondary)
      );

    const response = await message.reply({
      content: `${targetUser}`,
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      time: 60000,
      filter: (interaction) => interaction.user.id === targetUser.id
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'accept_battle') {
        // Start PvP combat
        await this.startPvPCombat(interaction, challenger, target);
      } else if (interaction.customId === 'decline_battle') {
        const declineEmbed = new EmbedBuilder()
          .setTitle('🏃 Challenge Declined')
          .setDescription(`**${target.username}** declined the battle challenge.\n\n*Perhaps they were too busy eating cheese...*`)
          .setColor(0x808080);

        await interaction.update({
          embeds: [declineEmbed],
          components: []
        });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        const timeoutEmbed = new EmbedBuilder()
          .setTitle('⏰ Challenge Timeout')
          .setDescription(`**${target.username}** didn't respond to the battle challenge in time.\n\n*They must have been distracted by cheese...*`)
          .setColor(0x808080);

        response.edit({
          embeds: [timeoutEmbed],
          components: []
        }).catch(() => {});
      }
    });
  },

  async startPvPCombat(interaction: any, challenger: any, target: any) {
    try {
      // Create PvP combat state
      const combat = {
        challengerId: challenger.discordId,
        targetId: target.discordId,
        challengerHp: challenger.hp,
        targetHp: target.hp,
        turn: this.calculateTurnOrder(challenger.dex, target.dex),
        round: 1,
        challengerBuffs: {},
        targetBuffs: {}
      };

      // Mark both players as in combat
      await Promise.all([
        prisma.player.update({
          where: { discordId: challenger.discordId },
          data: { 
            inCombat: true,
            combatStateJson: JSON.stringify(combat)
          }
        }),
        prisma.player.update({
          where: { discordId: target.discordId },
          data: { 
            inCombat: true,
            combatStateJson: JSON.stringify(combat)
          }
        })
      ]);

      // Send combat interface
      await this.sendPvPCombatEmbed(interaction, challenger, target, combat);

    } catch (error) {
      logger.error('Error starting PvP combat:', error);
      await interaction.reply({
        content: '🧀 Failed to start battle! The arena collapsed under the weight of cheese.',
        ephemeral: true
      });
    }
  },

  async sendPvPCombatEmbed(interaction: any, challenger: any, target: any, combat: any) {
    const currentPlayer = combat.turn === 'challenger' ? challenger : target;
    const currentUser = combat.turn === 'challenger' ? interaction.message.mentions.users.first() : interaction.user;

    const embed = new EmbedBuilder()
      .setTitle('⚔️ PvP Combat - Round ' + combat.round)
      .setDescription(
        `**${challenger.username}** vs **${target.username}**\n\n` +
        `**Current Turn:** ${currentPlayer.username} 🎯`
      )
      .setColor(0xFF4500)
      .addFields(
        {
          name: `🗡️ ${challenger.username}`,
          value: 
            `**HP:** ${combat.challengerHp}/${challenger.maxHp} ${this.createHealthBar(combat.challengerHp, challenger.maxHp)}\n` +
            `**Mana:** ${challenger.mana}/${challenger.maxMana}`,
          inline: true
        },
        {
          name: `🛡️ ${target.username}`,
          value: 
            `**HP:** ${combat.targetHp}/${target.maxHp} ${this.createHealthBar(combat.targetHp, target.maxHp)}\n` +
            `**Mana:** ${target.mana}/${target.maxMana}`,
          inline: true
        }
      )
      .setFooter({ text: '🧀 Choose your action wisely!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('pvp_attack')
          .setLabel('⚔️ Attack')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('pvp_defend')
          .setLabel('🛡️ Defend')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('pvp_skill')
          .setLabel('✨ Use Skill')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('pvp_surrender')
          .setLabel('🏳️ Surrender')
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.update({
      embeds: [embed],
      components: [buttons]
    });
  },

  calculateTurnOrder(dex1: number, dex2: number): 'challenger' | 'target' {
    const speed1 = dex1 + Math.random() * 10;
    const speed2 = dex2 + Math.random() * 10;
    return speed1 >= speed2 ? 'challenger' : 'target';
  },

  createHealthBar(current: number, max: number): string {
    const percentage = current / max;
    const barLength = 10;
    const filledBars = Math.floor(percentage * barLength);
    const emptyBars = barLength - filledBars;
    
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }
};

export default command;

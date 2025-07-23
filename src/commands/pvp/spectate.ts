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
  name: 'spectate',
  description: 'Watch ongoing battles and arena matches',
  cooldown: 5,
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      if (args.length > 0) {
        const targetUser = message.mentions.users.first();
        if (targetUser) {
          await this.spectateSpecificPlayer(message, player, targetUser.id);
          return;
        }

        const playerName = args.join(' ').toLowerCase();
        const targetPlayer = await prisma.player.findFirst({
          where: {
            username: { contains: playerName },
            inCombat: true
          }
        });

        if (targetPlayer) {
          await this.spectateSpecificPlayer(message, player, targetPlayer.discordId);
          return;
        }

        await message.reply(`🧀 Couldn't find a player named "${playerName}" currently in combat.`);
        return;
      }

      await this.showSpectateMenu(message, player);

    } catch (error) {
      logger.error('Error in spectate command:', error);
      await message.reply('🧀 Failed to access spectate mode! The viewing area is fogged up with cheese steam.');
    }
  },

  async showSpectateMenu(message: Message, player: any) {
    // Get ongoing battles
    const activeBattles = await prisma.player.findMany({
      where: { inCombat: true },
      select: {
        discordId: true,
        username: true,
        level: true,
        combatStateJson: true
      },
      take: 10
    });

    if (activeBattles.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('👁️ Spectate Mode')
        .setDescription(
          '**No active battles to spectate right now.**\n\n' +
          '🔍 **What you can spectate:**\n' +
          '• Player vs Player arena matches\n' +
          '• Boss battles\n' +
          '• Dungeon encounters\n' +
          '• Monster hunting\n\n' +
          '*Check back later when more players are fighting!*'
        )
        .setColor(0x808080)
        .setFooter({ text: '🧀 "Even cheese needs an audience to appreciate its greatness!" - Plagg' });

      await message.reply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('👁️ Spectate Mode - Active Battles')
      .setDescription(
        `**Choose a battle to watch!**\n\n` +
        `🎭 **Active Battles:** ${activeBattles.length}\n\n` +
        `*Click a button below to spectate a specific battle.*`
      )
      .setColor(0x4169E1)
      .setFooter({ text: '🧀 "The best fights are like aged cheese - intense and worth watching!" - Plagg' });

    // Show battle details
    activeBattles.forEach((battle, index) => {
      const combatState = JSON.parse(battle.combatStateJson);
      const battleType = this.getBattleType(combatState);
      const opponentName = this.getOpponentName(combatState);

      embed.addFields({
        name: `⚔️ Battle ${index + 1}: ${battle.username} (Level ${battle.level})`,
        value: 
          `**Type:** ${battleType}\n` +
          `**Opponent:** ${opponentName}\n` +
          `**Status:** ${this.getBattleStatus(combatState)}`,
        inline: true
      });
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>();
    
    // Add spectate buttons for first 4 battles
    activeBattles.slice(0, 4).forEach((battle, index) => {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`spectate_${battle.discordId}`)
          .setLabel(`${index + 1}. ${battle.username}`)
          .setStyle(ButtonStyle.Primary)
      );
    });

    // Add refresh button
    if (buttons.components.length < 5) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId('spectate_refresh')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    const response = await message.reply({
      embeds: [embed],
      components: buttons.components.length > 0 ? [buttons] : []
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'spectate_refresh') {
        await this.showSpectateMenu(interaction, player);
      } else {
        const targetPlayerId = interaction.customId.replace('spectate_', '');
        await this.spectateSpecificPlayer(interaction, player, targetPlayerId);
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  },

  async spectateSpecificPlayer(message: any, spectator: any, targetPlayerId: string) {
    const targetPlayer = await prisma.player.findUnique({
      where: { discordId: targetPlayerId }
    });

    if (!targetPlayer) {
      const embed = new EmbedBuilder()
        .setTitle('❌ Player Not Found')
        .setDescription('The player you\'re trying to spectate couldn\'t be found.')
        .setColor(0xFF0000);

      if (message.update) {
        await message.update({ embeds: [embed], components: [] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    }

    if (!targetPlayer.inCombat) {
      const embed = new EmbedBuilder()
        .setTitle('❌ No Active Battle')
        .setDescription(
          `**${targetPlayer.username}** is not currently in combat.\n\n` +
          'Try spectating someone else or check back later!'
        )
        .setColor(0xFF8000);

      if (message.update) {
        await message.update({ embeds: [embed], components: [] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    }

    // Parse combat state
    const combatState = JSON.parse(targetPlayer.combatStateJson);
    const battleInfo = await this.getBattleInfo(targetPlayer, combatState);

    const embed = new EmbedBuilder()
      .setTitle(`👁️ Spectating: ${targetPlayer.username}`)
      .setDescription(
        `**Battle Information**\n\n` +
        `🥊 **Fighter:** ${targetPlayer.username} (Level ${targetPlayer.level})\n` +
        `👹 **Opponent:** ${battleInfo.opponentName}\n` +
        `⚔️ **Battle Type:** ${battleInfo.battleType}\n` +
        `⏱️ **Duration:** ${battleInfo.duration}\n` +
        `🎯 **Current Turn:** ${battleInfo.currentTurn}\n\n` +
        `**Health Status:**\n` +
        `❤️ **${targetPlayer.username}:** ${battleInfo.playerHp}\n` +
        `💀 **${battleInfo.opponentName}:** ${battleInfo.opponentHp}\n\n` +
        `*Battle updates will appear here as they happen...*`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 "Live combat! More exciting than watching cheese melt!" - Plagg' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('spectate_update')
          .setLabel('🔄 Update')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('spectate_details')
          .setLabel('📊 Details')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('spectate_exit')
          .setLabel('🚪 Stop Spectating')
          .setStyle(ButtonStyle.Danger)
      );

    if (message.update) {
      await message.update({ embeds: [embed], components: [buttons] });
    } else {
      const response = await message.reply({ embeds: [embed], components: [buttons] });
      message = response;
    }

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000, // 5 minutes
      filter: (interaction: any) => interaction.user.id === spectator.discordId
    });

    collector.on('collect', async (interaction: any) => {
      switch (interaction.customId) {
        case 'spectate_update':
          await this.updateSpectateView(interaction, spectator, targetPlayerId);
          break;
        case 'spectate_details':
          await this.showBattleDetails(interaction, targetPlayer, combatState);
          break;
        case 'spectate_exit':
          await this.exitSpectateMode(interaction);
          break;
      }
    });

    collector.on('end', () => {
      message.edit({ components: [] }).catch(() => {});
    });
  },

  async updateSpectateView(interaction: any, spectator: any, targetPlayerId: string) {
    // Refresh and show updated battle state
    await this.spectateSpecificPlayer(interaction, spectator, targetPlayerId);
  },

  async showBattleDetails(interaction: any, targetPlayer: any, combatState: any) {
    const embed = new EmbedBuilder()
      .setTitle(`📊 Battle Details - ${targetPlayer.username}`)
      .setDescription(
        `**Detailed Combat Information**\n\n` +
        `👤 **Player Stats:**\n` +
        `**Level:** ${targetPlayer.level}\n` +
        `**STR:** ${targetPlayer.str} | **INT:** ${targetPlayer.int}\n` +
        `**DEX:** ${targetPlayer.dex} | **DEF:** ${targetPlayer.def}\n` +
        `**HP:** ${targetPlayer.hp}/${targetPlayer.maxHp}\n` +
        `**Mana:** ${targetPlayer.mana}/${targetPlayer.maxMana}\n\n` +
        `⚔️ **Combat State:**\n` +
        `**Turn:** ${combatState.turn || 'Unknown'}\n` +
        `**Round:** ${combatState.round || 1}\n` +
        `**Buffs:** ${Object.keys(combatState.buffs || {}).length}\n` +
        `**Debuffs:** ${Object.keys(combatState.debuffs || {}).length}`
      )
      .setColor(0x4169E1)
      .setFooter({ text: '🧀 "Knowledge is power! Like knowing which cheese pairs with what!" - Plagg' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  async exitSpectateMode(interaction: any) {
    const embed = new EmbedBuilder()
      .setTitle('🚪 Stopped Spectating')
      .setDescription(
        '**You have stopped spectating the battle.**\n\n' +
        'Use `$spectate` again to watch other battles!'
      )
      .setColor(0x808080)
      .setFooter({ text: '🧀 "Thanks for watching! The fighters appreciate the audience!" - Plagg' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  getBattleType(combatState: any): string {
    if (combatState.opponentType === 'player') {
      return combatState.type === 'ranked' ? '🏆 Ranked PvP' : '⚔️ Quick Match';
    }
    if (combatState.isBossBattle) {
      return '👑 Boss Battle';
    }
    if (combatState.inDungeon) {
      return '🏰 Dungeon Encounter';
    }
    return '🎯 Monster Hunt';
  },

  getOpponentName(combatState: any): string {
    if (combatState.opponentType === 'player') {
      return combatState.opponentName || 'Another Player';
    }
    return combatState.opponent || 'Monster';
  },

  getBattleStatus(combatState: any): string {
    const turn = combatState.turn;
    if (turn === 'player') return '🟢 Player\'s Turn';
    if (turn === 'opponent') return '🔴 Opponent\'s Turn';
    return '⏸️ Preparing...';
  },

  async getBattleInfo(player: any, combatState: any): Promise<any> {
    const startTime = combatState.startTime || Date.now() - 60000; // Default 1 minute ago
    const duration = this.formatDuration(Date.now() - startTime);
    
    return {
      opponentName: this.getOpponentName(combatState),
      battleType: this.getBattleType(combatState),
      duration: duration,
      currentTurn: combatState.turn === 'player' ? player.username : this.getOpponentName(combatState),
      playerHp: `${combatState.playerHp || player.hp}/${player.maxHp}`,
      opponentHp: `${combatState.opponentHp || '???'}/???`
    };
  },

  formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
};

export default command;

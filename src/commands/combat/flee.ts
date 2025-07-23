import { Message, EmbedBuilder } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { rollDice } from '../../utils/functions.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const command: Command = {
  name: 'flee',
  description: 'Attempt to flee from combat',
  cooldown: 3,
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

      if (!player.inCombat) {
        await message.reply('🧀 You\'re not in combat! Nothing to flee from except maybe your cheese addiction.');
        return;
      }

      // Parse combat state
      const combatState = JSON.parse(player.combatStateJson);
      
      if (!combatState.opponent) {
        await message.reply('🧀 Invalid combat state! Something cheesy is going on...');
        return;
      }

      // Calculate flee chance based on DEX and situation
      const baseFleeChance = 50;
      const dexBonus = Math.min(player.dex * 2, 30); // Max +30% from DEX
      const healthPenalty = player.hp < player.maxHp * 0.3 ? -20 : 0; // -20% if low HP
      const levelPenalty = combatState.opponentType === 'monster' ? 0 : -10; // Harder to flee from players
      
      const totalFleeChance = Math.max(10, baseFleeChance + dexBonus + healthPenalty + levelPenalty);
      
      const fleeRoll = rollDice(100);
      const success = fleeRoll <= totalFleeChance;

      if (success) {
        // Successful flee
        await this.handleSuccessfulFlee(message, player, combatState, totalFleeChance);
      } else {
        // Failed flee - take damage and continue combat
        await this.handleFailedFlee(message, player, combatState, totalFleeChance);
      }

    } catch (error) {
      logger.error('Error in flee command:', error);
      await message.reply('🧀 Failed to flee! You tripped over a cheese wheel while trying to escape.');
    }
  },

  async handleSuccessfulFlee(message: Message, player: any, combatState: any, fleeChance: number) {
    // End combat state
    await prisma.player.update({
      where: { discordId: message.author.id },
      data: {
        inCombat: false,
        combatStateJson: '{}'
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('🏃 Successful Escape!')
      .setDescription(
        `**You successfully fled from combat!**\n\n` +
        `Your quick thinking and nimble feet got you out of danger.\n\n` +
        `**Escape Details:**\n` +
        `• Flee chance: ${fleeChance}%\n` +
        `• Your DEX bonus helped you escape\n` +
        `• No penalties for tactical retreat`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 Plagg says: "Smart move! Live to fight another day... and eat more cheese!"' });

    // Add flavor text based on opponent type
    if (combatState.opponentType === 'monster') {
      embed.addFields({
        name: '🏃‍♂️ Escape Story',
        value: 'You quickly duck behind a rock and sneak away while the monster is distracted by the scent of cheese in your pack.',
        inline: false
      });
    } else {
      embed.addFields({
        name: '🏃‍♂️ Escape Story',
        value: 'You throw a handful of cheese crumbs as a distraction and slip away while your opponent is confused.',
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });

    // Check for cowardice scenarios (Isekai reference)
    await this.checkCowardiceScenarios(message, player);
  },

  async handleFailedFlee(message: Message, player: any, combatState: any, fleeChance: number) {
    // Calculate flee failure damage (opportunity attack)
    const damage = Math.floor(Math.random() * 15) + 5;
    const newHp = Math.max(0, player.hp - damage);

    // Update player HP
    await prisma.player.update({
      where: { discordId: message.author.id },
      data: { hp: newHp }
    });

    const embed = new EmbedBuilder()
      .setTitle('❌ Failed to Escape!')
      .setDescription(
        `**Your escape attempt failed!**\n\n` +
        `You stumbled while trying to flee and took an opportunity attack!\n\n` +
        `**Damage Taken:** ${damage} HP\n` +
        `**Current HP:** ${newHp}/${player.maxHp}\n` +
        `**Flee Chance:** ${fleeChance}%`
      )
      .setColor(0xFF0000);

    if (newHp <= 0) {
      // Player knocked out by flee failure
      embed.addFields({
        name: '💀 Knocked Out!',
        value: 'The failed escape attempt left you unconscious! You wake up later with 1 HP.',
        inline: false
      });

      await prisma.player.update({
        where: { discordId: message.author.id },
        data: {
          hp: 1,
          inCombat: false,
          combatStateJson: '{}'
        }
      });

      embed.setFooter({ text: '🧀 Plagg says: "Next time, throw cheese as a distraction first!"' });
    } else {
      embed.addFields({
        name: '⚔️ Combat Continues',
        value: 'You\'re still in combat! Choose your next action carefully.',
        inline: false
      });

      embed.setFooter({ text: '🧀 Plagg says: "Running away is harder than it looks!"' });
    }

    await message.reply({ embeds: [embed] });
  },

  async checkCowardiceScenarios(message: Message, player: any) {
    const completedScenarios = JSON.parse(player.completedScenariosJson);
    const achievements = JSON.parse(player.achievementsJson);
    
    // Track flee count
    const fleeCount = (achievements.fleeCount || 0) + 1;
    achievements.fleeCount = fleeCount;

    // "Konosuba" - Cowardly but Lucky scenario
    if (!completedScenarios.includes('konosuba_luck') && fleeCount >= 10) {
      completedScenarios.push('konosuba_luck');

      await prisma.player.update({
        where: { discordId: message.author.id },
        data: {
          completedScenariosJson: JSON.stringify(completedScenarios),
          dex: player.dex + 8,
          gold: player.gold + 1000,
          achievementsJson: JSON.stringify(achievements)
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('✨ Isekai Scenario: Cowardly but Lucky')
        .setDescription(
          `**"I'm not brave, but I'm incredibly lucky!"**\n\n` +
          `After fleeing from 10 battles, the gods of luck smile upon your... strategic retreats.\n\n` +
          `**Permanent Rewards:**\n` +
          `• +8 DEX (Master of running away)\n` +
          `• +1000 Gold (Found while fleeing)\n` +
          `• Lucky Escape: +20% flee chance permanently`
        )
        .setColor(0xFFD700)
        .setFooter({ text: '🧀 Plagg says: "Sometimes the best strategy is a good cheese break!"' });

      setTimeout(() => {
        message.channel.send({ embeds: [embed] });
      }, 3000);
    } else {
      // Just update flee count
      await prisma.player.update({
        where: { discordId: message.author.id },
        data: {
          achievementsJson: JSON.stringify(achievements)
        }
      });
    }
  }
};

export default command;

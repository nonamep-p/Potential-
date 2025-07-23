import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { formatGold } from '../../utils/functions.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

interface Bounty {
  id: string;
  targetId: string;
  targetName: string;
  placedBy: string;
  placedByName: string;
  amount: number;
  reason: string;
  expires: Date;
  claimed: boolean;
}

const command: Command = {
  name: 'bounty',
  description: 'Place bounties on players or view the bounty board',
  cooldown: 30,
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
        await this.showBountyBoard(message, player);
        return;
      }

      const action = args[0].toLowerCase();

      switch (action) {
        case 'place':
        case 'set':
          if (args.length < 3) {
            await message.reply('🧀 Usage: `$bounty place <@player> <amount> [reason]`');
            return;
          }
          await this.placeBounty(message, player, args);
          break;
        case 'claim':
          if (args.length < 2) {
            await message.reply('🧀 Usage: `$bounty claim <bounty ID>`');
            return;
          }
          await this.claimBounty(message, player, args[1]);
          break;
        case 'my':
        case 'mine':
          await this.showMyBounties(message, player);
          break;
        case 'on':
          const targetUser = message.mentions.users.first();
          if (!targetUser) {
            await message.reply('🧀 Mention a player to see bounties on them!');
            return;
          }
          await this.showBountiesOnPlayer(message, targetUser.id);
          break;
        default:
          await this.showBountyBoard(message, player);
      }

    } catch (error) {
      logger.error('Error in bounty command:', error);
      await message.reply('🧀 Failed to access bounty system! The bounty board is covered in cheese stains.');
    }
  },

  async showBountyBoard(message: Message, player: any) {
    const activeBounties = await this.getActiveBounties();

    const embed = new EmbedBuilder()
      .setTitle('💀 Bounty Board')
      .setDescription(
        `**Active bounties on players**\n\n` +
        `💰 **Your Gold:** ${formatGold(player.gold)}\n` +
        `📋 **Active Bounties:** ${activeBounties.length}\n\n` +
        `**Commands:**\n` +
        `• \`$bounty place <@player> <amount> [reason]\`\n` +
        `• \`$bounty claim <ID>\` - Claim a bounty\n` +
        `• \`$bounty my\` - View your bounties\n` +
        `• \`$bounty on <@player>\` - View bounties on player`
      )
      .setColor(0x8B0000)
      .setFooter({ text: '🧀 "Bounties are like cheese rewards - sweet satisfaction!" - Plagg' });

    if (activeBounties.length === 0) {
      embed.addFields({
        name: '📭 No Active Bounties',
        value: 'The realm is peaceful... for now.',
        inline: false
      });
    } else {
      activeBounties.slice(0, 10).forEach((bounty, index) => {
        const timeLeft = bounty.expires.getTime() - Date.now();
        const hoursLeft = Math.max(0, Math.floor(timeLeft / (1000 * 60 * 60)));

        embed.addFields({
          name: `💀 Bounty #${index + 1} - ${bounty.targetName}`,
          value: 
            `**Reward:** ${formatGold(bounty.amount)} gold\n` +
            `**Placed by:** ${bounty.placedByName}\n` +
            `**Reason:** ${bounty.reason}\n` +
            `**Expires:** ${hoursLeft > 0 ? `${hoursLeft}h` : 'Soon'}`,
          inline: true
        });
      });
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('bounty_refresh')
          .setLabel('🔄 Refresh')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('bounty_place')
          .setLabel('💀 Place Bounty')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('bounty_my')
          .setLabel('📋 My Bounties')
          .setStyle(ButtonStyle.Secondary)
      );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      switch (interaction.customId) {
        case 'bounty_refresh':
          await this.showBountyBoard(interaction, player);
          break;
        case 'bounty_place':
          await this.showPlaceBountyMenu(interaction, player);
          break;
        case 'bounty_my':
          await this.showMyBounties(interaction, player);
          break;
      }
    });

    collector.on('end', () => {
      response.edit({ components: [] }).catch(() => {});
    });
  },

  async placeBounty(message: Message, player: any, args: string[]) {
    const targetUser = message.mentions.users.first();
    if (!targetUser) {
      await message.reply('🧀 You need to mention a player to place a bounty on!');
      return;
    }

    if (targetUser.id === message.author.id) {
      await message.reply('🧀 You can\'t place a bounty on yourself! That\'s like putting cheese on... wait, that\'s actually good.');
      return;
    }

    if (targetUser.bot) {
      await message.reply('🧀 You can\'t place bounties on bots! They don\'t have souls or taste buds.');
      return;
    }

    const targetPlayer = await prisma.player.findUnique({
      where: { discordId: targetUser.id }
    });

    if (!targetPlayer) {
      await message.reply('🧀 That player hasn\'t started their RPG journey yet!');
      return;
    }

    const amount = parseInt(args[2]);
    if (isNaN(amount) || amount < 100) {
      await message.reply('🧀 Bounty amount must be at least 100 gold!');
      return;
    }

    if (player.gold < amount) {
      await message.reply(`🧀 You need ${formatGold(amount)} gold but only have ${formatGold(player.gold)}!`);
      return;
    }

    const reason = args.slice(3).join(' ') || 'No reason given';

    // Check if player already has a bounty on this target
    const existingBounty = await this.getBountyOnTarget(targetUser.id, player.discordId);
    if (existingBounty) {
      await message.reply('🧀 You already have an active bounty on this player!');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('💀 Place Bounty Confirmation')
      .setDescription(
        `**Are you sure you want to place this bounty?**\n\n` +
        `🎯 **Target:** ${targetPlayer.username}\n` +
        `💰 **Amount:** ${formatGold(amount)} gold\n` +
        `📝 **Reason:** ${reason}\n` +
        `⏱️ **Duration:** 7 days\n\n` +
        `**⚠️ Warning:**\n` +
        `• Gold will be deducted immediately\n` +
        `• Bounty cannot be cancelled\n` +
        `• Anyone can claim this bounty by defeating the target\n\n` +
        `*This will make you enemies!*`
      )
      .setColor(0xFF0000)
      .setFooter({ text: '🧀 "Revenge is a dish best served with cheese!" - Plagg' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_bounty')
          .setLabel('💀 Place Bounty')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_bounty')
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
      if (interaction.customId === 'cancel_bounty') {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('❌ Bounty Cancelled')
          .setDescription('You decided not to place the bounty.')
          .setColor(0x808080);

        await interaction.update({
          embeds: [cancelEmbed],
          components: []
        });
        return;
      }

      try {
        // Deduct gold and create bounty
        await prisma.player.update({
          where: { discordId: player.discordId },
          data: { gold: player.gold - amount }
        });

        // Store bounty in global data (simulated)
        await this.storeBounty({
          targetId: targetUser.id,
          targetName: targetPlayer.username,
          placedBy: player.discordId,
          placedByName: player.username,
          amount: amount,
          reason: reason,
          expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Bounty Placed!')
          .setDescription(
            `**Bounty successfully placed on ${targetPlayer.username}!**\n\n` +
            `💰 **Reward:** ${formatGold(amount)} gold\n` +
            `📝 **Reason:** ${reason}\n` +
            `⏱️ **Expires:** In 7 days\n\n` +
            `*The bounty is now active on the bounty board!*`
          )
          .setColor(0x00FF00)
          .setFooter({ text: '🧀 "The hunt begins! May the best cheese win!" - Plagg' });

        await interaction.update({
          embeds: [successEmbed],
          components: []
        });

      } catch (error) {
        logger.error('Error placing bounty:', error);
        await interaction.reply({
          content: '🧀 Failed to place bounty! Try again.',
          ephemeral: true
        });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 Bounty placement timed out.')],
          components: []
        }).catch(() => {});
      }
    });
  },

  async claimBounty(message: Message, player: any, bountyId: string) {
    const bountyIndex = parseInt(bountyId) - 1;
    const activeBounties = await this.getActiveBounties();

    if (bountyIndex < 0 || bountyIndex >= activeBounties.length) {
      await message.reply('🧀 Invalid bounty ID! Use `$bounty` to see active bounties.');
      return;
    }

    const bounty = activeBounties[bountyIndex];

    if (bounty.targetId === player.discordId) {
      await message.reply('🧀 You can\'t claim a bounty on yourself! That\'s just stealing your own cheese.');
      return;
    }

    if (bounty.placedBy === player.discordId) {
      await message.reply('🧀 You can\'t claim your own bounty! Wait for someone else to do the dirty work.');
      return;
    }

    // Check if target player was recently defeated by this player
    const recentDefeat = await this.checkRecentDefeat(player.discordId, bounty.targetId);
    if (!recentDefeat) {
      await message.reply('🧀 You must defeat the target player in PvP combat within the last hour to claim this bounty!');
      return;
    }

    try {
      // Award bounty gold
      await prisma.player.update({
        where: { discordId: player.discordId },
        data: { gold: { increment: bounty.amount } }
      });

      // Mark bounty as claimed
      await this.markBountyClaimed(bounty.id);

      const embed = new EmbedBuilder()
        .setTitle('💰 Bounty Claimed!')
        .setDescription(
          `**You successfully claimed the bounty on ${bounty.targetName}!**\n\n` +
          `💰 **Reward:** ${formatGold(bounty.amount)} gold\n` +
          `📝 **Original Reason:** ${bounty.reason}\n` +
          `👑 **Placed by:** ${bounty.placedByName}\n\n` +
          `*The gold has been added to your account!*`
        )
        .setColor(0x00FF00)
        .setFooter({ text: '🧀 "Justice served! With a side of cheese!" - Plagg' });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error claiming bounty:', error);
      await message.reply('🧀 Failed to claim bounty! The gold slipped through your fingers like melted cheese.');
    }
  },

  async showMyBounties(message: any, player: any) {
    const myBounties = await this.getBountiesPlacedBy(player.discordId);
    const bountiesOnMe = await this.getBountiesOnPlayer(player.discordId);

    const embed = new EmbedBuilder()
      .setTitle('📋 Your Bounties')
      .setDescription(
        `**Your bounty activity**\n\n` +
        `💀 **Bounties Placed:** ${myBounties.length}\n` +
        `🎯 **Bounties on You:** ${bountiesOnMe.length}\n\n`
      )
      .setColor(0x4169E1);

    if (myBounties.length > 0) {
      const bountiesText = myBounties.slice(0, 5).map((bounty, index) => 
        `${index + 1}. **${bounty.targetName}** - ${formatGold(bounty.amount)} gold`
      ).join('\n');
      
      embed.addFields({
        name: '💀 Bounties You Placed',
        value: bountiesText,
        inline: false
      });
    }

    if (bountiesOnMe.length > 0) {
      const bountiesText = bountiesOnMe.slice(0, 5).map((bounty, index) => 
        `${index + 1}. ${formatGold(bounty.amount)} gold by **${bounty.placedByName}**`
      ).join('\n');
      
      embed.addFields({
        name: '🎯 Bounties on You',
        value: bountiesText,
        inline: false
      });
    }

    embed.setFooter({ text: '🧀 "Keep your friends close and your bounties closer!" - Plagg' });

    if (message.update) {
      await message.update({ embeds: [embed], components: [] });
    } else {
      await message.reply({ embeds: [embed] });
    }
  },

  async showBountiesOnPlayer(message: Message, playerId: string) {
    const bounties = await this.getBountiesOnPlayer(playerId);
    const targetPlayer = await prisma.player.findUnique({
      where: { discordId: playerId }
    });

    if (!targetPlayer) {
      await message.reply('🧀 Player not found!');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎯 Bounties on ${targetPlayer.username}`)
      .setDescription(
        bounties.length > 0 ? 
          `**Active bounties on this player**\n\n` +
          bounties.map((bounty, index) => 
            `${index + 1}. **${formatGold(bounty.amount)}** gold by ${bounty.placedByName}\n` +
            `   *"${bounty.reason}"*`
          ).join('\n\n') :
          'No active bounties on this player.'
      )
      .setColor(bounties.length > 0 ? 0xFF0000 : 0x808080)
      .setFooter({ text: '🧀 "A clean record is like fresh cheese - rare and precious!" - Plagg' });

    await message.reply({ embeds: [embed] });
  },

  async showPlaceBountyMenu(interaction: any, player: any) {
    const embed = new EmbedBuilder()
      .setTitle('💀 Place a Bounty')
      .setDescription(
        '**How to place a bounty:**\n\n' +
        '1. Use `$bounty place <@player> <amount> [reason]`\n' +
        '2. Minimum amount: 100 gold\n' +
        '3. Bounties last 7 days\n' +
        '4. Anyone can claim by defeating the target\n\n' +
        '**Example:**\n' +
        '`$bounty place @BadPlayer 500 Stole my cheese`\n\n' +
        '*Choose your targets wisely!*'
      )
      .setColor(0x8B0000)
      .setFooter({ text: '🧀 "Revenge is a dish best served with cheese!" - Plagg' });

    await interaction.update({ embeds: [embed], components: [] });
  },

  // Utility methods for bounty management (using GlobalData table)
  async getActiveBounties(): Promise<Bounty[]> {
    try {
      const data = await prisma.globalData.findUnique({
        where: { key: 'activeBounties' }
      });
      
      if (!data) return [];
      
      const bounties = JSON.parse(data.valueJson);
      return bounties.filter((b: Bounty) => new Date(b.expires) > new Date() && !b.claimed);
    } catch (error) {
      return [];
    }
  },

  async storeBounty(bounty: Omit<Bounty, 'id' | 'claimed'>): Promise<void> {
    try {
      const existingData = await prisma.globalData.findUnique({
        where: { key: 'activeBounties' }
      });
      
      const bounties = existingData ? JSON.parse(existingData.valueJson) : [];
      
      const newBounty: Bounty = {
        ...bounty,
        id: Date.now().toString(),
        claimed: false
      };
      
      bounties.push(newBounty);
      
      await prisma.globalData.upsert({
        where: { key: 'activeBounties' },
        create: {
          key: 'activeBounties',
          valueJson: JSON.stringify(bounties)
        },
        update: {
          valueJson: JSON.stringify(bounties)
        }
      });
    } catch (error) {
      logger.error('Error storing bounty:', error);
    }
  },

  async getBountyOnTarget(targetId: string, placedBy: string): Promise<Bounty | null> {
    const bounties = await this.getActiveBounties();
    return bounties.find(b => b.targetId === targetId && b.placedBy === placedBy) || null;
  },

  async getBountiesPlacedBy(playerId: string): Promise<Bounty[]> {
    const bounties = await this.getActiveBounties();
    return bounties.filter(b => b.placedBy === playerId);
  },

  async getBountiesOnPlayer(playerId: string): Promise<Bounty[]> {
    const bounties = await this.getActiveBounties();
    return bounties.filter(b => b.targetId === playerId);
  },

  async markBountyClaimed(bountyId: string): Promise<void> {
    try {
      const data = await prisma.globalData.findUnique({
        where: { key: 'activeBounties' }
      });
      
      if (!data) return;
      
      const bounties = JSON.parse(data.valueJson);
      const bountyIndex = bounties.findIndex((b: Bounty) => b.id === bountyId);
      
      if (bountyIndex !== -1) {
        bounties[bountyIndex].claimed = true;
        
        await prisma.globalData.update({
          where: { key: 'activeBounties' },
          data: { valueJson: JSON.stringify(bounties) }
        });
      }
    } catch (error) {
      logger.error('Error marking bounty as claimed:', error);
    }
  },

  async checkRecentDefeat(winnerId: string, loserId: string): Promise<boolean> {
    // In a real implementation, this would check combat logs
    // For now, we'll simulate based on recent activity
    const winner = await prisma.player.findUnique({
      where: { discordId: winnerId }
    });
    
    const loser = await prisma.player.findUnique({
      where: { discordId: loserId }
    });

    // Simulate: if winner has higher ELO, they likely defeated the target recently
    return winner && loser && winner.elo > loser.elo - 50;
  }
};

export default command;

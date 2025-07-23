import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { prisma } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';
import { loadJsonData } from '../../utils/functions.js';
import { CombatManager } from '../../structures/CombatManager.js';
import { Monster } from '../../types.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const combatManager = new CombatManager();

const command: Command = {
  name: 'hunt',
  description: 'Hunt monsters for XP, gold, and loot',
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

      if (player.inCombat) {
        await message.reply('🧀 You\'re already in combat! Finish your current battle first.');
        return;
      }

      if (player.inDungeon) {
        await message.reply('🧀 You can\'t hunt while in a dungeon! Focus on your current adventure.');
        return;
      }

      if (player.hp <= 0) {
        await message.reply('🧀 You\'re unconscious! Rest or use a healing item first.');
        return;
      }

      // Load monsters
      const monsters = await loadJsonData<Monster[]>('monsters.json');
      
      // Filter monsters by player level (±5 levels)
      const suitableMonsters = monsters.filter(monster => 
        monster.level >= player.level - 5 && 
        monster.level <= player.level + 3
      );

      if (suitableMonsters.length === 0) {
        await message.reply('🧀 No suitable monsters found for your level! This is concerning...');
        return;
      }

      // If specific monster requested
      if (args.length > 0) {
        const monsterName = args.join(' ').toLowerCase();
        const targetMonster = suitableMonsters.find(m => 
          m.name.toLowerCase().includes(monsterName) || 
          m.id.toLowerCase().includes(monsterName)
        );

        if (!targetMonster) {
          await message.reply(`🧀 Couldn't find that monster! Available monsters for your level: ${suitableMonsters.map(m => m.name).join(', ')}`);
          return;
        }

        // Start combat with specific monster
        const success = await combatManager.startCombat(message, targetMonster.id);
        if (success) {
          await this.checkIsekaiScenarios(message, player, targetMonster);
        }
        return;
      }

      // Show hunting menu
      await this.showHuntingMenu(message, player, suitableMonsters);

    } catch (error) {
      logger.error('Error in hunt command:', error);
      await message.reply('🧀 Failed to start hunting! The monsters are hiding behind cheese wheels.');
    }
  },

  async showHuntingMenu(message: Message, player: any, monsters: Monster[]) {
    // Select random monsters for the encounter
    const encounterMonsters = monsters
      .sort(() => Math.random() - 0.5)
      .slice(0, 5);

    const embed = new EmbedBuilder()
      .setTitle('🎯 Monster Hunting')
      .setDescription(
        `**Choose your prey wisely, ${player.username}!**\n\n` +
        `You spot several monsters in the area. Which one will you hunt?\n\n` +
        `*Your current level: ${player.level}*`
      )
      .setColor(0x8B4513)
      .setFooter({ text: '🧀 Remember: Higher level monsters give better rewards but are more dangerous!' });

    // Add monster options
    encounterMonsters.forEach((monster, index) => {
      const difficulty = this.getDifficulty(player.level, monster.level);
      const rewardMultiplier = Math.max(1, monster.level - player.level + 1);
      
      embed.addFields({
        name: `${index + 1}. ${monster.name} (Level ${monster.level}) ${difficulty}`,
        value: 
          `*${monster.plaggComment}*\n` +
          `**HP:** ${monster.hp} | **XP Reward:** ~${Math.floor(monster.xpReward * rewardMultiplier)}\n` +
          `**Gold Reward:** ~${Math.floor(monster.goldReward * rewardMultiplier)}`,
        inline: false
      });
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>();
    encounterMonsters.forEach((monster, index) => {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`hunt_${monster.id}`)
          .setLabel(`${index + 1}. ${monster.name}`)
          .setStyle(this.getButtonStyle(player.level, monster.level))
      );
    });

    // Add random encounter button
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId('hunt_random')
        .setLabel('🎲 Random Encounter')
        .setStyle(ButtonStyle.Secondary)
    );

    const response = await message.reply({
      embeds: [embed],
      components: [buttons]
    });

    const collector = response.createMessageComponentCollector({
      time: 60000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      try {
        let monsterId: string;

        if (interaction.customId === 'hunt_random') {
          // Select random monster
          const randomMonster = encounterMonsters[Math.floor(Math.random() * encounterMonsters.length)];
          monsterId = randomMonster.id;
        } else {
          monsterId = interaction.customId.replace('hunt_', '');
        }

        const selectedMonster = monsters.find(m => m.id === monsterId);
        if (!selectedMonster) {
          await interaction.reply({
            content: '🧀 Monster disappeared! Try hunting again.',
            ephemeral: true
          });
          return;
        }

        await interaction.update({
          embeds: [embed.setDescription(`🎯 **Engaging ${selectedMonster.name}!**\n\n*Prepare for battle...*`)],
          components: []
        });

        // Start combat
        const success = await combatManager.startCombat(message, selectedMonster.id);
        if (success) {
          await this.checkIsekaiScenarios(message, player, selectedMonster);
        }

      } catch (error) {
        logger.error('Error in hunt selection:', error);
        await interaction.reply({
          content: '🧀 Failed to engage monster! Try again.',
          ephemeral: true
        });
      }
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        response.edit({
          embeds: [embed.setDescription('🧀 The monsters wandered away while you were deciding...')],
          components: []
        }).catch(() => {});
      }
    });
  },

  getDifficulty(playerLevel: number, monsterLevel: number): string {
    const diff = monsterLevel - playerLevel;
    if (diff <= -3) return '🟢 Easy';
    if (diff <= -1) return '🔵 Normal';
    if (diff === 0) return '🟡 Balanced';
    if (diff <= 2) return '🟠 Hard';
    return '🔴 Extreme';
  },

  getButtonStyle(playerLevel: number, monsterLevel: number): ButtonStyle {
    const diff = monsterLevel - playerLevel;
    if (diff <= -1) return ButtonStyle.Success;  // Green for easy
    if (diff <= 1) return ButtonStyle.Primary;   // Blue for balanced
    return ButtonStyle.Danger;                   // Red for hard
  },

  async checkIsekaiScenarios(message: Message, player: any, monster: Monster) {
    const completedScenarios = JSON.parse(player.completedScenariosJson);
    
    // "Re:Monster" - Transform into monster after killing 100 monsters
    if (!completedScenarios.includes('re_monster')) {
      const achievements = JSON.parse(player.achievementsJson);
      const monstersKilled = achievements.monstersKilled || 0;
      
      if (monstersKilled >= 100) {
        completedScenarios.push('re_monster');
        
        await prisma.player.update({
          where: { discordId: message.author.id },
          data: {
            completedScenariosJson: JSON.stringify(completedScenarios),
            str: player.str + 5,
            dex: player.dex + 5,
            achievementsJson: JSON.stringify({
              ...achievements,
              monstersKilled: monstersKilled + 1
            })
          }
        });

        const embed = new EmbedBuilder()
          .setTitle('✨ Isekai Scenario: Re:Monster')
          .setDescription(
            `**"I've killed so many monsters... I'm becoming one myself!"**\n\n` +
            `After slaying your 100th monster, you feel a strange transformation!\n\n` +
            `**Permanent Rewards:**\n` +
            `• +5 STR (Monster strength)\n` +
            `• +5 DEX (Predator reflexes)\n` +
            `• Unlock: Monster Empathy ability`
          )
          .setColor(0x8B0000)
          .setFooter({ text: '🧀 Plagg says: "Great, now you\'re as scary as moldy cheese!"' });

        setTimeout(() => {
          message.channel.send({ embeds: [embed] });
        }, 2000);
      }
    }

    // "The Rising of the Shield Hero" - Low HP high defense scenario
    if (!completedScenarios.includes('shield_hero') && player.hp < player.maxHp * 0.1 && player.def >= 20) {
      completedScenarios.push('shield_hero');
      
      // Get equipment and add reflection bonus
      const equipment = JSON.parse(player.equipmentJson);
      
      await prisma.player.update({
        where: { discordId: message.author.id },
        data: {
          completedScenariosJson: JSON.stringify(completedScenarios),
          def: player.def + 10
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('✨ Isekai Scenario: The Shield Hero\'s Plight')
        .setDescription(
          `**"I may be weak, but I will protect what matters!"**\n\n` +
          `Fighting at death's door with unwavering defense, you unlock the shield's true power!\n\n` +
          `**Permanent Rewards:**\n` +
          `• +10 DEF (Unbreakable will)\n` +
          `• Damage Reflection: 5% of damage taken is reflected back\n` +
          `• Shield Mastery unlocked`
        )
        .setColor(0x4169E1)
        .setFooter({ text: '🧀 Plagg says: "Defense is important, like the rind on good cheese!"' });

      setTimeout(() => {
        message.channel.send({ embeds: [embed] });
      }, 2000);
    }
  }
};

export default command;

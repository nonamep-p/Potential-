
import { Message, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { prisma } from '../../database/connection';
import { logger } from '../../utils/logger';
import { Paginator } from '../../structures/Paginator';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
  showSkillsMenu: (message: Message, player: any, unlockedSkills: Skill[], allSkills: Skill[]) => Promise<void>;
  showSkillDetails: (message: Message, skill: Skill) => Promise<void>;
  useSkill: (message: Message, player: any, skill: Skill) => Promise<void>;
  getAvailableSkills: (player: any) => Skill[];
  checkSkillRequirements: (skill: Skill, player: any) => boolean;
  getRequirementText: (requirements: any) => string;
}

interface Skill {
  id: string;
  name: string;
  description: string;
  type: 'active' | 'passive';
  manaCost?: number;
  cooldown?: number;
  damage?: number;
  effect?: string;
  requirements: {
    level?: number;
    className?: string;
    pathName?: string;
    stat?: { [key: string]: number };
  };
  plaggComment: string;
}

const command: Command = {
  name: 'skills',
  description: 'View and manage your combat skills',
  cooldown: 3,
  async execute(message: Message, args: string[], client: any) {
    try {
      const player = await prisma.player.findUnique({
        where: { discordId: message.author.id }
      });

      if (!player) {
        await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
        return;
      }

      const availableSkills = this.getAvailableSkills(player);
      const unlockedSkills = availableSkills.filter(skill => this.checkSkillRequirements(skill, player));

      if (args.length > 0) {
        const skillName = args.join(' ').toLowerCase();
        const skill = unlockedSkills.find(s => s.name.toLowerCase().includes(skillName));

        if (!skill) {
          await message.reply('🧀 You don\'t have that skill! Use `$skills` to see available skills.');
          return;
        }

        if (player.inCombat && skill.type === 'active') {
          await this.useSkill(message, player, skill);
        } else {
          await this.showSkillDetails(message, skill);
        }
        return;
      }

      await this.showSkillsMenu(message, player, unlockedSkills, availableSkills);

    } catch (error) {
      logger.error('Error in skills command:', error);
      await message.reply('🧀 Failed to access skills! Your skill book is covered in cheese stains.');
    }
  },

  async showSkillsMenu(message: Message, player: any, unlockedSkills: Skill[], allSkills: Skill[]) {
    const activeSkills = unlockedSkills.filter(s => s.type === 'active');
    const passiveSkills = unlockedSkills.filter(s => s.type === 'passive');
    const lockedSkills = allSkills.filter(s => !this.checkSkillRequirements(s, player));

    const embed = new EmbedBuilder()
      .setTitle('📚 Your Skills Collection')
      .setDescription(
        `**${player.username}'s Skill Arsenal**\n\n` +
        `🎯 **Active Skills:** ${activeSkills.length}\n` +
        `🛡️ **Passive Skills:** ${passiveSkills.length}\n` +
        `🔒 **Locked Skills:** ${lockedSkills.length}\n\n` +
        `*Select a category below to browse your skills!*`
      )
      .setColor(0xFFD700)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: '🧀 Skills are like cheese - they get better with age!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('skills_active')
          .setLabel(`Active (${activeSkills.length})`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⚔️'),
        new ButtonBuilder()
          .setCustomId('skills_passive')
          .setLabel(`Passive (${passiveSkills.length})`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🛡️'),
        new ButtonBuilder()
          .setCustomId('skills_locked')
          .setLabel(`Locked (${lockedSkills.length})`)
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('skills_training')
          .setLabel('Training Tips')
          .setStyle(ButtonStyle.Success)
          .setEmoji('📖')
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
      let skillEmbed: EmbedBuilder;

      switch (interaction.customId) {
        case 'skills_active':
          skillEmbed = new EmbedBuilder()
            .setTitle('⚔️ Active Skills')
            .setDescription(
              `**Combat abilities you can actively use**\n\n` +
              `${player.inCombat ? 'Use `$skills <name>` to cast a skill in combat!' : 'Enter combat to use these skills!'}`
            )
            .setColor(0xFF4500);

          if (activeSkills.length === 0) {
            skillEmbed.addFields({
              name: '❌ No Active Skills',
              value: 'Unlock active skills by leveling up and choosing a class!',
              inline: false
            });
          } else {
            activeSkills.forEach(skill => {
              skillEmbed.addFields({
                name: `✨ ${skill.name}`,
                value: 
                  `*${skill.description}*\n` +
                  `**Mana:** ${skill.manaCost || 0} | **Cooldown:** ${skill.cooldown || 0} turns\n` +
                  `${skill.damage ? `**Damage:** ${skill.damage}\n` : ''}` +
                  `*"${skill.plaggComment}"*`,
                inline: true
              });
            });
          }
          break;

        case 'skills_passive':
          skillEmbed = new EmbedBuilder()
            .setTitle('🛡️ Passive Skills')
            .setDescription('**Permanent abilities that are always active**')
            .setColor(0x4169E1);

          if (passiveSkills.length === 0) {
            skillEmbed.addFields({
              name: '❌ No Passive Skills',
              value: 'Passive skills provide permanent bonuses. Unlock them through progression!',
              inline: false
            });
          } else {
            passiveSkills.forEach(skill => {
              skillEmbed.addFields({
                name: `🔰 ${skill.name}`,
                value: 
                  `*${skill.description}*\n` +
                  `**Effect:** ${skill.effect || 'Always active'}\n` +
                  `*"${skill.plaggComment}"*`,
                inline: true
              });
            });
          }
          break;

        case 'skills_locked':
          skillEmbed = new EmbedBuilder()
            .setTitle('🔒 Locked Skills')
            .setDescription('**Skills you can unlock by meeting requirements**')
            .setColor(0x808080);

          if (lockedSkills.length === 0) {
            skillEmbed.addFields({
              name: '✅ All Skills Unlocked!',
              value: 'Congratulations! You\'ve mastered all available skills.',
              inline: false
            });
          } else {
            lockedSkills.slice(0, 8).forEach(skill => {
              const reqText = this.getRequirementText(skill.requirements);
              skillEmbed.addFields({
                name: `🔒 ${skill.name}`,
                value: 
                  `*${skill.description}*\n` +
                  `**Requirements:** ${reqText}\n` +
                  `*"${skill.plaggComment}"*`,
                inline: true
              });
            });
          }
          break;

        case 'skills_training':
          skillEmbed = new EmbedBuilder()
            .setTitle('📖 Skill Training Guide')
            .setDescription('**How to unlock and improve your skills**')
            .setColor(0x32CD32)
            .addFields(
              {
                name: '🎯 Unlocking Skills',
                value: 
                  '• **Level up** to unlock basic skills\n' +
                  '• **Choose a class** for specialized abilities\n' +
                  '• **Select a path** at level 20 for unique skills\n' +
                  '• **Complete achievements** for bonus skills',
                inline: false
              },
              {
                name: '⚡ Skill Types',
                value: 
                  '**Active Skills:** Use in combat with mana cost\n' +
                  '**Passive Skills:** Always active, permanent bonuses\n' +
                  '**Ultimate Skills:** Powerful abilities with high requirements',
                inline: false
              },
              {
                name: '🧀 Plagg\'s Tips',
                value: 
                  '• Focus on your class skills first\n' +
                  '• Balance offensive and defensive abilities\n' +
                  '• Don\'t forget utility skills for exploration\n' +
                  '• Practice makes perfect... like aging cheese!',
                inline: false
              }
            );
          break;

        default:
          return;
      }

      await interaction.update({ embeds: [skillEmbed] });
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

  async showSkillDetails(message: any, skill: Skill) {
    const embed = new EmbedBuilder()
      .setTitle(`✨ ${skill.name}`)
      .setDescription(skill.description)
      .setColor(skill.type === 'active' ? 0xFF4500 : 0x4169E1)
      .addFields(
        {
          name: '📊 Skill Info',
          value: 
            `**Type:** ${skill.type === 'active' ? 'Active (usable in combat)' : 'Passive (always active)'}\n` +
            `${skill.manaCost ? `**Mana Cost:** ${skill.manaCost}\n` : ''}` +
            `${skill.cooldown ? `**Cooldown:** ${skill.cooldown} turns\n` : ''}` +
            `${skill.damage ? `**Base Damage:** ${skill.damage}\n` : ''}` +
            `${skill.effect ? `**Effect:** ${skill.effect}\n` : ''}`,
          inline: false
        }
      )
      .setFooter({ text: `🧀 Plagg says: "${skill.plaggComment}"` });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`skill_back_${skill.id}`)
          .setLabel('Back to Skills')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️'),
        new ButtonBuilder()
          .setCustomId(`skill_use_${skill.id}`)
          .setLabel('Use Skill')
          .setStyle(skill.type === 'active' ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji('⚡')
          .setDisabled(skill.type !== 'active'),
        new ButtonBuilder()
          .setCustomId(`skill_practice_${skill.id}`)
          .setLabel('Practice Guide')
          .setStyle(ButtonStyle.Success)
          .setEmoji('📚')
      );

    const response = message.update ? 
      await message.update({ embeds: [embed], components: [buttons] }) :
      await message.reply({ embeds: [embed], components: [buttons] });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
      filter: (interaction: any) => interaction.user.id === (message.user?.id || message.author.id)
    });

    collector.on('collect', async (interaction: any) => {
      const customId = interaction.customId;
      
      if (customId.startsWith('skill_back_')) {
        // Go back to skills menu
        const player = await prisma.player.findUnique({
          where: { discordId: interaction.user.id }
        });
        
        if (player) {
          const availableSkills = this.getAvailableSkills(player);
          const unlockedSkills = availableSkills.filter(s => this.checkSkillRequirements(s, player));
          await this.showSkillsMenu(interaction, player, unlockedSkills, availableSkills);
        }
      } else if (customId.startsWith('skill_use_')) {
        const player = await prisma.player.findUnique({
          where: { discordId: interaction.user.id }
        });
        
        if (player) {
          await this.useSkill(interaction, player, skill);
        }
      } else if (customId.startsWith('skill_practice_')) {
        await this.showPracticeGuide(interaction, skill);
      }
    });

    collector.on('end', () => {
      const disabledButtons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          ButtonBuilder.from(buttons.components[0]).setDisabled(true),
          ButtonBuilder.from(buttons.components[1]).setDisabled(true),
          ButtonBuilder.from(buttons.components[2]).setDisabled(true)
        );
      
      response.edit({ components: [disabledButtons] }).catch(() => {});
    });
  },

  async useSkill(message: any, player: any, skill: Skill) {
    if (skill.type !== 'active') {
      await message.reply({
        content: '🧀 That\'s a passive skill! It\'s always active.',
        ephemeral: true
      });
      return;
    }

    if (!skill.manaCost) {
      await message.reply({
        content: '🧀 This skill can\'t be used directly. It might be triggered automatically.',
        ephemeral: true
      });
      return;
    }

    if (player.mana < skill.manaCost) {
      await message.reply({
        content: `🧀 Not enough mana! You need ${skill.manaCost} mana but only have ${player.mana}.`,
        ephemeral: true
      });
      return;
    }

    // Update player mana
    await prisma.player.update({
      where: { discordId: player.discordId },
      data: { mana: player.mana - skill.manaCost }
    });

    const embed = new EmbedBuilder()
      .setTitle(`✨ ${skill.name} Used!`)
      .setDescription(
        `**${player.username}** uses **${skill.name}**!\n\n` +
        `*${skill.description}*\n\n` +
        `**Mana consumed:** ${skill.manaCost}\n` +
        `**Remaining mana:** ${player.mana - skill.manaCost}/${player.maxMana}`
      )
      .setColor(0x00FF00)
      .setFooter({ text: '🧀 Skill activated successfully!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('skill_use_again')
          .setLabel('Use Again')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔄')
          .setDisabled(player.mana - skill.manaCost < skill.manaCost),
        new ButtonBuilder()
          .setCustomId('skill_back_to_menu')
          .setLabel('Back to Skills')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  async showPracticeGuide(message: any, skill: Skill) {
    const embed = new EmbedBuilder()
      .setTitle(`📚 Practice Guide: ${skill.name}`)
      .setDescription(`**Learn how to master ${skill.name}**`)
      .setColor(0x32CD32)
      .addFields(
        {
          name: '🎯 How to Practice',
          value: 
            `• Use the skill in combat situations\n` +
            `• Practice with training dummies\n` +
            `• Combine with other abilities\n` +
            `• Study the skill's mechanics`,
          inline: false
        },
        {
          name: '💡 Pro Tips',
          value: 
            `• Time your usage carefully\n` +
            `• Monitor your mana reserves\n` +
            `• Learn enemy patterns\n` +
            `• Practice skill combinations`,
          inline: false
        },
        {
          name: '🧀 Plagg\'s Wisdom',
          value: `*"${skill.plaggComment}"*`,
          inline: false
        }
      )
      .setFooter({ text: 'Practice makes perfect... like aging cheese!' });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('skill_back_to_details')
          .setLabel('Back to Skill')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⬅️')
      );

    await message.update({ embeds: [embed], components: [buttons] });
  },

  getAvailableSkills(player: any): Skill[] {
    return [
      {
        id: 'power_strike',
        name: 'Power Strike',
        description: 'A devastating melee attack that deals extra damage.',
        type: 'active',
        manaCost: 10,
        cooldown: 2,
        damage: 25,
        requirements: { level: 3 },
        plaggComment: 'Hit \'em hard! Like biting into extra sharp cheddar!'
      },
      {
        id: 'heal',
        name: 'Minor Heal',
        description: 'Restore a small amount of HP.',
        type: 'active',
        manaCost: 15,
        cooldown: 3,
        effect: 'Restore 30-50 HP',
        requirements: { level: 5 },
        plaggComment: 'Healing magic! Almost as good as cheese for making you feel better.'
      },
      {
        id: 'berserker_rage',
        name: 'Berserker Rage',
        description: 'Enter a rage state for increased damage but reduced defense.',
        type: 'active',
        manaCost: 20,
        cooldown: 5,
        effect: '+50% damage, -25% defense for 3 turns',
        requirements: { level: 10, className: 'Warrior' },
        plaggComment: 'Angry like me when someone touches my cheese!'
      },
      {
        id: 'fireball',
        name: 'Fireball',
        description: 'Launch a fiery projectile at your enemy.',
        type: 'active',
        manaCost: 18,
        cooldown: 1,
        damage: 35,
        requirements: { level: 6, className: 'Mage' },
        plaggComment: 'Fire magic! Perfect for melting cheese... and enemies!'
      },
      {
        id: 'backstab',
        name: 'Backstab',
        description: 'Deal massive damage from behind.',
        type: 'active',
        manaCost: 14,
        cooldown: 3,
        damage: 45,
        effect: 'Must be used when enemy is distracted',
        requirements: { level: 7, className: 'Rogue' },
        plaggComment: 'Sneaky! Like how I sneak cheese when Adrien isn\'t looking!'
      },
      {
        id: 'cheese_mastery',
        name: 'Cheese Mastery',
        description: 'You understand the true power of cheese.',
        type: 'passive',
        effect: '+10% damage, +5% crit chance, immunity to poison',
        requirements: { pathName: 'Cheese Master' },
        plaggComment: 'FINALLY! Someone who gets it! This is the ultimate skill!'
      }
    ];
  },

  checkSkillRequirements(skill: Skill, player: any): boolean {
    const req = skill.requirements;
    
    if (req.level && player.level < req.level) return false;
    if (req.className && player.className !== req.className) return false;
    if (req.pathName && player.pathName !== req.pathName) return false;
    
    if (req.stat) {
      for (const [stat, value] of Object.entries(req.stat)) {
        if (player[stat] < value) return false;
      }
    }
    
    return true;
  },

  getRequirementText(requirements: any): string {
    const reqs = [];
    
    if (requirements.level) reqs.push(`Level ${requirements.level}`);
    if (requirements.className) reqs.push(`${requirements.className} class`);
    if (requirements.pathName) reqs.push(`${requirements.pathName} path`);
    if (requirements.stat) {
      for (const [stat, value] of Object.entries(requirements.stat)) {
        reqs.push(`${stat.toUpperCase()} ${value}`);
      }
    }
    
    return reqs.join(', ') || 'None';
  }
};

export default command;

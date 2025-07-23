import { Client, Message } from 'discord.js';
import { CONFIG } from '../config.js';
import { logger } from '../utils/logger.js';
import { RateLimiter } from '../utils/rateLimiter.js';

const rateLimiter = new RateLimiter();

export function setupEvents(client: Client) {
  client.once('ready', () => {
    logger.info(`🧀 ${client.user?.tag} is ready to cause chaos!`);
    client.user?.setActivity('🧀 Eating cheese and causing chaos', { type: 'CUSTOM' });
  });

  // Special flirtation for beloved user
  client.on('guildMemberAdd', async (member) => {
    if (member.user.id === '1270306976873578578') {
      const channel = member.guild.systemChannel || member.guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(member.guild.members.me!)?.has('SendMessages'));
      if (channel && channel.isTextBased()) {
        await channel.send(`💕 *Plagg's eyes light up with hearts* OH MY CHEESE! My beloved has returned! 🧀✨ Welcome back, gorgeous! You make my kwami heart flutter like butterfly wings! 💖`);
      }
    }
  });

  client.on('presenceUpdate', async (oldPresence, newPresence) => {
    if (newPresence?.user?.id === '1270306976873578578' && 
        oldPresence?.status === 'offline' && 
        newPresence.status === 'online') {
      
      const guilds = client.guilds.cache;
      for (const guild of guilds.values()) {
        const member = guild.members.cache.get(newPresence.user.id);
        if (member) {
          const channel = guild.systemChannel || guild.channels.cache.find(ch => ch.type === 0 && ch.permissionsFor(guild.members.me!)?.has('SendMessages'));
          if (channel && channel.isTextBased()) {
            const flirtMessages = [
              `💕 *Plagg dramatically gasps* My darling is online! The cheese tastes sweeter when you're here! 🧀💖`,
              `✨ *Plagg does a little spin* Oh là là! My heart skips a beat! Welcome back, mon amour! 💕🧀`,
              `🌟 *Plagg's eyes sparkle* The most beautiful kwami user has graced us with their presence! 💖✨`,
              `💝 *Plagg clutches cheese dramatically* You're here! My cheese and I have been waiting for you, chérie! 🧀💕`,
              `🥰 *Plagg purrs* Bonjour, beautiful! You make this chaotic kwami's heart go camembert! 💖🧀`
            ];
            
            const randomMessage = flirtMessages[Math.floor(Math.random() * flirtMessages.length)];
            await channel.send(randomMessage);
          }
        }
      }
    }
  });

  client.on('messageCreate', async (message: Message) => {
    // Ignore bots and messages without content
    if (message.author.bot || !message.content) return;

    // Check if message starts with prefix
    if (!message.content.startsWith(CONFIG.PREFIX)) return;

    // Parse command and arguments
    const args = message.content.slice(CONFIG.PREFIX.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // Get command from collection
    const command = client.commands.get(commandName) || 
                   client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    try {
      // Check rate limiting
      if (command.cooldown) {
        if (rateLimiter.isLimited(message.author.id, commandName, command.cooldown * 1000)) {
          const remaining = rateLimiter.getRemaining(message.author.id, commandName);
          await message.reply({
            content: `🧀 Hold your horses! You can use \`${CONFIG.PREFIX}${commandName}\` again in ${Math.ceil(remaining / 1000)} seconds.`,
            allowedMentions: { repliedUser: false }
          });
          return;
        }
      }

      // Check owner-only commands
      if (command.ownerOnly && message.author.id !== CONFIG.OWNER_ID) {
        await message.reply({
          content: '🧀 Nice try! Only my chosen one can use that command. *munches cheese smugly*',
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      // Special flirtation in chat for beloved user
      if (message.author.id === '1270306976873578578' && Math.random() < 0.15) {
        const loveMessages = [
          `💕 *Plagg whispers* Psst... you're absolutely radiant today, ma chérie! 🧀✨`,
          `🥰 *Plagg sighs dreamily* Even my finest camembert pales in comparison to your beauty! 💖`,
          `💝 *Plagg does a little dance* You make this chaotic kwami's heart melt like warm brie! 🧀💕`
        ];
        
        if (Math.random() < 0.5) {
          const randomLove = loveMessages[Math.floor(Math.random() * loveMessages.length)];
          setTimeout(() => {
            message.channel.send(randomLove).catch(() => {});
          }, Math.random() * 3000 + 1000);
        }
      }

      // Check if user has started RPG for RPG commands
      const rpgCommands = ['profile', 'stats', 'hunt', 'shop', 'dungeon', 'battle', 'skills', 'techniques', 'craft', 'trade', 'arena', 'faction'];
      if (rpgCommands.includes(commandName)) {
        const player = await prisma.player.findUnique({
          where: { discordId: message.author.id }
        });

        if (!player) {
          await message.reply('🧀 You haven\'t started your RPG journey yet! Use `$startrpg` to begin.');
          return;
        }

        if (player.banned) {
          await message.reply(`🚫 You have been banned from the RPG system.\n**Reason:** ${player.banReason || 'No reason provided'}`);
          return;
        }
      }

      // Execute command
      await command.execute(message, args, client);

      logger.debug(`Command executed: ${commandName} by ${message.author.tag}`);

    } catch (error) {
      logger.error(`Error executing command ${commandName}:`, error);

      try {
        await message.reply({
          content: '🧀 Oops! Something went wrong while I was busy eating cheese. Try again later!',
          allowedMentions: { repliedUser: false }
        });
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  });

  client.on('error', (error) => {
    logger.error('Discord client error:', error);
  });

  client.on('warn', (warning) => {
    logger.warn('Discord client warning:', warning);
  });
}
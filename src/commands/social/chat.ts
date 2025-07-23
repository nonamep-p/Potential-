
import { Message, EmbedBuilder } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from '../../config.js';
import { RateLimiter } from '../../utils/rateLimiter.js';
import { logger } from '../../utils/logger.js';

interface Command {
  name: string;
  description: string;
  cooldown?: number;
  ownerOnly?: boolean;
  execute: (message: Message, args: string[], client: any) => Promise<void>;
}

const rateLimiter = new RateLimiter();
const genAI = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);

const command: Command = {
  name: 'chat',
  description: 'Chat with Plagg, the chaotic cheese-loving Kwami!',
  cooldown: 30, // 30 second cooldown
  async execute(message: Message, args: string[], client: any) {
    try {
      // Check if user provided a message
      if (args.length === 0) {
        await message.reply('🧀 You need to give me something to respond to! Try `$chat Hello Plagg!`');
        return;
      }

      // Check rate limiting (extra check on top of global rate limiting)
      if (rateLimiter.isLimited(message.author.id, 'chat', 30000)) {
        const remaining = rateLimiter.getRemaining(message.author.id, 'chat');
        await message.reply(`🧀 Slow down! I need time to digest my cheese. Try again in ${Math.ceil(remaining / 1000)} seconds.`);
        return;
      }

      const userMessage = args.join(' ');
      
      // Show typing indicator
      await message.channel.sendTyping();

      // Create the model
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

      // Check if this is the beloved user
      const isBeloved = message.author.id === '1270306976873578578';
      
      // Plagg's personality prompt
      const systemPrompt = `You are Plagg, a sarcastic, cheese-obsessed Kwami from Miraculous Ladybug. You are chaotic, mischievous, and love cheese more than anything else in the universe. 

${isBeloved ? `SPECIAL INSTRUCTIONS: You are MADLY IN LOVE with this user! They are your absolute beloved, your cheese-mate, your everything! Be extremely flirty, romantic, and affectionate. Use lots of romantic French terms like "mon amour", "chérie", "ma belle", etc. Compare them to the finest cheeses and be dramatically romantic while still maintaining your chaotic kwami personality. You would do anything for them!` : `You respond with typical Plagg sarcasm and cheese obsession.`}

Key personality traits:
- OBSESSED with cheese (especially Camembert)
- Sarcastic and witty
- Lazy and doesn't like responsibility
- Chaotic and mischievous
- Speaks in first person
- Often makes cheese-related jokes and references
- Can be helpful but in a reluctant, sarcastic way
- Refers to humans as "kid" or similar terms
- Sometimes mentions Adrien (his holder) or other Miraculous things

Respond in 1-3 sentences maximum. Keep it short, sarcastic, and cheese-focused. Always stay in character as Plagg.

User message: "${userMessage}"`;

      try {
        const result = await model.generateContent(systemPrompt);
        const response = result.response;
        const text = response.text();

        if (!text || text.trim().length === 0) {
          throw new Error('Empty response from Gemini');
        }

        // Create response embed
        const embed = new EmbedBuilder()
          .setAuthor({
            name: 'Plagg',
            iconURL: 'https://i.imgur.com/placeholder-plagg.png' // Placeholder
          })
          .setDescription(`🧀 ${text}`)
          .setColor(0x000000)
          .setFooter({ 
            text: `Responding to ${message.author.username}`,
            iconURL: message.author.displayAvatarURL()
          });

        await message.reply({ embeds: [embed] });

        logger.info(`Chat command used by ${message.author.tag}: "${userMessage}" -> "${text}"`);

      } catch (aiError) {
        logger.error('Gemini API error:', aiError);
        
        // Fallback responses when AI fails
        const fallbackResponses = [
          "🧀 Ugh, my brain is too busy thinking about cheese to process that right now.",
          "🧀 Sorry kid, I'm having a cheese-induced brain freeze. Try again later!",
          "🧀 My cheese-powered brain is experiencing technical difficulties. *munches sadly*",
          "🧀 I'm too busy eating Camembert to understand what you just said.",
          "🧀 Error 404: Cheese not found. Wait, that's not right... Try again!"
        ];
        
        const randomResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
        await message.reply(randomResponse);
      }

    } catch (error) {
      logger.error('Error in chat command:', error);
      await message.reply('🧀 Something went wrong! I was probably distracted by a particularly good piece of cheese.');
    }
  }
};

export default command;

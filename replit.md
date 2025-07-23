# Replit.md

## Overview

This repository contains a TypeScript-based Discord RPG bot called "Plagg Bot - The Final Testament" with an associated web client. The bot is inspired by Isekai anime and integrates with Google's Gemini AI for interactive chat functionality. The project uses a full-stack architecture with Express.js backend, React frontend, and PostgreSQL database via Drizzle ORM.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Discord Integration**: Discord.js v14
- **AI Integration**: Google Generative AI (Gemini)
- **Session Management**: Connect-pg-simple for PostgreSQL sessions
- **Build System**: ESBuild for production builds

#### Discord Bot Structure
- **Command System**: Modular command structure organized by category (character, combat, economy, exploration, pvp, social, utility, admin)
- **Event Handling**: Centralized event handler for Discord events
- **Combat System**: Turn-based combat manager with PvP and PvE capabilities
- **Dungeon System**: Multi-floor dungeon exploration system
- **Economy**: Shop, trading, crafting, and auction house systems
- **Character Progression**: Level-based system with classes, paths, and skills

### Frontend Architecture
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Build Tool**: Vite
- **State Management**: TanStack React Query for server state
- **Routing**: Wouter for client-side routing
- **UI Components**: Radix UI primitives with custom styling

### Database Schema
- **ORM**: Drizzle with PostgreSQL dialect
- **User Management**: Basic user schema with username/password
- **Bot Data**: JSON-based data storage for game elements (items, monsters, dungeons, etc.)
- **Player Progression**: Stored in database with JSON fields for inventory, equipment, and achievements

## Key Components

### Discord Bot Systems
1. **Command Handler**: Dynamic command loading from categorized folders
2. **Combat Manager**: Handles turn-based combat encounters
3. **Dungeon Runner**: Manages multi-floor dungeon exploration
4. **Paginator**: Reusable pagination for long content
5. **Timed Event Handler**: Background processes for auctions and world events
6. **Rate Limiter**: Prevents command spam and API abuse

### Game Data Structure
- **Items**: Weapons, armor, consumables, and artifacts with rarity system
- **Monsters**: Level-based enemies with loot tables and AI behaviors
- **Dungeons**: Multi-floor adventures with various encounter types
- **Recipes**: Crafting system for item creation
- **Factions**: Player allegiance system affecting gameplay

### Web Client Features
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Component Library**: shadcn/ui for consistent UI elements
- **Toast Notifications**: User feedback system
- **Theme Support**: Dark/light mode capabilities

## Data Flow

### Discord Bot Flow
1. User sends command message
2. Command handler validates and routes to appropriate command
3. Database queries executed via Prisma client
4. Game logic processes user action
5. Response sent back to Discord channel
6. Background tasks update game state

### Web Client Flow
1. User interacts with React components
2. TanStack Query manages API calls to Express backend
3. Backend processes requests and queries database
4. Responses cached and displayed in UI
5. Real-time updates via polling or webhooks

### AI Integration Flow
1. User invokes chat command with message
2. Rate limiting applied to prevent abuse
3. Message sent to Google Gemini API with Plagg personality prompt
4. AI response processed and formatted
5. Response delivered to Discord channel

## External Dependencies

### Core Dependencies
- **Discord.js**: Discord API interaction
- **@google/genai**: Google Gemini AI integration
- **@neondatabase/serverless**: PostgreSQL connection for Neon
- **Drizzle ORM**: Type-safe database operations
- **Express.js**: Web server framework

### Development Tools
- **TypeScript**: Type safety and development experience
- **Vite**: Fast build tool and development server
- **ESBuild**: Production build optimization
- **TSX**: TypeScript execution for development

### UI Libraries
- **Radix UI**: Accessible component primitives
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library
- **TanStack React Query**: Server state management

## Deployment Strategy

### Replit Optimization
- **Keep-alive Server**: Express endpoint to prevent Replit sleeping
- **Environment Variables**: Secure storage of API keys and tokens
- **Database URL**: Dynamic configuration for database connections
- **Port Configuration**: Flexible port binding for Replit hosting

### Build Process
1. **Development**: `npm run dev` starts TSX with hot reload
2. **Production Build**: Vite builds client, ESBuild bundles server
3. **Deployment**: Single Node.js process serves both bot and web client
4. **Database**: Migrations applied via Drizzle Kit

### Configuration Management
- **Environment Variables**: Discord token, Gemini API key, database URL
- **Type-safe Config**: Zod validation for configuration values
- **Default Values**: Fallbacks for optional configuration

### Error Handling
- **Structured Logging**: Custom logger with different log levels
- **Graceful Shutdown**: Proper cleanup of database connections
- **Rate Limiting**: Prevents API abuse and maintains performance
- **JSON Validation**: Safe parsing of user data and game state

The architecture supports both the Discord bot functionality and a web interface, with the bot being the primary focus. The system is designed for easy deployment on Replit with proper configuration management and error handling.